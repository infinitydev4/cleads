import type { z } from "zod"
import { prisma } from "@/lib/prisma"
import type { CurrentUser } from "@/lib/auth/guard"
import { LeadError } from "@/features/leads/errors"
import { visibleLeads } from "@/features/metrics/service"
import { RELEVANCE_BATCH } from "@/features/relevance/handler"
import { approvalOf, checkRight, type ToolContext } from "@/features/ai/tools"
import { effectiveAgent } from "@/features/ai/definitions"
import type { AgentId } from "@/features/ai/agents"
import type { AgentPolicy } from "@/features/ai/actions/policy"
import { plural, targetsOf, visibleName } from "@/features/ai/actions/shared"
import { MISSION_ACTIONS, MISSION_ACTION_NAMES, type ExportSpec, type MissionAction, type Volume, type Words } from "./actions"
import { LOOP_MAX, REF, STEP_ID, planSchema, type CheckedPlan, type CheckedStep, type PlanStep } from "./schemas"

/**
 * Checking a plan before anyone is asked (E28, docs/crm-v1/AGENTS-IA.md §17): known actions, the person's rights and
 * the copilot's matrix of now, references between steps, inputs, bounds, and what it may cost. The same check runs when
 * the copilot proposes, when the person launches, and before each occurrence of a recurring mission. A refusal says
 * which step and why, for the model to correct its plan.
 */

export const MISSION_BOUNDS = { searches: 5, results: 3_000, audits: 20, drafts: 20 } as const
/** Share of a search's results that usually end up imported (reachable and new): the probable cost of Jev's sorting. */
export const PROBABLE_IMPORT_SHARE = 0.6
/** What a run usually costs when the workspace has no history yet (micro-euros). */
const TYPICAL_MICROS: Partial<Record<AgentId, number>> = { auditor: 60_000, strategist: 50_000, qualifier: 10_000, writer: 10_000 }

export interface PlanCheck {
  plan: CheckedPlan
  probableMicros: number
  maxMicros: number
  volume: Volume
  /** Runs per agent at most. */
  runs: Partial<Record<AgentId, number>>
}

interface Loop {
  origin: string
  count: number
  /** Items written in the plan. */
  literal: string[] | null
  /** « Pour chaque cible de l'étape 1 » (the step that starts it) and « Pour chaque cible » (the steps that follow it). */
  first: string | null
  next: string
}

interface Info {
  step: PlanStep
  spec: MissionAction
  input: Record<string, unknown>
  loop: Loop | null
}

type Ref = { $ref: string }
export const isRef = (v: unknown): v is Ref => !!v && typeof v === "object" && !Array.isArray(v) && typeof (v as Ref).$ref === "string" && Object.keys(v).length === 1
export const stepNumber = (id: string) => Number(id.slice(1))

const invalid = (message: string) => new LeadError("invalid", message, 400)
const stepError = (step: Pick<PlanStep, "id" | "action">, message: string) => invalid(`Étape ${step.id} (${step.action}) : ${message}`)

const maxOf = (spec: ExportSpec, input: Record<string, unknown>) => (typeof spec.max === "function" ? spec.max(input) : (spec.max ?? 1))
const listWords = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).map((i) => `« ${i} »`).join(", ")} et « ${items.at(-1)} »` : `« ${items[0]} »`)
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

function issuesText(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((i) => `${i.path.length ? `${i.path.join(".")} : ` : ""}${i.message}`)
    .join(" ; ")
}

function exportOf(infos: Info[], step: PlanStep, ref: string): { target: Info; name: string; spec: ExportSpec } {
  const [id, name] = ref.split(".")
  const n = stepNumber(id)
  const target = infos[n - 1]
  if (!target || n >= stepNumber(step.id)) throw stepError(step, `« ${ref} » cite une étape qui ne la précède pas.`)
  const spec = target.spec.exports[name]
  if (!spec) {
    const known = Object.keys(target.spec.exports)
    throw stepError(step, `${id} (${target.step.action}) ne donne pas « ${name} »${known.length ? ` ; elle donne : ${known.join(", ")}` : " : elle ne donne rien à citer"}.`)
  }
  return { target, name, spec }
}

function loopOf(infos: Info[], step: PlanStep, spec: MissionAction): Loop | null {
  const f = step.forEach
  if (f === undefined) return null
  const most = spec.loopMax ?? LOOP_MAX
  if (Array.isArray(f)) {
    if (f.length > most) throw stepError(step, `${most} éléments au plus dans une boucle.`)
    return { origin: step.id, count: f.length, literal: f, first: null, next: `Pour ${f.length > 1 ? "chacun de " : ""}${listWords(f)}` }
  }
  if (STEP_ID.test(f)) {
    const target = infos[stepNumber(f) - 1]
    if (!target || stepNumber(f) >= stepNumber(step.id)) throw stepError(step, `forEach « ${f} » cite une étape qui ne la précède pas.`)
    if (!target.loop) throw stepError(step, `forEach « ${f} » : ${f} ne boucle pas. Cite une liste (« ${f}.leadIds ») ou une boucle.`)
    if (target.loop.count > most) throw stepError(step, `${most} éléments au plus dans une boucle de ${step.action}.`)
    return target.loop
  }
  if (!REF.test(f)) throw stepError(step, `forEach « ${f} » : une liste écrite, « s1.targetIds » ou « s2 ».`)
  const { target, spec: ex } = exportOf(infos, step, f)
  const count = ex.kind === "id" ? (target.loop ? target.loop.count : 1) : maxOf(ex, target.input) * (target.loop?.count ?? 1)
  if (ex.kind === "id" && !target.loop) throw stepError(step, `forEach « ${f} » : c'est un seul élément, pas une liste.`)
  if (count > most) throw stepError(step, `forEach « ${f} » peut compter jusqu'à ${count} éléments, ${most} au plus pour ${step.action} : retiens-en moins avant (select_leads, limit).`)
  const each = ex.each ?? "chaque élément"
  return { origin: step.id, count, literal: null, first: `Pour ${each} de l'étape ${stepNumber(target.step.id)}`, next: `Pour ${each}` }
}

/** The input with each reference replaced by a value of its shape, to check the rest of it against the action's schema. */
function sampleInput(infos: Info[], step: PlanStep, spec: MissionAction, input: Record<string, unknown>, loop: Loop | null): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [field, value] of Object.entries(input)) {
    if (!isRef(value)) {
      if (value && typeof value === "object" && !Array.isArray(value) && "$ref" in value) throw stepError(step, `${field} : une référence s'écrit { "$ref": "s1.searchId" }, seule.`)
      out[field] = value
      continue
    }
    if (value.$ref === "item") {
      if (!loop) throw stepError(step, `${field} : { "$ref": "item" } n'a de sens que dans une boucle (forEach).`)
      out[field] = loop.literal ? loop.literal[0] : `ref_item_${step.id}`
      continue
    }
    if (!REF.test(value.$ref)) throw stepError(step, `${field} : référence « ${value.$ref} » invalide ; écris « s2.searchId » ou « item ».`)
    const { target, name, spec: ex } = exportOf(infos, step, value.$ref)
    const same = !!loop && target.loop?.origin === loop.origin
    const many = ex.kind === "ids" || (!!target.loop && !same)
    const size = spec.chunk ? 1 : Math.min(maxOf(ex, target.input) * (target.loop && !same ? target.loop.count : 1), 3_000)
    out[field] = many ? Array.from({ length: Math.max(size, 1) }, (_, n) => `ref_${target.step.id}_${name}_${n}`) : `ref_${target.step.id}_${name}`
  }
  return out
}

/** The values of a step in words, its references named by where they come from. */
function wordsFor(user: CurrentUser, infos: Info[], step: PlanStep, loop: Loop | null): Words {
  const refWords = (ref: Ref, item: string) => {
    if (ref.$ref === "item") return loop?.literal ? loop.literal[0] : item
    const { target, spec } = exportOf(infos, step, ref.$ref)
    return loop && target.loop?.origin === loop.origin ? spec.own : `${spec.what} de l'étape ${stepNumber(target.step.id)}`
  }
  const named = async (value: unknown, item: string, find: (id: string) => Promise<string | null>, missing: string) => {
    if (isRef(value)) return refWords(value, item)
    const id = typeof value === "string" ? value : ""
    const name = id ? await find(id) : null
    if (!name) throw stepError(step, missing)
    return name
  }
  const ws = user.workspaceId
  return {
    of: (v) => (isRef(v) ? refWords(v, "l'élément") : String(v ?? "")),
    campaign: (v) =>
      named(v, "la campagne", async (id) => {
        const c = await prisma.campaign.findFirst({ where: { id, workspaceId: ws, archivedAt: null }, select: { name: true } })
        return c && `la campagne « ${c.name} »`
      }, "campagne introuvable : retrouve son campaignId avec list_campaigns."),
    sequence: (v) =>
      named(v, "la séquence", async (id) => {
        const s = await prisma.sequence.findFirst({ where: { id, workspaceId: ws, archivedAt: null }, select: { name: true } })
        return s && `la séquence « ${s.name} »`
      }, "séquence introuvable : retrouve son sequenceId avec list_sequences."),
    member: (v) =>
      named(v, "le membre", async (id) => {
        const u = await prisma.user.findFirst({ where: { id, workspaceId: ws, active: true }, select: { name: true, email: true } })
        return u && (u.name ?? u.email ?? "un membre")
      }, "membre introuvable : retrouve son userId avec list_team."),
    leads: async (v) => {
      if (isRef(v)) return refWords(v, "la fiche")
      const list = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
      try {
        return (await targetsOf(user, list)).text
      } catch (error) {
        throw stepError(step, error instanceof Error ? error.message : String(error))
      }
    },
    lead: (v) => named(v, "la fiche", (id) => visibleName(user, id).catch(() => null), "fiche introuvable pour cette personne : vérifie le leadId avec search_leads."),
    search: (v) =>
      named(v, "la recherche", async (id) => {
        const s = await prisma.extractionSearch.findFirst({ where: { id, workspaceId: ws }, select: { label: true } })
        return s && `la recherche « ${s.label} »`
      }, "recherche introuvable : retrouve son searchId avec list_searches."),
    target: (v) =>
      named(v, "la cible", async (id) => {
        const t = await prisma.strategyTarget.findFirst({ where: { id, proposal: { workspaceId: ws } }, select: { sector: true } })
        return t && `la cible « ${t.sector} »`
      }, "cible introuvable : retrouve son targetId avec get_strategy."),
    offer: (v) =>
      named(v, "l'offre", async (slug) => {
        const o = await prisma.offer.findFirst({ where: { workspaceId: ws, slug, status: "ACTIVE" }, select: { name: true } })
        return o && `« ${o.name} »`
      }, "offre introuvable parmi les offres actives : lis-les avec list_offers."),
  }
}

/** What a run of the agent usually costs here: the workspace's average over 60 days, or a typical figure. */
async function typicalMicros(workspaceId: string, agentId: AgentId): Promise<number> {
  const since = new Date(Date.now() - 60 * 24 * 3600_000)
  const [row] = await prisma.$queryRaw<{ avg: number | null; n: bigint }[]>`
    SELECT AVG("costMicros")::float AS "avg", COUNT(*) AS "n" FROM "AgentRun"
     WHERE "workspaceId" = ${workspaceId} AND "agentId" = ${agentId} AND "status" = 'SUCCEEDED' AND "createdAt" >= ${since} AND ("input"->>'kind') IS NULL`
  return row && Number(row.n) >= 3 && row.avg !== null ? Math.round(row.avg) : (TYPICAL_MICROS[agentId] ?? 50_000)
}

/** Fiches a campaign still has to sort, for a plan that sorts a campaign it names. */
async function unsortedIn(user: CurrentUser, campaignId: string): Promise<number> {
  return prisma.lead.count({ where: { AND: [visibleLeads(user, { campaignId }), { relevances: { none: { campaignId } } }] } })
}

export async function checkPlan(user: CurrentUser, policy: AgentPolicy, raw: unknown): Promise<PlanCheck> {
  const parsed = planSchema.safeParse(raw)
  if (!parsed.success) throw invalid(`Plan invalide : ${issuesText(parsed.error)}`)
  const plan = parsed.data
  const ctx: ToolContext = { run: { id: "mission", workspaceId: user.workspaceId, agentId: "copilot", requester: user, userKey: user.id, leadId: null }, policy }
  const infos: Info[] = []
  const steps: CheckedStep[] = []
  const volume: Volume = { searches: 0, results: 0, audits: 0, drafts: 0 }
  const runs: Partial<Record<AgentId, number>> = {}
  let unsorted = 0

  for (const [index, step] of plan.steps.entries()) {
    if (step.id !== `s${index + 1}`) throw invalid(`Les étapes se numérotent s1, s2… dans l'ordre : s${index + 1} attendue, ${step.id} trouvée.`)
    const spec = MISSION_ACTIONS[step.action]
    if (!spec) throw stepError(step, `ce n'est pas une action de mission. Actions possibles : ${MISSION_ACTION_NAMES.join(", ")}.`)
    try {
      checkRight(spec.def, ctx)
    } catch (error) {
      throw stepError(step, error instanceof Error ? error.message : String(error))
    }
    const input = spec.prepare ? spec.prepare(step.input) : step.input
    if (step.action === "act_on_target" && input.action !== "search" && input.action !== "campaign") throw stepError(step, "dans une mission, action « search » ou « campaign ».")
    const loop = loopOf(infos, step, spec)
    const checked = spec.def.input.safeParse(sampleInput(infos, step, spec, input, loop))
    if (!checked.success) throw stepError(step, issuesText(checked.error))
    infos.push({ step: { ...step, input }, spec, input, loop })

    const w = wordsFor(user, infos, step, loop)
    let text = await spec.describe(input, w)
    if (loop?.literal && loop.origin === step.id && loop.literal.length > 1) text = `${text}, puis de même pour ${listWords(loop.literal.slice(1))}`
    else if (loop && !(loop.literal && loop.origin === step.id)) text = `${loop.origin === step.id ? loop.first : loop.next} : ${lower(text)}`
    steps.push({ ...step, input, text, level: approvalOf(spec.def, ctx) })

    const times = loop?.count ?? 1
    const v = spec.volume?.(input) ?? {}
    volume.searches += (v.searches ?? 0) * times
    volume.results += (v.results ?? 0) * times
    volume.audits += (v.audits ?? 0) * times
    volume.drafts += (v.drafts ?? 0) * times
    if (spec.ai && spec.ai !== "qualifier") runs[spec.ai] = (runs[spec.ai] ?? 0) + times
    if (step.action === "sort_campaign" && typeof input.campaignId === "string") unsorted += await unsortedIn(user, input.campaignId)
  }

  if (volume.searches > MISSION_BOUNDS.searches) throw invalid(`Ce plan lance ${volume.searches} recherches : ${MISSION_BOUNDS.searches} au plus par mission.`)
  if (volume.results > MISSION_BOUNDS.results) throw invalid(`Ce plan peut ramener ${plural(volume.results, "entreprise", "entreprises")} : ${plural(MISSION_BOUNDS.results, "entreprise", "entreprises")} au plus par mission (baisse maxResults).`)
  if (volume.audits > MISSION_BOUNDS.audits) throw invalid(`Ce plan lance ${volume.audits} audits : ${MISSION_BOUNDS.audits} au plus par mission.`)
  if (volume.drafts > MISSION_BOUNDS.drafts) throw invalid(`Ce plan demande ${volume.drafts} brouillons : ${MISSION_BOUNDS.drafts} au plus par mission.`)

  // Jev sorts every fiche imported into a campaign, and what a sorted campaign still holds, by batches.
  const sorts = plan.steps.some((s) => s.action === "sort_campaign" || s.action === "import_search")
  const batches = (fiches: number) => Math.ceil(fiches / RELEVANCE_BATCH)
  const qualifier = sorts ? { max: batches(volume.results + unsorted), probable: batches(volume.results * PROBABLE_IMPORT_SHARE + unsorted) } : { max: 0, probable: 0 }
  if (qualifier.max) runs.qualifier = qualifier.max

  let maxMicros = 0
  let probableMicros = 0
  for (const [agentId, n] of Object.entries(runs) as [AgentId, number][]) {
    const [cap, typical] = await Promise.all([effectiveAgent(user.workspaceId, agentId).then((a) => a.capMicros), typicalMicros(user.workspaceId, agentId)])
    maxMicros += n * cap
    probableMicros += (agentId === "qualifier" ? qualifier.probable : n) * Math.min(typical, cap)
  }
  return { plan: { ...plan, steps }, probableMicros, maxMicros, volume, runs }
}
