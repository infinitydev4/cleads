import { Prisma, type RejectionReason, type TriageOutcome } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { CurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { utc } from "@/lib/ai/sql"
import { AGENT_IDS, agentLabel, type AgentId } from "@/features/ai/agents"
import { isManager } from "@/features/ai/runs"
import { SKILL_TEST } from "@/features/ai/skill-test"
import { LeadError } from "@/features/leads/errors"
import { REASON_LABELS } from "@/features/offer-pitch/labels"
import { TEAM_TARGET } from "./labels"
import { median } from "./metrics"
import { teamReplyIds } from "./team"
import { confirmationRate } from "@/features/research/service"

/**
 * The quality dashboard of Agents IA (E27, docs/crm-v1/AGENTS-IA.md §20), from what the agents did for the team over a
 * period: runs, success, cost and time per agent, and the agent's own measure of usefulness — offers kept, drafts sent
 * nearly as written, filings and verdicts confirmed by a person, targets turned into campaigns, mock-ups that pass their
 * checks, decision makers confirmed (E30). No model is called. Skill tests and evaluations are counted apart.
 */
export const PERIODS = [7, 30, 90] as const
export type Period = (typeof PERIODS)[number]

export interface Usefulness {
  label: string
  /** 0-1. */
  value: number | null
  detail: string
  samples: number
}

export interface AgentQuality {
  id: AgentId
  label: string
  runs: number
  succeeded: number
  failed: number
  stopped: number
  successRate: number | null
  costEur: number
  costPerRunEur: number | null
  medianMs: number | null
  usefulness: Usefulness | null
}

export interface ErrorGroup {
  agentId: string
  agentLabel: string
  message: string
  count: number
  lastAt: string
  runId: string
}

export interface QualityDashboard {
  days: Period
  totals: { runs: number; successRate: number | null; costEur: number; evaluationsEur: number; testsEur: number }
  agents: AgentQuality[]
  offers: { decided: number; accepted: number; rejected: number; pending: number; reasons: { reason: RejectionReason; label: string; count: number }[] }
  drafts: { created: number; sent: number; medianEdit: number | null; nearlyAsWritten: number; rewritten: number }
  replies: { confirmed: number; agreed: number; byOutcome: { outcome: TriageOutcome; cases: number; agreed: number }[]; labels: number; target: number }
  relevance: { decided: number; agreed: number; byOutcome: { outcome: TriageOutcome; cases: number; agreed: number }[] }
  errors: ErrorGroup[]
}

const TASKS = [SKILL_TEST, "evaluation"]
const OUTCOMES: TriageOutcome[] = ["AUTO", "REVIEW", "HUMAN"]
/** A draft sent with at most this share of its words changed counts as sent as written. */
const NEARLY = 0.1
const REWRITTEN = 0.5

const pct = (n: number, d: number) => (d ? n / d : null)
const words = (n: number, one: string, many: string) => `${n.toLocaleString("fr-FR")} ${n > 1 ? many : one}`

/** The first sentence of an error, without what changes from one run to the next (amounts, ids). */
export const errorKey = (message: string) =>
  message
    .split(/(?<=[.!?:])\s/)[0]
    .replace(/\d+(?:[.,]\d+)*/g, "#")
    .slice(0, 160)
    .trim()

export async function qualityDashboard(actor: CurrentUser, days: Period = 30, now = new Date()): Promise<QualityDashboard> {
  if (!can(actor.role, "ai:use") || !isManager(actor)) throw new LeadError("forbidden", "La qualité de l'IA est suivie par le propriétaire et les managers.", 403)
  const ws = actor.workspaceId
  const since = new Date(now.getTime() - days * 86_400_000)
  const kind = Prisma.sql`COALESCE("input"->>'kind', '')`

  const [runs, tasks, failures, recs, reasons, drafts, triages, relevances, targets, versions, audits, labels] = await Promise.all([
    prisma.$queryRaw<{ agentId: string; status: string; n: number; cost: bigint; medianMs: number | null }[]>`
      SELECT "agentId", "status"::text AS "status", COUNT(*)::int AS n, COALESCE(SUM("costMicros"), 0)::bigint AS cost,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("finishedAt" - "startedAt")) * 1000) AS "medianMs"
        FROM "AgentRun"
       WHERE "workspaceId" = ${ws} AND "createdAt" >= ${utc(since)} AND ${kind} NOT IN (${Prisma.join(TASKS)})
       GROUP BY "agentId", "status"`,
    prisma.$queryRaw<{ kind: string; cost: bigint }[]>`
      SELECT ${kind} AS kind, COALESCE(SUM("costMicros"), 0)::bigint AS cost
        FROM "AgentRun"
       WHERE "workspaceId" = ${ws} AND "createdAt" >= ${utc(since)} AND ${kind} IN (${Prisma.join(TASKS)})
       GROUP BY 1`,
    prisma.agentRun.findMany({
      where: { workspaceId: ws, createdAt: { gte: since }, status: { in: ["FAILED", "EXPIRED", "BUDGET_EXCEEDED"] }, error: { not: null } },
      select: { id: true, agentId: true, error: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.offerRecommendation.groupBy({ by: ["status"], where: { workspaceId: ws, createdAt: { gte: since } }, _count: true }),
    prisma.offerRecommendation.groupBy({ by: ["reason"], where: { workspaceId: ws, createdAt: { gte: since }, status: "REJECTED" }, _count: true }),
    prisma.emailDraft.findMany({ where: { workspaceId: ws, createdAt: { gte: since } }, select: { sentAt: true, editRatio: true }, take: 5_000 }),
    prisma.replyTriage.findMany({ where: { workspaceId: ws, createdAt: { gte: since } }, select: { replyClass: true, outcome: true, email: { select: { replyClass: true } } }, take: 5_000 }),
    prisma.leadRelevance.findMany({ where: { workspaceId: ws, createdAt: { gte: since } }, select: { verdict: true, outcome: true, decision: true }, take: 5_000 }),
    prisma.strategyTarget.groupBy({ by: ["status"], where: { proposal: { workspaceId: ws }, createdAt: { gte: since } }, _count: true }),
    prisma.generatedSiteVersion.findMany({ where: { site: { workspaceId: ws }, createdAt: { gte: since }, runId: { not: null } }, select: { checks: true }, take: 1_000 }),
    prisma.prospectAudit.groupBy({ by: ["status"], where: { workspaceId: ws, createdAt: { gte: since } }, _count: true }),
    teamReplyIds(ws, 1_000),
  ])

  // ── Usefulness, per agent ──
  const recCount = (s: string) => recs.find((r) => r.status === s)?._count ?? 0
  const accepted = recCount("ACCEPTED")
  const rejected = recCount("REJECTED")
  const sent = drafts.filter((d) => d.sentAt && d.editRatio != null).map((d) => d.editRatio!)
  const confirmedTriages = triages.filter((t) => t.email.replyClass)
  const agreedTriages = confirmedTriages.filter((t) => t.replyClass === t.email.replyClass)
  const decidedRel = relevances.filter((r) => r.decision)
  const agreedRel = decidedRel.filter((r) => r.verdict === r.decision)
  const targetCount = (s: string) => targets.find((t) => t.status === s)?._count ?? 0
  const adopted = targetCount("CAMPAIGN") + targetCount("LAUNCHED")
  const dismissed = targetCount("DISMISSED")
  const passed = versions.filter((v) => (v.checks as { passed?: unknown } | null)?.passed === true).length
  const auditCount = (s: string) => audits.find((a) => a.status === s)?._count ?? 0
  const complete = auditCount("COMPLETE")
  const allAudits = audits.reduce((s, a) => s + a._count, 0)

  const people = await confirmationRate(ws, since)
  const usefulness: Partial<Record<AgentId, Usefulness>> = {
    auditor: { label: "Audits complets", value: pct(complete, allAudits), detail: `${words(complete, "complet", "complets")} sur ${words(allAudits, "audit", "audits")} ; les autres sont partiels (site illisible, PageSpeed indisponible)`, samples: allAudits },
    offers: { label: "Offres retenues", value: pct(accepted, accepted + rejected), detail: `${words(accepted, "offre retenue", "offres retenues")}, ${words(rejected, "écartée", "écartées")} par les closers`, samples: accepted + rejected },
    writer: {
      label: "Envoyés presque tels quels",
      value: pct(sent.filter((r) => r <= NEARLY).length, sent.length),
      detail: sent.length ? `retouche médiane de ${Math.round(median(sent)! * 100)} % sur ${words(sent.length, "brouillon envoyé", "brouillons envoyés")}` : "aucun brouillon envoyé",
      samples: sent.length,
    },
    replies: { label: "Classements confirmés", value: pct(agreedTriages.length, confirmedTriages.length), detail: `${words(agreedTriages.length, "réponse classée", "réponses classées")} comme Jev le proposait, sur ${words(confirmedTriages.length, "classée par une personne", "classées par une personne")}`, samples: confirmedTriages.length },
    qualifier: { label: "Jugements confirmés", value: pct(agreedRel.length, decidedRel.length), detail: `${words(agreedRel.length, "fiche jugée", "fiches jugées")} comme Jev, sur ${words(decidedRel.length, "tranchée", "tranchées")} par une personne`, samples: decidedRel.length },
    strategist: { label: "Cibles retenues", value: pct(adopted, adopted + dismissed), detail: `${words(adopted, "cible devenue campagne", "cibles devenues campagnes")}, ${words(dismissed, "écartée", "écartées")}`, samples: adopted + dismissed },
    designer: { label: "Maquettes conformes", value: pct(passed, versions.length), detail: `${words(passed, "version passe", "versions passent")} les contrôles (critique, axe-core, balisage) sur ${versions.length}`, samples: versions.length },
    researcher: { label: "Décideurs confirmés", value: people.rate, detail: `${words(people.confirmed, "profil confirmé", "profils confirmés")} d'un clic, ${words(people.dismissed, "écarté", "écartés")}`, samples: people.confirmed + people.dismissed },
  }

  // ── Runs, per agent ──
  const agents = AGENT_IDS.map((id): AgentQuality => {
    const mine = runs.filter((r) => r.agentId === id)
    const count = (statuses: string[]) => mine.filter((r) => statuses.includes(r.status)).reduce((s, r) => s + r.n, 0)
    const total = mine.reduce((s, r) => s + r.n, 0)
    const succeeded = count(["SUCCEEDED"])
    const failed = count(["FAILED", "EXPIRED", "BUDGET_EXCEEDED"])
    const cost = mine.reduce((s, r) => s + Number(r.cost), 0)
    const ended = succeeded + failed
    return {
      id,
      label: agentLabel(id),
      runs: total,
      succeeded,
      failed,
      stopped: count(["CANCELLED"]),
      successRate: pct(succeeded, ended),
      costEur: cost / 1_000_000,
      costPerRunEur: total ? cost / total / 1_000_000 : null,
      medianMs: mine.find((r) => r.status === "SUCCEEDED")?.medianMs ?? null,
      usefulness: usefulness[id] ?? null,
    }
  })

  // ── Errors, grouped by what they say ──
  const groups = new Map<string, ErrorGroup>()
  for (const f of failures) {
    const message = errorKey(f.error!)
    const key = `${f.agentId}\n${message}`
    const g = groups.get(key)
    if (g) g.count++
    else groups.set(key, { agentId: f.agentId, agentLabel: agentLabel(f.agentId), message: f.error!.split(/(?<=[.!?])\s/)[0].slice(0, 240), count: 1, lastAt: f.createdAt.toISOString(), runId: f.id })
  }

  const totalRuns = agents.reduce((s, a) => s + a.runs, 0)
  const totalSucceeded = agents.reduce((s, a) => s + a.succeeded, 0)
  const totalFailed = agents.reduce((s, a) => s + a.failed, 0)
  const taskCost = (k: string) => Number(tasks.find((t) => t.kind === k)?.cost ?? 0) / 1_000_000
  const byOutcome = <T extends { outcome: TriageOutcome }>(rows: T[], agreed: (r: T) => boolean) => OUTCOMES.map((outcome) => ({ outcome, cases: rows.filter((r) => r.outcome === outcome).length, agreed: rows.filter((r) => r.outcome === outcome && agreed(r)).length }))
  return {
    days,
    totals: { runs: totalRuns, successRate: pct(totalSucceeded, totalSucceeded + totalFailed), costEur: agents.reduce((s, a) => s + a.costEur, 0), evaluationsEur: taskCost("evaluation"), testsEur: taskCost(SKILL_TEST) },
    agents,
    offers: { decided: accepted + rejected, accepted, rejected, pending: recCount("SUGGESTED"), reasons: reasons.filter((r) => r.reason).map((r) => ({ reason: r.reason!, label: REASON_LABELS[r.reason!], count: r._count })).sort((a, b) => b.count - a.count) },
    drafts: { created: drafts.length, sent: sent.length, medianEdit: median(sent), nearlyAsWritten: sent.filter((r) => r <= NEARLY).length, rewritten: sent.filter((r) => r >= REWRITTEN).length },
    replies: { confirmed: confirmedTriages.length, agreed: agreedTriages.length, byOutcome: byOutcome(confirmedTriages, (t) => t.replyClass === t.email.replyClass), labels: labels.length, target: TEAM_TARGET },
    relevance: { decided: decidedRel.length, agreed: agreedRel.length, byOutcome: byOutcome(decidedRel, (r) => r.verdict === r.decision) },
    errors: [...groups.values()].sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt)).slice(0, 12),
  }
}
