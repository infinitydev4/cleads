import type { AgentRunStatus, Prisma } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { ACTIVE_RUN_STATUSES, eurToMicros, getAiSettings, microsToEur, type AiSettings } from "@/lib/ai/budget"
import { AI_ROLES, ROLES, modelLabel, resolveRole, type AiRole } from "@/lib/ai/models"
import { costMicros, formatPrice, priceTable, type ModelPrice } from "@/lib/ai/pricing"
import { BRIEFS } from "@/evals/briefs"
import { scenarioById } from "@/evals/copilot"
import { AUDITS } from "@/evals/audits"
import { CAMPAIGNS, FICHES } from "@/evals/fiches"
import { REPLIES } from "@/evals/replies"
import { SITES } from "@/evals/sites"
import { effectiveAgent } from "@/features/ai/definitions"
import { isManager, startRun } from "@/features/ai/runs"
import { LeadError } from "@/features/leads/errors"
import { isDecisionModel } from "./cases/decisions"
import { JUDGE_MODEL, RULES, SUITE_IDS, SUITES_INFO, TEAM_MIN_CASES, contenderLabel, type ContenderResult, type EvaluationSource, type SuiteId, type SuiteInfo } from "./labels"
import { compare, type Comparison } from "./metrics"
import { EVALUATION, resultsFrom } from "./run"
import { modelEvidence, type ModelEvidence } from "./gate"
import { suitesUsing } from "./roles"
import { SUITES, contenderChoices } from "./suites"
import { TEAM_PREFIX, teamCaseIds } from "./team"

/**
 * Evaluations for people (E27): what each suite can compare and what it would cost, launching one, its progress and its
 * results. Owners and managers see and launch them (skill:manage: they change the agents' instructions, and a change
 * worth making is a change measured); the owner alone changes a model (features/quality/gate.ts).
 */
/** Above this, an evaluation is refused: a quick sample or fewer models say enough. */
const MAX_ESTIMATE_MICROS = eurToMicros(20)
/** The run reserves the estimate and a margin: models reason more on some cases than the averages say. */
const capFor = (estimate: number) => Math.max(eurToMicros(0.02), Math.ceil(estimate * 1.5) + eurToMicros(0.05))

export const canEvaluate = (actor: CurrentUser) => can(actor.role, "skill:manage")

function assertViewer(actor: CurrentUser) {
  if (!can(actor.role, "ai:use") || !isManager(actor)) throw new LeadError("forbidden", "La qualité de l'IA est suivie par le propriétaire et les managers.", 403)
}

// ── Cases ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** One line saying which case it is, for the results table. */
export function caseTitle(suite: SuiteId, caseId: string): string {
  if (caseId.startsWith(TEAM_PREFIX)) return suite === "replies" ? "Réponse classée par l'équipe" : "Fiche jugée par l'équipe"
  switch (suite) {
    case "auditor": {
      const s = SITES.find((x) => x.id === caseId)
      return s ? `${s.name} — ${s.about}` : caseId
    }
    case "offers":
    case "writer": {
      const a = AUDITS.find((x) => x.id === caseId)
      return a ? `${a.company.name} — ${a.about}` : caseId
    }
    case "replies": {
      const r = REPLIES.find((x) => x.id === caseId)
      return r ? `« ${r.body.replace(/\s+/g, " ").slice(0, 70)}${r.body.length > 70 ? "…" : ""} »` : caseId
    }
    case "qualifier": {
      const f = FICHES.find((x) => x.id === caseId)
      return f ? `${f.company.name} — ${CAMPAIGNS[f.campaign].name}` : caseId
    }
    case "designer": {
      const b = BRIEFS.find((x) => x.id === caseId)
      return b ? `${b.company} — ${b.about}` : caseId
    }
    case "copilot": {
      const s = scenarioById(caseId)
      return s ? `${s.about} — « ${s.ask} »` : caseId
    }
  }
}

// ── Costs ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** What one case costs for one contender: its own calls, the other steps' models as they are today, the judge's. */
export function perCaseMicros(suite: SuiteId, role: AiRole, contender: string, settings: Pick<AiSettings, "roleModels" | "eurPerUsd">, prices: Record<string, ModelPrice>): number {
  const profile = SUITES[suite].profile(role, contender)
  const priced = (model: string, call: { input: number; output: number }) => costMicros(prices[model], { inputTokens: call.input, outputTokens: call.output, cacheReadTokens: 0, cacheWriteTokens: 0 }, settings.eurPerUsd).micros
  const own = contender === RULES ? 0 : profile.own.reduce((s, call) => s + priced(contender, call), 0)
  const others = profile.others.reduce((s, o) => s + priced(o.role === "judge" ? JUDGE_MODEL : resolveRole(o.role, settings.roleModels).model, o.call), 0)
  return own + others
}

// ── Views ────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ContenderOption {
  id: string
  label: string
  kind: "decision" | "language" | "rules"
  price: string
  /** Estimated cost of one case, in micro-euros. */
  perCaseMicros: number
}

export interface RoleOption {
  id: AiRole
  label: string
  /** The model in service for this role: always the first contender. */
  current: string
  contenders: ContenderOption[]
}

export interface EvaluationView {
  id: string
  suite: SuiteId
  suiteLabel: string
  role: AiRole
  roleLabel: string
  source: EvaluationSource
  quick: boolean
  cases: number
  contenders: { id: string; label: string }[]
  status: AgentRunStatus | null
  runId: string | null
  createdAt: string
  finishedAt: string | null
  requestedBy: string | null
  estimateEur: number
  costEur: number
  done: number
  results: ContenderResult[] | null
  /** Each other contender against the first one, the model in service. */
  comparisons: Record<string, Comparison>
  /** The reference set changed since: the figures stay, but no longer stand as proof. */
  outdated: boolean
  agentVersion: number
}

export interface SuiteView {
  id: SuiteId
  info: SuiteInfo
  agentRole: AiRole
  cases: { full: number; quick: number; team: number | null }
  roles: RoleOption[]
  latest: EvaluationView | null
  active: EvaluationView | null
}

export interface QualityPage {
  suites: SuiteView[]
  recent: EvaluationView[]
  canEvaluate: boolean
  judge: { id: string; label: string }
}

const evaluationInclude = {
  run: { select: { status: true, costMicros: true } },
  requestedBy: { select: { name: true, email: true } },
  _count: { select: { cases: true } },
} satisfies Prisma.AiEvaluationInclude

type EvaluationRow = Prisma.AiEvaluationGetPayload<{ include: typeof evaluationInclude }>

async function viewOf(row: EvaluationRow, withCases?: { contender: string; ok: boolean; score: number | null; detail: unknown; error: string | null; costMicros: number; judgeMicros: number; durationMs: number }[]): Promise<EvaluationView> {
  const suite = row.suite as SuiteId
  const stored = Array.isArray(row.results) ? (row.results as unknown as ContenderResult[]) : null
  // A stopped evaluation keeps what it measured: its figures are computed from its saved cases.
  const cases = stored ? null : (withCases ?? (await prisma.aiEvaluationCase.findMany({ where: { evaluationId: row.id }, select: { contender: true, ok: true, score: true, detail: true, error: true, costMicros: true, judgeMicros: true, durationMs: true } })))
  const results = stored ?? (cases && cases.length ? resultsFrom(suite, row.contenders, cases) : null)
  const baseline = results?.[0]
  const comparisons = Object.fromEntries((results ?? []).slice(1).map((r) => [r.contender, compare(baseline!, r)]))
  return {
    id: row.id,
    suite,
    suiteLabel: SUITES_INFO[suite]?.label ?? row.suite,
    role: row.role as AiRole,
    roleLabel: ROLES[row.role as AiRole]?.label ?? row.role,
    source: row.source as EvaluationSource,
    quick: row.source === "reference" && row.caseIds.length < SUITES[suite].cases.length,
    cases: row.caseIds.length,
    contenders: row.contenders.map((id) => ({ id, label: contenderLabel(id, modelLabel) })),
    status: row.run?.status ?? null,
    runId: row.runId,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    requestedBy: row.requestedBy?.name ?? row.requestedBy?.email ?? null,
    estimateEur: microsToEur(row.estimateMicros),
    costEur: microsToEur(row.run?.costMicros ?? 0),
    done: row._count.cases,
    results,
    comparisons,
    outdated: row.source === "reference" && row.datasetVersion !== SUITES[suite].version,
    agentVersion: row.agentVersion,
  }
}

const roleOption = (suite: SuiteId, role: AiRole, agentRole: AiRole, settings: AiSettings, prices: Record<string, ModelPrice>): RoleOption => {
  const current = resolveRole(role, settings.roleModels).model
  const choices = contenderChoices(suite, role, agentRole)
  const ordered = [current, ...choices.filter((c) => c !== current)]
  return {
    id: role,
    label: ROLES[role].label,
    current,
    contenders: ordered.map((id) => ({
      id,
      label: contenderLabel(id, modelLabel),
      kind: id === RULES ? "rules" : isDecisionModel(id) ? "decision" : "language",
      price: id === RULES ? "gratuit" : formatPrice(prices[id]),
      perCaseMicros: perCaseMicros(suite, role, id, settings, prices),
    })),
  }
}

export async function qualityPage(actor: CurrentUser): Promise<QualityPage> {
  assertViewer(actor)
  const [settings, prices, rows] = await Promise.all([
    getAiSettings(actor.workspaceId),
    priceTable(),
    prisma.aiEvaluation.findMany({ where: { workspaceId: actor.workspaceId }, include: evaluationInclude, orderBy: { createdAt: "desc" }, take: 40 }),
  ])
  const views = await Promise.all(rows.map((r) => viewOf(r)))
  const suites = await Promise.all(
    SUITE_IDS.map(async (id): Promise<SuiteView> => {
      const agentRole = (await effectiveAgent(actor.workspaceId, id)).modelRole
      const team = SUITES[id].info.team ? (await teamCaseIds(actor.workspaceId, id)).length : null
      const mine = views.filter((v) => v.suite === id)
      return {
        id,
        info: SUITES[id].info,
        agentRole,
        cases: { full: SUITES[id].cases.length, quick: SUITES[id].quick.length, team },
        roles: SUITES[id].roles(agentRole).map((role) => roleOption(id, role, agentRole, settings, prices)),
        latest: mine.find((v) => v.status === "SUCCEEDED") ?? null,
        active: mine.find((v) => v.status && (ACTIVE_RUN_STATUSES as readonly string[]).includes(v.status)) ?? null,
      }
    })
  )
  return { suites, recent: views.slice(0, 20), canEvaluate: canEvaluate(actor), judge: { id: JUDGE_MODEL, label: modelLabel(JUDGE_MODEL) } }
}

export interface CaseView {
  contender: string
  caseId: string
  title: string
  ok: boolean
  score: number | null
  detail: unknown
  error: string | null
  costEur: number
  judgeEur: number
  durationMs: number
}

export interface EvaluationDetail extends EvaluationView {
  caseRows: CaseView[]
}

export async function evaluationDetail(actor: CurrentUser, id: string): Promise<EvaluationDetail> {
  assertViewer(actor)
  const row = await prisma.aiEvaluation.findFirst({ where: { id, workspaceId: actor.workspaceId }, include: evaluationInclude })
  if (!row) throw new LeadError("not_found", "Évaluation introuvable", 404)
  const cases = await prisma.aiEvaluationCase.findMany({ where: { evaluationId: id }, orderBy: { createdAt: "asc" } })
  const order = new Map(row.caseIds.map((c, i) => [c, i]))
  const suite = row.suite as SuiteId
  return {
    ...(await viewOf(row, cases)),
    caseRows: cases
      .sort((a, b) => (order.get(a.caseId) ?? 0) - (order.get(b.caseId) ?? 0) || row.contenders.indexOf(a.contender) - row.contenders.indexOf(b.contender))
      .map((c) => ({ contender: c.contender, caseId: c.caseId, title: caseTitle(suite, c.caseId), ok: c.ok, score: c.score, detail: c.detail, error: c.error, costEur: microsToEur(c.costMicros), judgeEur: microsToEur(c.judgeMicros), durationMs: c.durationMs })),
  }
}

// ── Launch ───────────────────────────────────────────────────────────────────────────────────────────────────────

export const startEvaluationSchema = z
  .object({
    suite: z.enum(SUITE_IDS),
    role: z.enum(AI_ROLES),
    /** Models to compare with the one in service, which is always included first. */
    contenders: z.array(z.string().min(1).max(80)).max(3, "Trois modèles au plus à comparer avec celui en service"),
    sample: z.enum(["quick", "full"]).default("quick"),
    source: z.enum(["reference", "team"]).default("reference"),
  })
  .strict()
export type StartEvaluationInput = z.input<typeof startEvaluationSchema>

export async function startEvaluation(actor: CurrentUser, raw: StartEvaluationInput, ip?: string | null): Promise<EvaluationView> {
  if (!canEvaluate(actor)) throw new LeadError("forbidden", "Le propriétaire et les managers lancent les évaluations.", 403)
  const input = startEvaluationSchema.parse(raw)
  const suite = SUITES[input.suite]
  const agent = await effectiveAgent(actor.workspaceId, input.suite)
  if (!suite.roles(agent.modelRole).includes(input.role)) throw new LeadError("invalid", `${suite.info.label} n'utilise pas le rôle « ${ROLES[input.role].label} ».`, 400)
  const [settings, prices] = await Promise.all([getAiSettings(actor.workspaceId), priceTable()])
  const current = resolveRole(input.role, settings.roleModels).model
  const allowed = contenderChoices(input.suite, input.role, agent.modelRole)
  const contenders = [...new Set([current, ...input.contenders])]
  const unknown = contenders.find((c) => !allowed.includes(c))
  if (unknown) throw new LeadError("invalid", `« ${unknown} » ne peut pas être comparé pour ce rôle.`, 400)

  let caseIds: string[]
  let datasetVersion: string
  if (input.source === "team") {
    if (!suite.info.team) throw new LeadError("invalid", `${suite.info.label} n'a pas de cas étiquetés par l'équipe.`, 400)
    caseIds = await teamCaseIds(actor.workspaceId, input.suite)
    if (caseIds.length < TEAM_MIN_CASES) throw new LeadError("conflict", `Il faut au moins ${TEAM_MIN_CASES} cas étiquetés par l'équipe (${caseIds.length} pour l'instant).`, 409)
    datasetVersion = `team:${new Date().toISOString().slice(0, 10)}:${caseIds.length}`
  } else {
    caseIds = [...(input.sample === "quick" ? suite.quick : suite.cases)]
    datasetVersion = suite.version
  }

  const estimateMicros = contenders.reduce((s, c) => s + perCaseMicros(input.suite, input.role, c, settings, prices) * caseIds.length, 0)
  if (estimateMicros > MAX_ESTIMATE_MICROS) throw new LeadError("invalid", "Cette évaluation coûterait plus de 20 € : prenez l'échantillon rapide ou moins de modèles.", 400)
  const busy = await prisma.aiEvaluation.count({ where: { workspaceId: actor.workspaceId, suite: input.suite, run: { status: { in: [...ACTIVE_RUN_STATUSES] } } } })
  if (busy) throw new LeadError("conflict", `Une évaluation de ${suite.info.label} est déjà en cours : attendez qu'elle finisse.`, 409)

  const evaluation = await prisma.aiEvaluation.create({
    data: {
      workspaceId: actor.workspaceId,
      suite: input.suite,
      role: input.role,
      contenders,
      source: input.source,
      datasetVersion,
      caseIds,
      agentVersion: agent.version,
      judgeModel: suite.profile(input.role, current).others.some((o) => o.role === "judge") ? JUDGE_MODEL : null,
      estimateMicros,
      requestedById: actor.id,
    },
  })
  try {
    // Work for the team goes first: an evaluation waits behind the agent's real runs.
    const run = await startRun(actor, { agentId: input.suite, status: "QUEUED", priority: -1, input: { kind: EVALUATION, evaluationId: evaluation.id }, evaluation: { capMicros: capFor(estimateMicros) } })
    await prisma.aiEvaluation.update({ where: { id: evaluation.id }, data: { runId: run.id } })
  } catch (error) {
    await prisma.aiEvaluation.delete({ where: { id: evaluation.id } })
    throw error
  }
  await audit({
    action: "ai.evaluation_started",
    actorId: actor.id,
    workspaceId: actor.workspaceId,
    entityType: "AiEvaluation",
    entityId: evaluation.id,
    metadata: { suite: input.suite, role: input.role, contenders, source: input.source, cases: caseIds.length, estimateMicros },
    ip,
  })
  const row = await prisma.aiEvaluation.findUniqueOrThrow({ where: { id: evaluation.id }, include: evaluationInclude })
  return viewOf(row, [])
}

// ── Proof for a change of model ──────────────────────────────────────────────────────────────────────────────────

export const evidenceQuerySchema = z.union([
  z.object({ role: z.enum(AI_ROLES), model: z.string().min(1).max(80) }).strict(),
  z.object({ agent: z.enum(SUITE_IDS), role: z.enum(AI_ROLES) }).strict(),
])

/**
 * What the settings screen shows before a change (features/quality/gate.ts): for a role and a model, the suites the
 * role touches; for an agent moved to another role, its own suite, measured with that role's model.
 */
export async function evidenceFor(actor: CurrentUser, query: z.infer<typeof evidenceQuerySchema>): Promise<ModelEvidence> {
  if (!can(actor.role, "ai:manage")) throw new LeadError("forbidden", "Seul le propriétaire change les modèles.", 403)
  if ("agent" in query) {
    const [agent, settings] = await Promise.all([effectiveAgent(actor.workspaceId, query.agent), getAiSettings(actor.workspaceId)])
    return modelEvidence(actor.workspaceId, { role: agent.modelRole, model: resolveRole(query.role, settings.roleModels).model, suites: [query.agent] })
  }
  const agentRoles = Object.fromEntries(await Promise.all(SUITE_IDS.map(async (id) => [id, (await effectiveAgent(actor.workspaceId, id)).modelRole] as const)))
  return modelEvidence(actor.workspaceId, { role: query.role, model: query.model, suites: suitesUsing(query.role, agentRoles) })
}
