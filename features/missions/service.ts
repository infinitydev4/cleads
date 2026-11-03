import type { AgentMission, AgentMissionSchedule, AgentMissionStep, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { ACTIVE_RUN_STATUSES, eurToMicros, getAiSettings, microsToEur } from "@/lib/ai/budget"
import { LeadError } from "@/features/leads/errors"
import { cancelSearch } from "@/features/search/service"
import { agentLabel } from "@/features/ai/agents"
import { effectiveAgent } from "@/features/ai/definitions"
import { taskKindOf } from "@/features/ai/handlers"
import { finishRun, isManager } from "@/features/ai/runs"
import type { AgentPolicy } from "@/features/ai/actions/policy"
import { sortCounts } from "./actions"
import { MISSION_ACTION, requesterOf } from "./engine"
import { STEP_STATE_OF, type MissionDetail, type MissionStepView, type MissionView, type ScheduleView, type StepState } from "./labels"
import { notifyMission, publishMission } from "./notify"
import { checkPlan, stepNumber, type PlanCheck } from "./plan"
import { describeRecurrence, nextOccurrence } from "./recurrence"
import type { CheckedPlan, MissionRequest, Recurrence, ScheduleRequest } from "./schemas"

/**
 * Missions in the CRM (E28, docs/crm-v1/AGENTS-IA.md §17): proposing a plan, launching it in one click (D28), following
 * it, pausing, resuming and cancelling it, and the recurring ones (D35). The worker carries them out
 * (features/missions/engine.ts).
 */
export const PROPOSAL_TTL_MS = 24 * 3600_000
export const MAX_ACTIVE_SCHEDULES = 3
/** Occurrences that could not run, in a row, before a recurring mission pauses. */
export const SCHEDULE_FAILURES = 2

const eur = (micros: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(micros / 1_000_000)
const record = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const who = (u: { name: string | null; email: string | null } | null) => u?.name ?? u?.email ?? null
/** A pause's reason is written to follow « « titre » : » in a notification; the card starts it with a capital. */
const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

function forbidden(message: string) {
  return new LeadError("forbidden", message, 403)
}

async function load(actor: CurrentUser, id: string) {
  const m = await prisma.agentMission.findFirst({ where: { id, workspaceId: actor.workspaceId, ...(isManager(actor) ? {} : { requestedById: actor.id }) } })
  if (!m) throw new LeadError("not_found", "Mission introuvable.", 404)
  return m
}

// ---------------------------------------------------------------------------------------------------------------
// Proposing and launching
// ---------------------------------------------------------------------------------------------------------------

/** The plan is checked and kept as a proposal; nothing runs before the person's click. */
export async function proposeMission(user: CurrentUser, policy: AgentPolicy, raw: unknown, opts: { conversationId?: string | null } = {}): Promise<{ mission: AgentMission; check: PlanCheck }> {
  if (!can(user.role, "ai:use")) throw forbidden("Votre rôle ne permet pas d'utiliser l'IA.")
  const check = await checkPlan(user, policy, raw)
  const settings = await getAiSettings(user.workspaceId)
  const mission = await prisma.agentMission.create({
    data: {
      workspaceId: user.workspaceId,
      requestedById: user.id,
      title: check.plan.title,
      plan: check.plan as unknown as Prisma.InputJsonValue,
      probableMicros: check.probableMicros,
      maxMicros: check.maxMicros,
      capMicros: settings.missionCapMicros,
      conversationId: opts.conversationId ?? null,
      expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS),
    },
  })
  await audit({ action: "ai.mission_proposed", actorId: user.id, workspaceId: user.workspaceId, entityType: "AgentMission", entityId: mission.id, metadata: { steps: check.plan.steps.map((s) => s.action), maxMicros: check.maxMicros } })
  return { mission, check }
}

/** A proposal ends at the next question of its conversation: the click goes with the latest context. */
export async function expireProposals(conversationId: string): Promise<number> {
  const res = await prisma.agentMission.updateMany({ where: { conversationId, status: "PROPOSED" }, data: { status: "EXPIRED", expiresAt: new Date() } })
  return res.count
}

/** The cap a person may give a second time: the plan's most, rounded up to the half euro. */
export const confirmCapEur = (maxMicros: number) => Math.ceil(maxMicros / 500_000) / 2

async function approve(actor: CurrentUser, m: AgentMission, capEur: number | undefined): Promise<void> {
  if (m.requestedById !== actor.id) throw forbidden("Seule la personne qui a demandé ce plan peut le lancer.")
  const now = new Date()
  if (m.status === "PROPOSED" && m.expiresAt && m.expiresAt <= now) await prisma.agentMission.updateMany({ where: { id: m.id, status: "PROPOSED" }, data: { status: "EXPIRED" } })
  if (m.status !== "PROPOSED" || (m.expiresAt && m.expiresAt <= now)) throw new LeadError("conflict", m.status === "PROPOSED" || m.status === "EXPIRED" ? "Ce plan a expiré : redemandez-le au copilote." : "Ce plan n'attend plus de lancement.", 409)
  const copilot = await effectiveAgent(actor.workspaceId, "copilot")
  if (!copilot.enabled) throw new LeadError("conflict", "Le Copilote est désactivé dans cet espace : le propriétaire peut le réactiver dans Agents IA.", 409)
  // The rights of now, not those of the proposal.
  const check = await checkPlan(actor, copilot.policy, m.plan)
  const settings = await getAiSettings(actor.workspaceId)
  let cap = settings.missionCapMicros
  if (check.maxMicros > cap) {
    const given = capEur === undefined ? 0 : eurToMicros(capEur)
    if (given < check.maxMicros) {
      throw new LeadError("conflict", `Ce plan peut coûter jusqu'à ${eur(check.maxMicros)}, au-delà du plafond de ${eur(cap)} par mission : confirmez-le une seconde fois.`, 409, { capEur: confirmCapEur(check.maxMicros) })
    }
    cap = given
  }
  const recurrence = check.plan.recurrence
  if (recurrence && (await prisma.agentMissionSchedule.count({ where: { requestedById: actor.id, status: "ACTIVE" } })) >= MAX_ACTIVE_SCHEDULES) {
    throw new LeadError("conflict", `Vous avez déjà ${MAX_ACTIVE_SCHEDULES} missions récurrentes actives : arrêtez-en une dans Agents IA › Missions.`, 409)
  }
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.agentMission.updateMany({
      where: { id: m.id, status: "PROPOSED" },
      data: { status: "RUNNING", approvedAt: now, startedAt: now, capMicros: cap, plan: check.plan as unknown as Prisma.InputJsonValue, probableMicros: check.probableMicros, maxMicros: check.maxMicros, wakeAt: now, expiresAt: null },
    })
    if (claimed.count !== 1) throw new LeadError("conflict", "Ce plan n'attend plus de lancement.", 409)
    if (recurrence) {
      // The first pass runs now; the next ones follow the schedule.
      const schedule = await tx.agentMissionSchedule.create({
        data: { workspaceId: actor.workspaceId, requestedById: actor.id, title: check.plan.title, plan: check.plan as unknown as Prisma.InputJsonValue, recurrence, capMicros: cap, nextRunAt: nextOccurrence(recurrence, now) },
      })
      await tx.agentMission.update({ where: { id: m.id }, data: { scheduleId: schedule.id } })
    }
  })
  await audit({ action: "ai.mission_approved", actorId: actor.id, workspaceId: actor.workspaceId, entityType: "AgentMission", entityId: m.id, metadata: { capMicros: cap, maxMicros: check.maxMicros, recurring: !!recurrence } })
}

// ---------------------------------------------------------------------------------------------------------------
// Pausing, resuming, cancelling
// ---------------------------------------------------------------------------------------------------------------

/** Stops what the mission started and is still running: searches, runs, clicks waited for. What is done stays. */
async function stopWork(actor: CurrentUser, m: AgentMission): Promise<void> {
  const now = new Date()
  const waiting = await prisma.agentMissionStep.findMany({ where: { missionId: m.id, status: "WAITING", waitKind: "search" }, select: { waitId: true } })
  for (const w of waiting) if (w.waitId) await cancelSearch(actor, w.waitId).catch(() => undefined)
  const runs = await prisma.agentRun.findMany({ where: { missionId: m.id, status: { in: [...ACTIVE_RUN_STATUSES] } }, select: { id: true } })
  for (const r of runs) {
    await prisma.agentApproval.updateMany({ where: { runId: r.id, status: "PENDING" }, data: { status: "REJECTED", decidedById: actor.id, decidedAt: now, note: "Mission annulée" } })
    await finishRun(r.id, { status: "CANCELLED", error: "Mission annulée" })
  }
  await prisma.agentMissionStep.updateMany({ where: { missionId: m.id, status: { in: ["PENDING", "WAITING", "FAILED", "UNCERTAIN"] } }, data: { status: "CANCELLED", finishedAt: now } })
}

export async function actOnMission(actor: CurrentUser, id: string, request: MissionRequest): Promise<MissionView> {
  if (!can(actor.role, "ai:use")) throw forbidden("Votre rôle ne permet pas d'utiliser l'IA.")
  const m = await load(actor, id)
  const mine = m.requestedById === actor.id
  const now = new Date()
  switch (request.action) {
    case "approve":
      await approve(actor, m, request.capEur)
      break
    case "refuse": {
      if (!mine) throw forbidden("Seule la personne qui a demandé ce plan peut le refuser.")
      const res = await prisma.agentMission.updateMany({ where: { id: m.id, status: "PROPOSED" }, data: { status: "REFUSED", finishedAt: now } })
      if (res.count !== 1) throw new LeadError("conflict", "Ce plan n'attend plus de réponse.", 409)
      break
    }
    case "pause": {
      if (!mine && !isManager(actor)) throw forbidden("Seule la personne qui l'a lancée, un manager ou le propriétaire peut mettre cette mission en pause.")
      const res = await prisma.agentMission.updateMany({ where: { id: m.id, status: "RUNNING" }, data: { status: "PAUSED", pauseKind: "person", pauseReason: `Mise en pause par ${actor.name || actor.email}.` } })
      if (res.count !== 1) throw new LeadError("conflict", "Cette mission n'est pas en cours.", 409)
      break
    }
    case "resume": {
      if (!mine) throw forbidden("Seule la personne qui l'a lancée peut reprendre cette mission : elle travaille avec ses droits et son quota.")
      if (m.status !== "PAUSED") throw new LeadError("conflict", "Cette mission n'est pas en pause.", 409)
      let cap = m.capMicros
      if (request.capEur !== undefined) cap = Math.max(cap, eurToMicros(request.capEur))
      if (m.pauseKind === "budget" && cap <= m.capMicros) throw new LeadError("conflict", `Relevez le plafond de la mission (${eur(m.capMicros)} aujourd'hui) pour qu'elle continue.`, 409, { capEur: confirmCapEur(Math.max(m.maxMicros, m.capMicros * 1.5)) })
      if (!(await requesterOf(m))) throw forbidden("Votre compte n'a plus le droit d'utiliser l'IA.")
      await prisma.$transaction([
        prisma.agentMissionStep.updateMany({ where: { missionId: m.id, status: { in: ["FAILED", "UNCERTAIN"] } }, data: { status: "PENDING", attempts: 0, error: null, notBefore: null, finishedAt: null } }),
        prisma.agentMission.updateMany({ where: { id: m.id, status: "PAUSED" }, data: { status: "RUNNING", capMicros: cap, pauseKind: null, pauseReason: null, wakeAt: now } }),
      ])
      break
    }
    case "cancel": {
      if (!mine && !isManager(actor)) throw forbidden("Seule la personne qui l'a lancée, un manager ou le propriétaire peut annuler cette mission.")
      const res = await prisma.agentMission.updateMany({ where: { id: m.id, status: { in: ["RUNNING", "PAUSED"] } }, data: { status: "CANCELLED", finishedAt: now, pauseKind: null, pauseReason: null } })
      if (res.count !== 1) throw new LeadError("conflict", "Cette mission n'est pas en cours.", 409)
      await stopWork(actor, m)
      break
    }
  }
  if (request.action !== "approve") await audit({ action: `ai.mission_${request.action}`, actorId: actor.id, workspaceId: actor.workspaceId, entityType: "AgentMission", entityId: m.id })
  await publishMission(m.id)
  return missionView(actor, m.id)
}

// ---------------------------------------------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------------------------------------------

const include = {
  requestedBy: { select: { name: true, email: true } },
  schedule: true,
  steps: true,
} satisfies Prisma.AgentMissionInclude
type Row = Prisma.AgentMissionGetPayload<{ include: typeof include }>

const WORST: StepState[] = ["failed", "approval", "working", "waiting", "todo", "done", "skipped"]

type UnitDetail = { state: StepState; detail: string | null; approvalId: string | null }

/** Where each unit stands, read live: a search's counters, a run's agent, Jev's progress, a click waited for. */
async function unitDetails(actor: CurrentUser, units: AgentMissionStep[]): Promise<Map<string, UnitDetail>> {
  const out = new Map<string, UnitDetail>()
  const waiting = units.filter((u) => u.status === "WAITING" && u.waitId)
  const [searches, runs] = await Promise.all([
    prisma.extractionSearch.findMany({ where: { id: { in: waiting.filter((u) => u.waitKind === "search").map((u) => u.waitId!) } }, select: { id: true, label: true, counters: true } }),
    prisma.agentRun.findMany({ where: { id: { in: waiting.filter((u) => u.waitKind === "run").map((u) => u.waitId!) } }, select: { id: true, agentId: true, input: true, status: true, approvals: { where: { status: "PENDING" }, select: { id: true, requestedById: true } } } }),
  ])
  const searchOf = new Map(searches.map((s) => [s.id, s]))
  const runOf = new Map(runs.map((r) => [r.id, r]))
  for (const u of units) {
    const output = record(u.output)
    const line = typeof output.line === "string" ? output.line : null
    let state = STEP_STATE_OF[u.status]
    let detail: string | null = u.status === "FAILED" || u.status === "UNCERTAIN" ? u.error : line
    let approvalId: string | null = null
    if (u.status === "WAITING" && u.waitKind === "search") {
      const s = searchOf.get(u.waitId!)
      const c = record(s?.counters)
      detail = s ? `« ${s.label} » sur l'Extractor : ${Number(c.unique ?? 0).toLocaleString("fr-FR")} trouvées, ${Number(c.crmUseful ?? 0).toLocaleString("fr-FR")} joignables` : "Recherche en cours"
    } else if (u.status === "WAITING" && u.waitKind === "run") {
      const r = runOf.get(u.waitId!)
      if (r && taskKindOf(r.input) === MISSION_ACTION) {
        const pending = r.approvals[0]
        state = "approval"
        detail = "Attend votre validation"
        approvalId = pending && (pending.requestedById === actor.id || isManager(actor)) ? pending.id : null
      } else detail = r ? `${agentLabel(r.agentId)} au travail` : "En cours"
    } else if (u.status === "WAITING" && u.waitKind === "sort") {
      const c = await sortCounts(actor, u.waitId!).catch(() => null)
      detail = c ? `Jev trie : ${(c.relevant + c.maybe + c.notRelevant + c.toDecide).toLocaleString("fr-FR")} triées, ${c.unsorted.toLocaleString("fr-FR")} restantes` : "Jev trie les fiches"
    }
    out.set(u.id, { state, detail, approvalId })
  }
  return out
}

/** What the views of several missions share, read once: their spend, the cap of the workspace, their units' state. */
interface ViewContext {
  spent: Map<string, number>
  settingCapMicros: number
  details: Map<string, UnitDetail>
}

async function viewContext(actor: CurrentUser, missions: Row[]): Promise<ViewContext> {
  const [spend, settings, details] = await Promise.all([
    prisma.agentRun.groupBy({ by: ["missionId"], where: { missionId: { in: missions.map((m) => m.id) } }, _sum: { costMicros: true, reservedMicros: true } }),
    getAiSettings(actor.workspaceId),
    unitDetails(actor, missions.flatMap((m) => m.steps)),
  ])
  return { spent: new Map(spend.map((s) => [s.missionId ?? "", (s._sum.costMicros ?? 0) + (s._sum.reservedMicros ?? 0)])), settingCapMicros: settings.missionCapMicros, details }
}

function toView(actor: CurrentUser, m: Row, ctx: ViewContext): MissionView {
  const plan = m.plan as unknown as CheckedPlan
  const steps: MissionStepView[] = plan.steps.map((s) => {
    const units = m.steps.filter((u) => u.key === s.id).sort((a, b) => a.item - b.item)
    const views = units.map((u) => ctx.details.get(u.id)!)
    const state = units.length ? WORST.find((w) => views.some((v) => v.state === w)) ?? "todo" : "todo"
    const loopDone = units.length > 1 ? `${units.filter((u) => u.status === "DONE").length}/${units.length} faites` : null
    // A loop says each item's line when it has a few, the line that matters otherwise.
    const lines = units.length > 1 && units.length <= 4 && state === "done" ? views.map((v) => v.detail).filter(Boolean) : [views.find((v) => v.state === state)?.detail]
    const detail = [loopDone, lines.filter(Boolean).join(" ; ")].filter(Boolean).join(" · ") || null
    return { key: s.id, index: stepNumber(s.id), text: s.text, level: s.level, state, detail, approvalId: views.find((v) => v.approvalId)?.approvalId ?? null }
  })
  const mine = m.requestedById === actor.id
  const manager = isManager(actor)
  const recurrence = (plan.recurrence ?? (m.schedule?.recurrence as Recurrence | undefined)) as Recurrence | undefined
  const report = record(m.report)
  return {
    id: m.id,
    title: m.title,
    status: m.status,
    requestedBy: who(m.requestedBy),
    mine,
    createdAt: m.createdAt.toISOString(),
    approvedAt: m.approvedAt?.toISOString() ?? null,
    finishedAt: m.finishedAt?.toISOString() ?? null,
    expiresAt: m.expiresAt?.toISOString() ?? null,
    steps,
    cost: { probableEur: microsToEur(m.probableMicros), maxEur: microsToEur(m.maxMicros), capEur: microsToEur(m.capMicros), spentEur: microsToEur(ctx.spent.get(m.id) ?? 0), settingCapEur: microsToEur(ctx.settingCapMicros) },
    recurrence: recurrence ? { text: describeRecurrence(recurrence), scheduleId: m.scheduleId, status: m.schedule?.status ?? null, nextRunAt: m.schedule?.nextRunAt?.toISOString() ?? null } : null,
    pause: m.status === "PAUSED" ? { kind: m.pauseKind ?? "person", reason: capitalized(m.pauseReason ?? "") } : null,
    report: m.report
      ? { lines: (report.lines as string[]) ?? [], leads: Number(report.leads ?? 0), tag: (report.tag as string | null) ?? null, listUrl: (report.listUrl as string | null) ?? null, campaigns: (report.campaigns as { id: string; name: string }[]) ?? [] }
      : null,
    can: {
      approve: m.status === "PROPOSED" && mine && (!m.expiresAt || m.expiresAt > new Date()),
      pause: m.status === "RUNNING" && (mine || manager),
      resume: m.status === "PAUSED" && mine,
      cancel: (m.status === "RUNNING" || m.status === "PAUSED") && (mine || manager),
      stopRecurrence: !!m.schedule && m.schedule.status !== "STOPPED" && (mine || manager),
    },
  }
}

export async function missionView(actor: CurrentUser, id: string): Promise<MissionView> {
  if (!can(actor.role, "ai:read")) throw forbidden("Accès refusé")
  const m = await prisma.agentMission.findFirst({ where: { id, workspaceId: actor.workspaceId, ...(isManager(actor) ? {} : { requestedById: actor.id }) }, include })
  if (!m) throw new LeadError("not_found", "Mission introuvable.", 404)
  return toView(actor, m, await viewContext(actor, [m]))
}

const leadName = (l: { company: { name: string } | null; contact: { name: string | null; email: string | null } | null }) => l.company?.name ?? l.contact?.name ?? l.contact?.email ?? "Fiche"

/** One mission with its runs and their costs, for Agents IA › Missions. */
export async function missionDetail(actor: CurrentUser, id: string): Promise<MissionDetail> {
  const view = await missionView(actor, id)
  const runs = await prisma.agentRun.findMany({
    where: { missionId: id, workspaceId: actor.workspaceId },
    select: { id: true, agentId: true, input: true, status: true, costMicros: true, createdAt: true, lead: { select: { id: true, company: { select: { name: true } }, contact: { select: { name: true, email: true } } } } },
    orderBy: { createdAt: "asc" },
    take: 200,
  })
  return {
    ...view,
    runs: runs.map((r) => ({ id: r.id, agentLabel: agentLabel(r.agentId), task: taskKindOf(r.input) === MISSION_ACTION ? "Validation" : null, status: r.status, costEur: microsToEur(r.costMicros), createdAt: r.createdAt.toISOString(), lead: r.lead ? { id: r.lead.id, name: leadName(r.lead) } : null })),
  }
}

/** Missions visible to the person (theirs, or the team's for owners and managers), newest first. */
export async function listMissions(actor: CurrentUser, opts: { limit?: number } = {}): Promise<MissionView[]> {
  if (!can(actor.role, "ai:read")) throw forbidden("Accès refusé")
  const rows = await prisma.agentMission.findMany({
    where: { workspaceId: actor.workspaceId, ...(isManager(actor) ? {} : { requestedById: actor.id }), status: { notIn: ["EXPIRED", "REFUSED"] } },
    include,
    orderBy: { createdAt: "desc" },
    take: Math.min(opts.limit ?? 30, 100),
  })
  const ctx = await viewContext(actor, rows)
  return rows.map((m) => toView(actor, m, ctx))
}

// ---------------------------------------------------------------------------------------------------------------
// Recurring missions
// ---------------------------------------------------------------------------------------------------------------

function scheduleView(actor: CurrentUser, s: AgentMissionSchedule & { requestedBy: { name: string | null; email: string | null } | null; missions: Pick<AgentMission, "id" | "status" | "createdAt">[] }): ScheduleView {
  const mine = s.requestedById === actor.id
  const manager = isManager(actor)
  const last = s.missions[0] ?? null
  return {
    id: s.id,
    title: s.title,
    status: s.status,
    recurrence: describeRecurrence(s.recurrence as Recurrence),
    nextRunAt: s.status === "ACTIVE" ? (s.nextRunAt?.toISOString() ?? null) : null,
    failures: s.failures,
    pauseReason: s.pauseReason,
    requestedBy: who(s.requestedBy),
    lastMission: last && { id: last.id, status: last.status, createdAt: last.createdAt.toISOString() },
    can: { pause: s.status === "ACTIVE" && (mine || manager), resume: s.status === "PAUSED" && mine, stop: s.status !== "STOPPED" && (mine || manager) },
  }
}

const scheduleInclude = { requestedBy: { select: { name: true, email: true } }, missions: { orderBy: { createdAt: "desc" as const }, take: 1, select: { id: true, status: true, createdAt: true } } }

export async function listSchedules(actor: CurrentUser): Promise<ScheduleView[]> {
  if (!can(actor.role, "ai:read")) throw forbidden("Accès refusé")
  const rows = await prisma.agentMissionSchedule.findMany({
    where: { workspaceId: actor.workspaceId, status: { not: "STOPPED" }, ...(isManager(actor) ? {} : { requestedById: actor.id }) },
    include: scheduleInclude,
    orderBy: { createdAt: "desc" },
    take: 50,
  })
  return rows.map((s) => scheduleView(actor, s))
}

export async function actOnSchedule(actor: CurrentUser, id: string, request: ScheduleRequest): Promise<ScheduleView> {
  if (!can(actor.role, "ai:use")) throw forbidden("Votre rôle ne permet pas d'utiliser l'IA.")
  const s = await prisma.agentMissionSchedule.findFirst({ where: { id, workspaceId: actor.workspaceId, ...(isManager(actor) ? {} : { requestedById: actor.id }) } })
  if (!s) throw new LeadError("not_found", "Mission récurrente introuvable.", 404)
  const mine = s.requestedById === actor.id
  if (request.action === "resume") {
    if (!mine) throw forbidden("Seule la personne qui l'a lancée peut reprendre cette mission récurrente.")
    if ((await prisma.agentMissionSchedule.count({ where: { requestedById: actor.id, status: "ACTIVE" } })) >= MAX_ACTIVE_SCHEDULES) {
      throw new LeadError("conflict", `Vous avez déjà ${MAX_ACTIVE_SCHEDULES} missions récurrentes actives.`, 409)
    }
    const res = await prisma.agentMissionSchedule.updateMany({ where: { id, status: "PAUSED" }, data: { status: "ACTIVE", failures: 0, pauseReason: null, nextRunAt: nextOccurrence(s.recurrence as Recurrence, new Date()) } })
    if (res.count !== 1) throw new LeadError("conflict", "Cette mission récurrente n'est pas en pause.", 409)
  } else {
    if (!mine && !isManager(actor)) throw forbidden("Seule la personne qui l'a lancée, un manager ou le propriétaire peut l'arrêter.")
    const data = request.action === "pause" ? { status: "PAUSED" as const, pauseReason: `Mise en pause par ${actor.name || actor.email}.` } : { status: "STOPPED" as const, nextRunAt: null }
    const res = await prisma.agentMissionSchedule.updateMany({ where: { id, status: request.action === "pause" ? "ACTIVE" : { not: "STOPPED" } }, data })
    if (res.count !== 1) throw new LeadError("conflict", "Cette mission récurrente a déjà changé.", 409)
  }
  await audit({ action: `ai.mission_schedule_${request.action}`, actorId: actor.id, workspaceId: actor.workspaceId, entityType: "AgentMissionSchedule", entityId: id })
  const row = await prisma.agentMissionSchedule.findUniqueOrThrow({ where: { id }, include: scheduleInclude })
  return scheduleView(actor, row)
}

/** A schedule that could not run its occurrence: counted, and paused after SCHEDULE_FAILURES in a row. */
async function scheduleFailed(s: AgentMissionSchedule, reason: string): Promise<void> {
  const failures = s.failures + 1
  const paused = failures >= SCHEDULE_FAILURES
  await prisma.agentMissionSchedule.update({ where: { id: s.id }, data: { failures, ...(paused ? { status: "PAUSED", pauseReason: reason.slice(0, 500) } : {}) } })
  const fake = { id: s.id, workspaceId: s.workspaceId, requestedById: s.requestedById }
  await notifyMission(fake, paused ? { title: "Mission récurrente en pause", message: `« ${s.title} » n'a pas pu tourner deux fois de suite : ${reason}` } : { title: "Mission récurrente : passage manqué", message: `« ${s.title} » : ${reason}` })
}

/**
 * Starts the occurrences that are due (the worker's maintenance, every 30 seconds): the frozen plan, checked again with
 * the person's rights and the caps of the day. A pass still running is not doubled; one stuck on an incident counts as
 * a failure.
 */
export async function runSchedules(now = new Date()): Promise<number> {
  const due = await prisma.agentMissionSchedule.findMany({ where: { status: "ACTIVE", nextRunAt: { lte: now } }, take: 20, orderBy: { nextRunAt: "asc" } })
  let started = 0
  for (const s of due) {
    const claimed = await prisma.agentMissionSchedule.updateMany({ where: { id: s.id, status: "ACTIVE", nextRunAt: s.nextRunAt }, data: { nextRunAt: nextOccurrence(s.recurrence as Recurrence, now) } })
    if (claimed.count !== 1) continue
    const previous = await prisma.agentMission.findFirst({ where: { scheduleId: s.id, status: { in: ["RUNNING", "PAUSED"] } }, select: { status: true, pauseKind: true } })
    if (previous?.status === "RUNNING" || (previous?.status === "PAUSED" && previous.pauseKind === "person")) continue
    if (previous) {
      await scheduleFailed(s, "le passage précédent est en pause sur un incident.")
      continue
    }
    const user = await requesterOf(s)
    if (!user) {
      await scheduleFailed(s, "le compte de la personne qui l'a lancée est désactivé ou n'a plus le droit d'utiliser l'IA.")
      continue
    }
    try {
      const copilot = await effectiveAgent(s.workspaceId, "copilot")
      if (!copilot.enabled) throw new LeadError("conflict", "le Copilote est désactivé dans cet espace.", 409)
      const check = await checkPlan(user, copilot.policy, s.plan)
      const m = await prisma.agentMission.create({
        data: {
          workspaceId: s.workspaceId,
          requestedById: user.id,
          title: s.title,
          plan: check.plan as unknown as Prisma.InputJsonValue,
          status: "RUNNING",
          probableMicros: check.probableMicros,
          maxMicros: check.maxMicros,
          capMicros: s.capMicros,
          scheduleId: s.id,
          approvedAt: now,
          startedAt: now,
          wakeAt: now,
        },
      })
      await audit({ action: "ai.mission_occurrence", actorId: null, workspaceId: s.workspaceId, entityType: "AgentMission", entityId: m.id, metadata: { scheduleId: s.id } })
      await publishMission(m.id)
      started++
    } catch (error) {
      await scheduleFailed(s, error instanceof Error ? error.message : String(error))
    }
  }
  return started
}

/** Proposals nobody launched within a day expire. */
export async function expireStaleProposals(now = new Date()): Promise<number> {
  const res = await prisma.agentMission.updateMany({ where: { status: "PROPOSED", expiresAt: { lte: now } }, data: { status: "EXPIRED" } })
  return res.count
}

/** For the copilot: the missions in a few words. */
export async function missionsForModel(actor: CurrentUser, limit = 10) {
  const views = await listMissions(actor, { limit })
  return views.map((m) => ({
    missionId: m.id,
    title: m.title,
    status: m.status,
    steps: m.steps.map((s) => `${s.index}. ${s.text}${s.detail ? ` — ${s.detail}` : ""}`),
    ...(m.pause ? { pause: m.pause.reason } : {}),
    ...(m.report ? { report: m.report.lines, tag: m.report.tag } : {}),
    spentEur: m.cost.spentEur,
    ...(m.recurrence ? { recurrence: m.recurrence.text } : {}),
  }))
}

