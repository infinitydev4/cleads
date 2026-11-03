import type { AgentMission, AgentMissionStep, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { toCrmRole } from "@/lib/crm/roles"
import { can } from "@/lib/rbac"
import { withActing } from "@/lib/ai/acting"
import { ACTIVE_RUN_STATUSES } from "@/lib/ai/budget"
import { utc } from "@/lib/ai/sql"
import { ExtractorError } from "@/lib/extractor/client"
import { LeadError } from "@/features/leads/errors"
import { MAX_ACTIVE_SEARCHES_PER_USER, extractorHealth, refreshSearch } from "@/features/search/service"
import { requestRelevance } from "@/features/relevance/service"
import { effectiveAgent } from "@/features/ai/definitions"
import { taskKindOf } from "@/features/ai/handlers"
import { startRun, finishRun } from "@/features/ai/runs"
import { approvalOf, checkRight, runTool, type ToolContext } from "@/features/ai/tools"
import type { AgentId } from "@/features/ai/agents"
import type { AgentPolicy } from "@/features/ai/actions/policy"
import { plural } from "@/features/ai/actions/shared"
import { MISSION_ACTIONS, sortCounts, type MissionAction } from "./actions"
import { isRef, stepNumber } from "./plan"
import { LOOP_MAX, type CheckedPlan, type CheckedStep } from "./schemas"
import { notifyMission, publishMission } from "./notify"

/**
 * The mission engine (E28, docs/crm-v1/WORKER-IA.md): the worker carries out a launched plan step by step, in code; no
 * model decides between steps, only the specialists a step hands work to. A pass takes the mission (one worker at a
 * time), reloads the person with their rights of now, settles what the steps wait for (a search, a run, Jev's sorting,
 * a click), then runs the steps that can start, each claimed before it runs so it runs at most once. It ends when the
 * mission waits for something; the mission is woken when that thing happens, and looked at every minute anyway.
 */
export const MISSION_ACTION = "mission_action"
export const MISSION_LEASE_MS = 5 * 60_000
export const MISSION_RECHECK_MS = 60_000
const STEP_ATTEMPTS = 3
/** Jev is asked again while fiches wait, this many times at most for one step. */
const SORT_ROUNDS = 10

type Row = AgentMissionStep
type Mission = AgentMission & { steps: Row[] }

export interface AdvanceOptions {
  workerId: string
  /** Aborted when the worker stops: the pass ends after the step in progress. */
  signal?: AbortSignal
  now?: () => Date
}

const OVER = new Set<Row["status"]>(["DONE", "SKIPPED", "CANCELLED"])
const STOPPED = new Set<Row["status"]>(["FAILED", "UNCERTAIN"])
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))
const record = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** A passing failure: the Extractor or the database out of reach. The step is tried again later. */
export function transient(error: unknown): boolean {
  if (error instanceof ExtractorError) return error.retriable
  if (error instanceof LeadError) return error.code === "unavailable"
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === "string" && ["P1001", "P1002", "P1008", "P1017", "P2024"].includes(code)
}

/** What a step keeps of its output: plain JSON, long lists shortened (its exports keep them whole). */
function kept(output: unknown): Prisma.InputJsonValue {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.length > 30 ? [...v.slice(0, 30).map(walk), `… ${v.length - 30} de plus`] : v.map(walk)
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, walk(x)]))
    return v
  }
  return JSON.parse(JSON.stringify(walk(output) ?? {})) as Prisma.InputJsonValue
}

// ---------------------------------------------------------------------------------------------------------------
// Taking and giving back a mission
// ---------------------------------------------------------------------------------------------------------------

/** The next mission due, or one whose worker stopped, for this worker. Its wake is consumed. */
export async function claimMission(workerId: string, now = new Date()): Promise<string | null> {
  const until = new Date(now.getTime() + MISSION_LEASE_MS)
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "AgentMission" SET "lockedBy" = ${workerId}, "lockedUntil" = ${utc(until)}, "wakeAt" = NULL, "updatedAt" = ${utc(now)}
     WHERE "id" = (
       SELECT "id" FROM "AgentMission"
        WHERE "status" = 'RUNNING' AND ("lockedUntil" IS NULL OR "lockedUntil" < ${utc(now)})
          AND ("wakeAt" <= ${utc(now)} OR "lockedBy" IS NOT NULL)
        ORDER BY "wakeAt" ASC NULLS FIRST
        LIMIT 1
        FOR UPDATE SKIP LOCKED)
 RETURNING "id"`
  return rows[0]?.id ?? null
}

async function renew(id: string, workerId: string, now: Date): Promise<boolean> {
  const res = await prisma.agentMission.updateMany({ where: { id, lockedBy: workerId }, data: { lockedUntil: new Date(now.getTime() + MISSION_LEASE_MS) } })
  return res.count === 1
}

/** Gives the mission back; a wake that came during the pass is kept, so nothing waits a minute for nothing. */
export async function releaseMission(id: string, workerId: string, next: Date, now = new Date()): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "AgentMission" SET "lockedBy" = NULL, "lockedUntil" = NULL, "updatedAt" = ${utc(now)},
           "wakeAt" = CASE WHEN "status" = 'RUNNING' THEN LEAST(COALESCE("wakeAt", ${utc(next)}), ${utc(next)}) ELSE NULL END
     WHERE "id" = ${id} AND "lockedBy" = ${workerId}`
}

// ---------------------------------------------------------------------------------------------------------------
// The person, the copilot's rights, the budget
// ---------------------------------------------------------------------------------------------------------------

/** The person the mission acts for, with their role of now; null when the account is gone, off or without AI. */
export async function requesterOf(m: Pick<AgentMission, "requestedById" | "workspaceId">): Promise<CurrentUser | null> {
  if (!m.requestedById) return null
  const u = await prisma.user.findUnique({ where: { id: m.requestedById }, select: { id: true, name: true, email: true, image: true, role: true, active: true, workspaceId: true } })
  const role = toCrmRole(u?.role)
  if (!u || !u.active || !role || u.workspaceId !== m.workspaceId || !can(role, "ai:use")) return null
  return { id: u.id, workspaceId: m.workspaceId, name: u.name ?? u.email ?? "", email: u.email ?? "", image: u.image, role }
}

/** A mission's own steps run under the mission, not under a run. */
export const missionContext = (m: Pick<AgentMission, "id" | "workspaceId">, user: CurrentUser, policy: AgentPolicy): ToolContext => ({
  run: { id: m.id, workspaceId: m.workspaceId, agentId: "copilot", requester: user, userKey: user.id, leadId: null, missionId: m.id },
  policy,
})

/** What the mission's runs spent and still hold. */
export async function missionSpend(missionId: string): Promise<number> {
  const agg = await prisma.agentRun.aggregate({ where: { missionId }, _sum: { costMicros: true, reservedMicros: true } })
  return (agg._sum.costMicros ?? 0) + (agg._sum.reservedMicros ?? 0)
}

const eur = (micros: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(micros / 1_000_000)

class Paused extends Error {
  constructor(
    readonly kind: string,
    message: string,
    readonly managers = false
  ) {
    super(message)
  }
}

async function checkBudget(m: Mission, agentId: AgentId): Promise<void> {
  const [spent, agent] = await Promise.all([missionSpend(m.id), effectiveAgent(m.workspaceId, agentId)])
  if (spent + agent.capMicros <= m.capMicros) return
  throw new Paused("budget", `la mission a engagé ${eur(spent)} sur son plafond de ${eur(m.capMicros)} ; l'étape suivante peut coûter jusqu'à ${eur(agent.capMicros)}. Relevez son plafond pour continuer.`)
}

export async function pauseMission(m: Pick<AgentMission, "id" | "title" | "workspaceId" | "requestedById">, kind: string, reason: string, opts: { managers?: boolean } = {}): Promise<boolean> {
  const res = await prisma.agentMission.updateMany({ where: { id: m.id, status: "RUNNING" }, data: { status: "PAUSED", pauseKind: kind, pauseReason: reason.slice(0, 1_000) } })
  if (res.count !== 1) return false
  await notifyMission(m, { title: "Mission en pause", message: `« ${m.title} » : ${reason}` }, { managers: opts.managers })
  await audit({ action: "ai.mission_paused", actorId: null, workspaceId: m.workspaceId, entityType: "AgentMission", entityId: m.id, metadata: { kind, reason: reason.slice(0, 300) } })
  return true
}

// ---------------------------------------------------------------------------------------------------------------
// References and loops
// ---------------------------------------------------------------------------------------------------------------

class Steps {
  private byKey = new Map<string, Row[]>()
  constructor(rows: Row[]) {
    for (const r of rows) this.put(r)
  }
  put(r: Row) {
    const list = (this.byKey.get(r.key) ?? []).filter((x) => x.item !== r.item)
    this.byKey.set(r.key, [...list, r].sort((a, b) => a.item - b.item))
  }
  of(key: string): Row[] {
    return this.byKey.get(key) ?? []
  }
}

const stepOf = (plan: CheckedPlan, id: string) => plan.steps[stepNumber(id) - 1]

/** The step that starts the loop a step belongs to, if any. */
function originOf(plan: CheckedPlan, step: CheckedStep): string | null {
  const f = step.forEach
  if (f === undefined) return null
  if (typeof f === "string" && /^s\d+$/.test(f)) return originOf(plan, stepOf(plan, f))
  return step.id
}

/** An export of an earlier step: its item's value inside the same loop, every item's together otherwise. */
function exportValue(plan: CheckedPlan, rows: Steps, ref: string, at: { origin: string | null; item: number }): string | string[] | null {
  const [id, name] = ref.split(".")
  const source = stepOf(plan, id)
  const spec = MISSION_ACTIONS[source.action]
  const list = rows.of(id).filter((r) => r.status === "DONE")
  const value = (r: Row) => record(r.exports)[name] as string | string[] | null | undefined
  if (at.origin && originOf(plan, source) === at.origin) return value(list.find((r) => r.item === at.item) ?? ({} as Row)) ?? null
  if (!originOf(plan, source) && spec.exports[name]?.kind === "id") return (list[0] && (value(list[0]) as string | null)) ?? null
  return [...new Set(list.flatMap((r) => [value(r)].flat().filter((x): x is string => typeof x === "string")))]
}

function itemsOf(plan: CheckedPlan, rows: Steps, step: CheckedStep): string[] {
  const f = step.forEach
  if (Array.isArray(f)) return f
  if (typeof f !== "string") return []
  if (/^s\d+$/.test(f)) return itemsOf(plan, rows, stepOf(plan, f))
  const values = exportValue(plan, rows, f, { origin: null, item: 0 })
  return [values ?? []].flat().slice(0, MISSION_ACTIONS[step.action].loopMax ?? LOOP_MAX)
}

/** Creates the units of a step once the previous step is over: its references resolved, one per item of its loop. */
async function expand(m: Mission, plan: CheckedPlan, rows: Steps, step: CheckedStep): Promise<void> {
  const origin = originOf(plan, step)
  const items: (string | null)[] = step.forEach === undefined ? [null] : itemsOf(plan, rows, step)
  const data: Prisma.AgentMissionStepCreateManyInput[] = []
  if (!items.length) data.push({ missionId: m.id, key: step.id, item: 0, action: step.action, input: {}, status: "SKIPPED", output: { line: "Rien à faire : la liste de la boucle est vide." }, finishedAt: new Date() })
  for (const [item, value] of items.entries()) {
    const input: Record<string, unknown> = {}
    let empty: string | null = null
    for (const [field, v] of Object.entries(step.input)) {
      if (!isRef(v)) {
        input[field] = v
        continue
      }
      const resolved = v.$ref === "item" ? value : exportValue(plan, rows, v.$ref, { origin, item })
      if (resolved === null || (Array.isArray(resolved) && !resolved.length)) {
        if (Array.isArray(resolved) || field.endsWith("Ids")) empty ??= `Rien à faire : ${field} (${v.$ref}) est vide.`
        continue
      }
      input[field] = resolved
    }
    data.push({ missionId: m.id, key: step.id, item, action: step.action, input: input as Prisma.InputJsonValue, ...(empty ? { status: "SKIPPED" as const, output: { line: empty }, finishedAt: new Date() } : {}) })
  }
  await prisma.agentMissionStep.createMany({ data, skipDuplicates: true })
  for (const r of await prisma.agentMissionStep.findMany({ where: { missionId: m.id, key: step.id } })) rows.put(r)
}

// ---------------------------------------------------------------------------------------------------------------
// Running a unit
// ---------------------------------------------------------------------------------------------------------------

interface Pass {
  m: Mission
  plan: CheckedPlan
  user: CurrentUser
  ctx: ToolContext
  rows: Steps
  now: () => Date
}

async function update(p: Pass, row: Row, data: Prisma.AgentMissionStepUpdateInput): Promise<Row> {
  const next = await prisma.agentMissionStep.update({ where: { id: row.id }, data })
  p.rows.put(next)
  return next
}

/** The unit is over: its exports for later steps and its line for the card. */
async function settle(p: Pass, row: Row, output: Record<string, unknown>): Promise<void> {
  const spec = MISSION_ACTIONS[row.action]
  const s = await spec.settle({ input: record(row.input), output, missionId: p.m.id }, p.user)
  await update(p, row, { status: "DONE", output: kept({ ...output, line: s.line }), exports: s.exports as Prisma.InputJsonValue, finishedAt: p.now(), error: null })
}

/** Runs a list of fiches longer than the action allows in parts, each checked like a call of its own. */
async function execute(p: Pass, spec: MissionAction, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const list = Array.isArray(input.leadIds) ? (input.leadIds as string[]) : null
  const run = (part: Record<string, unknown>) =>
    withActing({ agentId: "copilot", tool: spec.def.name, missionId: p.m.id }, async () => record(await (spec.start ? spec.start(part) : spec.def.execute(p.ctx, spec.def.input.parse(part)))))
  if (!spec.chunk || !list || list.length <= spec.chunk) return run(input)
  const merged: Record<string, unknown> = {}
  for (let i = 0; i < list.length; i += spec.chunk) {
    const out = await run({ ...input, leadIds: list.slice(i, i + spec.chunk) })
    for (const [k, v] of Object.entries(out)) merged[k] = typeof v === "number" && typeof merged[k] === "number" ? (merged[k] as number) + v : Array.isArray(v) && Array.isArray(merged[k]) ? [...(merged[k] as unknown[]), ...v] : v
  }
  return merged
}

const isSearch = (action: string, input: Record<string, unknown>) => action === "start_search" || (action === "act_on_target" && input.action === "search")

/** A contact action waits for its own click, as any other (D28): a run of its own holds the approval. */
async function askApproval(p: Pass, row: Row, spec: MissionAction, input: Record<string, unknown>): Promise<void> {
  const run = await startRun(p.user, { agentId: "copilot", status: "RUNNING", input: { kind: MISSION_ACTION, missionId: p.m.id, stepId: row.id }, noModel: true, missionId: p.m.id })
  try {
    const result = await runTool(spec.def, { run, policy: p.ctx.policy }, input)
    if (result.status !== "pending_approval") throw new LeadError("conflict", "Cette action devait attendre une validation.", 409)
    await update(p, row, { status: "WAITING", waitKind: "run", waitId: run.id, output: { approvalId: result.approvalId } })
    const approval = await prisma.agentApproval.findUnique({ where: { id: result.approvalId }, select: { summary: true } })
    await notifyMission(p.m, { title: "Mission : votre validation", message: `« ${p.m.title} » attend votre clic : ${approval?.summary ?? spec.def.name}` })
  } catch (error) {
    await finishRun(run.id, { status: "FAILED", error: errorText(error) })
    throw error
  }
}

async function runUnit(p: Pass, row: Row): Promise<void> {
  const claimed = await prisma.agentMissionStep.updateMany({ where: { id: row.id, status: "PENDING" }, data: { status: "RUNNING", startedAt: p.now(), attempts: { increment: 1 } } })
  if (claimed.count !== 1) return
  row = { ...row, status: "RUNNING", attempts: row.attempts + 1 }
  p.rows.put(row)
  const spec = MISSION_ACTIONS[row.action]
  const input = record(row.input)
  try {
    checkRight(spec.def, p.ctx)
    if (spec.ai && spec.ai !== "qualifier") await checkBudget(p.m, spec.ai)
    if (isSearch(row.action, input)) {
      const active = await prisma.extractionSearch.count({ where: { createdById: p.user.id, status: { in: ["QUEUED", "RUNNING"] } } })
      if (active >= MAX_ACTIVE_SEARCHES_PER_USER) {
        // The person's searches are full: this one waits for a place instead of failing.
        await update(p, row, { status: "PENDING", attempts: { decrement: 1 }, notBefore: new Date(p.now().getTime() + MISSION_RECHECK_MS), output: { line: `Attend une place : ${MAX_ACTIVE_SEARCHES_PER_USER} recherches tournent déjà.` } })
        return
      }
      const health = await extractorHealth()
      if (health.state === "down" || health.state === "unreachable" || health.state === "not_configured") {
        throw new Paused("extractor", `l'Extractor ne peut pas chercher pour l'instant (${health.lines[0] ?? health.state}). Reprenez la mission quand il ira mieux.`)
      }
    }
    if (approvalOf(spec.def, p.ctx) === "explicit") return await askApproval(p, row, spec, input)
    const output = await execute(p, spec, input)
    const wait = spec.waitOf?.(output, input)
    if (wait) await update(p, row, { status: "WAITING", waitKind: wait.kind, waitId: wait.id, output: kept(output) })
    else await settle(p, row, output)
  } catch (error) {
    if (error instanceof Paused) {
      // Nothing was done: the unit starts again once the mission is resumed.
      await update(p, row, { status: "PENDING", attempts: { decrement: 1 } })
      throw error
    }
    if (transient(error) && row.attempts < STEP_ATTEMPTS) {
      await update(p, row, { status: "PENDING", error: errorText(error).slice(0, 1_000), notBefore: new Date(p.now().getTime() + MISSION_RECHECK_MS * row.attempts) })
      return
    }
    await update(p, row, { status: "FAILED", error: errorText(error).slice(0, 1_000), finishedAt: p.now() })
    if (error instanceof LeadError && error.status === 403) throw new Paused("rights", `${errorText(error)} La mission est en pause.`, true)
  }
}

// ---------------------------------------------------------------------------------------------------------------
// What a unit waits for
// ---------------------------------------------------------------------------------------------------------------

async function settleWait(p: Pass, row: Row): Promise<void> {
  const id = row.waitId ?? ""
  if (row.waitKind === "search") {
    let s = await prisma.extractionSearch.findFirst({ where: { id, workspaceId: p.m.workspaceId }, select: { status: true, error: true } })
    if (s && (s.status === "QUEUED" || s.status === "RUNNING")) {
      // Without a webhook (or one missed), the Extractor is asked.
      s = await refreshSearch(p.user, id).then((v) => ({ status: v.status, error: v.error })).catch(() => s)
    }
    if (!s) return void (await update(p, row, { status: "FAILED", error: "Recherche introuvable.", finishedAt: p.now() }))
    if (s.status === "QUEUED" || s.status === "RUNNING") return
    if (s.status === "FAILED") return void (await update(p, row, { status: "FAILED", error: s.error ?? "La recherche a échoué sur l'Extractor.", finishedAt: p.now() }))
    return settle(p, row, record(row.output))
  }
  if (row.waitKind === "run") {
    const run = await prisma.agentRun.findUnique({ where: { id }, select: { status: true, error: true, output: true, input: true } })
    if (!run) return void (await update(p, row, { status: "FAILED", error: "Exécution introuvable.", finishedAt: p.now() }))
    if ((ACTIVE_RUN_STATUSES as readonly string[]).includes(run.status)) return
    const action = taskKindOf(run.input) === MISSION_ACTION
    if (run.status === "SUCCEEDED") return settle(p, row, action ? record(run.output) : record(row.output))
    if (action && (run.status === "CANCELLED" || run.status === "EXPIRED")) {
      const line = run.status === "EXPIRED" ? "Validation non donnée à temps : rien n'a été fait." : "Refusée : rien n'a été fait."
      return void (await update(p, row, { status: "SKIPPED", output: { ...record(row.output), line }, finishedAt: p.now() }))
    }
    return void (await update(p, row, { status: "FAILED", error: run.error ?? (run.status === "CANCELLED" ? "Exécution arrêtée." : "Exécution en échec."), finishedAt: p.now() }))
  }
  if (row.waitKind === "sort") {
    const busy = await prisma.agentRun.count({ where: { workspaceId: p.m.workspaceId, agentId: "qualifier", campaignId: id, status: { in: [...ACTIVE_RUN_STATUSES] } } })
    if (busy) return
    const output = record(row.output)
    const rounds = typeof output.rounds === "number" ? output.rounds : 0
    const counts = await sortCounts(p.user, id)
    if (!counts.unsorted || rounds >= SORT_ROUNDS) return settle(p, row, output)
    await checkBudget(p.m, "qualifier")
    const asked = await withActing({ agentId: "copilot", tool: "sort_campaign", missionId: p.m.id }, () => requestRelevance(p.user, id)).catch((error: unknown) => {
      // Someone started the sorting in between: the step keeps waiting for it.
      if (error instanceof LeadError && error.code === "conflict") return { runId: "busy", queued: 0 }
      throw error
    })
    if (!asked.runId) return settle(p, row, output)
    await update(p, row, { output: { ...output, rounds: rounds + 1 } })
  }
}

// ---------------------------------------------------------------------------------------------------------------
// A pass
// ---------------------------------------------------------------------------------------------------------------

/**
 * The tag a mission puts on the fiches it produced, written as the CRM writes tags (lowercase, dashes, 30 characters):
 * « mission-architectes-nantes ». Every pass of a recurring mission files its fiches under the same one.
 */
export function missionTag(title: string): string {
  const slug = `mission ${title}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  if (slug.length <= 30) return slug
  const cut = slug.slice(0, 31)
  return cut.slice(0, cut.lastIndexOf("-") > 12 ? cut.lastIndexOf("-") : 30).replace(/-+$/, "")
}

async function finish(p: Pass): Promise<void> {
  const { m, plan, user } = p
  const lines: string[] = []
  const campaignIds = new Set<string>()
  for (const step of plan.steps) {
    const units = p.rows.of(step.id)
    for (const u of units) {
      const line = typeof record(u.output).line === "string" ? (record(u.output).line as string) : null
      if (line) lines.push(`${stepNumber(step.id)}. ${line}`)
      const c = record(u.exports).campaignId
      if (typeof c === "string") campaignIds.add(c)
    }
  }
  // The fiches it produced: those of the last step that gives fiches.
  let leads: string[] = []
  for (const step of [...plan.steps].reverse()) {
    if (MISSION_ACTIONS[step.action].exports.leadIds?.kind !== "ids") continue
    leads = [...new Set(p.rows.of(step.id).filter((u) => u.status === "DONE").flatMap((u) => [record(u.exports).leadIds].flat().filter((x): x is string => typeof x === "string")))]
    if (leads.length) break
  }
  let tag: string | null = null
  if (leads.length) {
    tag = missionTag(m.title)
    try {
      checkRight(MISSION_ACTIONS.tag_leads.def, p.ctx)
      const out = await execute(p, MISSION_ACTIONS.tag_leads, { leadIds: leads, tag })
      if (!(Number(out.updated ?? 0) + Number(out.unchanged ?? 0))) throw new LeadError("forbidden", "aucune de ces fiches ne peut être modifiée par cette personne.", 403)
    } catch (error) {
      lines.push(`Étiquette non posée : ${errorText(error)}`)
      tag = null
    }
  }
  const campaigns = campaignIds.size ? await prisma.campaign.findMany({ where: { id: { in: [...campaignIds] }, workspaceId: m.workspaceId }, select: { id: true, name: true } }) : []
  const report = { lines, leads: leads.length, tag, listUrl: tag ? `/app/leads?tag=${encodeURIComponent(tag)}` : null, campaigns }
  const done = await prisma.agentMission.updateMany({ where: { id: m.id, status: "RUNNING" }, data: { status: "SUCCEEDED", finishedAt: p.now(), report, pauseKind: null, pauseReason: null } })
  if (done.count !== 1) return
  if (m.scheduleId) await prisma.agentMissionSchedule.updateMany({ where: { id: m.scheduleId }, data: { failures: 0 } })
  const summary = leads.length ? `${plural(leads.length, "fiche", "fiches")}${tag ? ` étiquetées « ${tag} »` : ""}.` : (lines.at(-1) ?? "terminée.")
  await notifyMission(m, { title: "Mission terminée", message: `« ${m.title} » : ${summary}` })
  await audit({ action: "ai.mission_finished", actorId: user.id, workspaceId: m.workspaceId, entityType: "AgentMission", entityId: m.id, metadata: { leads: leads.length, tag } })
}

/** One pass over a mission this worker holds; returns when to look at it again (null: it no longer runs). */
async function pass(missionId: string, opts: AdvanceOptions): Promise<Date | null> {
  const now = opts.now ?? (() => new Date())
  const later = () => new Date(now().getTime() + MISSION_RECHECK_MS)
  const m = await prisma.agentMission.findUnique({ where: { id: missionId }, include: { steps: true } })
  if (!m || m.status !== "RUNNING") return null
  const user = await requesterOf(m)
  if (!user) {
    await pauseMission(m, "rights", "le compte de la personne qui l'a lancée est désactivé ou n'a plus le droit d'utiliser l'IA.", { managers: true })
    return null
  }
  const copilot = await effectiveAgent(m.workspaceId, "copilot")
  if (!copilot.enabled) {
    await pauseMission(m, "rights", "le Copilote est désactivé dans cet espace : le propriétaire peut le réactiver dans Agents IA.")
    return null
  }
  const plan = m.plan as unknown as CheckedPlan
  const p: Pass = { m, plan, user, ctx: missionContext(m, user, copilot.policy), rows: new Steps(m.steps), now }

  try {
    for (const [index, step] of plan.steps.entries()) {
      if (opts.signal?.aborted || !(await renew(m.id, opts.workerId, now()))) return later()
      const status = await prisma.agentMission.findUnique({ where: { id: m.id }, select: { status: true } })
      if (status?.status !== "RUNNING") return null
      if (!p.rows.of(step.id).length) {
        if (index > 0 && !p.rows.of(plan.steps[index - 1].id).every((u) => OVER.has(u.status))) return later()
        await expand(m, plan, p.rows, step)
      }
      // A unit left running by a worker that stopped halfway: maybe done, never redone without the person.
      for (const u of p.rows.of(step.id).filter((x) => x.status === "RUNNING")) await update(p, u, { status: "UNCERTAIN", error: "Le worker s'est arrêté pendant cette étape : elle a peut-être été faite.", finishedAt: now() })
      for (const u of p.rows.of(step.id).filter((x) => x.status === "WAITING")) await settleWait(p, u)
      for (const u of p.rows.of(step.id).filter((x) => x.status === "PENDING")) {
        if (opts.signal?.aborted) return later()
        if (u.notBefore && u.notBefore > now()) continue
        await runUnit(p, u)
      }
      const units = p.rows.of(step.id)
      const stopped = units.find((u) => STOPPED.has(u.status))
      if (stopped) {
        const what = `l'étape ${stepNumber(step.id)} (${step.text.slice(0, 80)})`
        await pauseMission(m, "step", stopped.status === "UNCERTAIN" ? `${what} a peut-être été faite : le worker s'est arrêté pendant son exécution. Vérifiez, puis reprenez (elle sera refaite) ou annulez.` : `${what} a échoué : ${stopped.error ?? "erreur inconnue"}. Reprenez pour réessayer, ou annulez.`)
        return null
      }
      if (!units.every((u) => OVER.has(u.status))) {
        const waits = units.filter((u) => u.status === "PENDING" && u.notBefore).map((u) => u.notBefore!.getTime())
        return waits.length ? new Date(Math.min(Math.max(Math.min(...waits), now().getTime() + 1_000), later().getTime())) : later()
      }
    }
    await finish(p)
    return null
  } catch (error) {
    if (!(error instanceof Paused)) throw error
    await pauseMission(m, error.kind, error.message, { managers: error.managers })
    return null
  }
}

/** One pass, whatever happens: the mission is always given back, and the person's card told. */
export async function advanceMission(missionId: string, opts: AdvanceOptions): Promise<void> {
  const now = opts.now ?? (() => new Date())
  let next = new Date(now().getTime() + MISSION_RECHECK_MS)
  try {
    next = (await pass(missionId, opts)) ?? next
  } catch (error) {
    if (!transient(error)) {
      const m = await prisma.agentMission.findUnique({ where: { id: missionId }, select: { id: true, title: true, workspaceId: true, requestedById: true } })
      if (m) await pauseMission(m, "error", `erreur inattendue du worker (${errorText(error).slice(0, 200)}). Reprenez pour réessayer, ou annulez.`)
    }
    console.error("[MISSIONS] pass failed", missionId, errorText(error))
  } finally {
    await releaseMission(missionId, opts.workerId, next, now()).catch(() => undefined)
    await publishMission(missionId)
  }
}
