import { z } from "zod"
import type { RelevanceVerdict } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { CurrentUser } from "@/lib/auth/guard"
import { campaignStatus, leadStatus } from "@/lib/crm/status"
import { visibleLeads } from "@/features/metrics/service"
import { effectiveVerdict } from "@/features/relevance/rules"
import { DEFAULT_SEARCH_RESULTS } from "@/features/search/schemas"
import { defineTool, type AnyToolDef } from "@/features/ai/tools"
import type { AgentId } from "@/features/ai/agents"
import { NOTE_ACTIONS } from "@/features/ai/actions/notes"
import { RECORD_ACTIONS } from "@/features/ai/actions/records"
import { PROSPECTING_ACTIONS } from "@/features/ai/actions/prospecting"
import { AI_ACTIONS } from "@/features/ai/actions/ai-work"
import { OUTREACH_ACTIONS } from "@/features/ai/actions/outreach"
import { clip, idOf, personOf, plural } from "@/features/ai/actions/shared"

/**
 * The actions a mission may run (E28, docs/crm-v1/AGENTS-IA.md §17): actions of the catalogue, with what a mission needs
 * to chain them. What each gives to the steps after it, what it waits for once launched (a search, a specialist's run,
 * Jev's sorting), what it costs in AI, its bounds, and its words for the plan card and the report. Rights, inputs and
 * execution stay the action's own: a mission runs nothing the person could not run from the chat.
 */

export type ExportKind = "id" | "ids"

export interface ExportSpec {
  kind: ExportKind
  /** In words from another step: « la recherche ». */
  what: string
  /** In words inside the same loop: « sa recherche ». */
  own: string
  /** For a loop over it: « chaque cible ». */
  each?: string
  /** Most a list holds; from the step's input when it says. */
  max?: number | ((input: Record<string, unknown>) => number)
}

export interface Volume {
  searches: number
  results: number
  audits: number
  drafts: number
}

/** Values in words for the plan card: a reference (« la recherche de l'étape 2 ») or what the CRM calls it. */
export interface Words {
  of: (value: unknown) => string
  campaign: (value: unknown) => Promise<string>
  sequence: (value: unknown) => Promise<string>
  member: (value: unknown) => Promise<string>
  leads: (value: unknown) => Promise<string>
  lead: (value: unknown) => Promise<string>
  search: (value: unknown) => Promise<string>
  target: (value: unknown) => Promise<string>
  offer: (value: unknown) => Promise<string>
}

export interface Done {
  input: Record<string, unknown>
  output: Record<string, unknown>
  missionId: string
}

export interface Settled {
  exports: Record<string, string | string[] | null>
  /** Its line in the card and the report. */
  line: string
}

export type Wait = { kind: "search" | "run" | "sort"; id: string }

export interface MissionAction {
  def: AnyToolDef
  /** Its input and what it gives, for the model (propose_mission's description). */
  signature: string
  exports: Record<string, ExportSpec>
  /** Items when it loops; LOOP_MAX by default. */
  loopMax?: number
  /** A list of fiches longer than this runs in parts of this size. */
  chunk?: number
  /** One run of this agent per execution: its cap counts against the mission's. */
  ai?: AgentId
  volume?: (input: Record<string, unknown>) => Partial<Volume>
  /** Defaults a mission writes into the input before anything else. */
  prepare?: (input: Record<string, unknown>) => Record<string, unknown>
  describe: (input: Record<string, unknown>, w: Words) => Promise<string>
  /** Launches the step; the action's own execution by default. */
  start?: (input: Record<string, unknown>) => Promise<Record<string, unknown>>
  /** What it waits for once launched. */
  waitOf?: (output: Record<string, unknown>, input: Record<string, unknown>) => Wait | null
  /** Once it is over: what later steps may cite, and its line. */
  settle: (done: Done, user: CurrentUser) => Promise<Settled>
}

/** A target of the Stratège searched in a mission without a size: a few hundred businesses. */
export const MISSION_TARGET_RESULTS = 300
/** Fiches an import can give to a later step. */
export const IMPORT_EXPORT_MAX = 1_000

const str = (v: unknown) => (typeof v === "string" ? v : null)
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0)
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [])
const quoted = (v: string) => `« ${v} »`

// The families' own lists, not the catalogue: the catalogue lists the missions' tools in turn.
const byName = new Map<string, AnyToolDef>([...NOTE_ACTIONS, ...RECORD_ACTIONS, ...PROSPECTING_ACTIONS, ...AI_ACTIONS, ...OUTREACH_ACTIONS].map((a) => [a.name, a]))
function action(name: string): AnyToolDef {
  const def = byName.get(name)
  if (!def) throw new Error(`Action ${name} absente du catalogue`)
  return def
}

const leadName = (l: { company: { name: string } | null; contact: { name: string | null } | null } | null) => l?.company?.name ?? l?.contact?.name ?? "la fiche"

/** A search as a report line: « architecte — Nantes » : 1 000 trouvées, 640 joignables. */
async function searchLine(workspaceId: string, searchId: string | null): Promise<{ line: string; campaignId: string | null }> {
  const s = searchId ? await prisma.extractionSearch.findFirst({ where: { id: searchId, workspaceId }, select: { label: true, status: true, counters: true, campaignId: true, error: true } }) : null
  if (!s) return { line: "Recherche introuvable", campaignId: null }
  const c = (s.counters as { unique?: number; crmUseful?: number } | null) ?? {}
  const cut = s.status === "CANCELLED" ? " (arrêtée avant la fin)" : ""
  return { line: `${quoted(s.label)} : ${plural(num(c.unique), "entreprise trouvée", "entreprises trouvées")}, ${plural(num(c.crmUseful), "joignable", "joignables")}${cut}`, campaignId: s.campaignId }
}

/** Jev's sorting of a campaign, as the person sees it. */
export async function sortCounts(user: CurrentUser, campaignId: string) {
  const visible = visibleLeads(user, { campaignId })
  const [rows, unsorted] = await Promise.all([
    prisma.leadRelevance.findMany({ where: { campaignId, lead: { is: visible } }, select: { verdict: true, outcome: true, decision: true } }),
    prisma.lead.count({ where: { AND: [visible, { relevances: { none: { campaignId } } }] } }),
  ])
  const of = (v: RelevanceVerdict) => rows.filter((r) => effectiveVerdict(r) === v).length
  return { relevant: of("RELEVANT"), maybe: of("MAYBE"), notRelevant: of("NOT_RELEVANT"), toDecide: rows.filter((r) => !effectiveVerdict(r)).length, unsorted }
}

const leadsExport = (what: string, own: string, max?: ExportSpec["max"]): ExportSpec => ({ kind: "ids", what, own, each: "chaque fiche", max })

// ---------------------------------------------------------------------------------------------------------------
// Choosing fiches: a mission's own action
// ---------------------------------------------------------------------------------------------------------------

export const SELECT_VERDICTS = ["relevant", "relevant_or_maybe", "any"] as const
const VERDICT_WORDS: Record<(typeof SELECT_VERDICTS)[number], string> = { relevant: " jugées bonnes cibles par Jev", relevant_or_maybe: " jugées bonnes cibles ou possibles par Jev", any: "" }
const RANK: Record<string, number> = { RELEVANT: 0, MAYBE: 1, none: 2, NOT_RELEVANT: 3 }

/** Fiches the mission imported so far, every import step together. */
async function importedBy(missionId: string): Promise<string[]> {
  const steps = await prisma.agentMissionStep.findMany({ where: { missionId, action: "import_search", status: "DONE" }, select: { exports: true } })
  return [...new Set(steps.flatMap((s) => ids((s.exports as { leadIds?: unknown } | null)?.leadIds)))]
}

export const selectLeadsTool = defineTool({
  name: "select_leads",
  description: "Retient les meilleures fiches d'un ensemble, d'après le tri de Jev dans leur campagne : bonnes cibles d'abord, puis possibles, par confiance.",
  permission: "lead:read",
  approval: "auto",
  costClass: "free",
  family: "read_crm",
  input: z.object({
    leadIds: z.array(z.string().min(1).max(64)).max(3_000).optional().describe("L'ensemble où choisir ; par défaut, les fiches importées par la mission"),
    campaignId: idOf("d'une campagne où choisir").optional(),
    verdict: z.enum(SELECT_VERDICTS).default("relevant"),
    limit: z.number().int().min(1).max(500),
    hasEmail: z.boolean().optional(),
  }),
  execute: async (ctx, input) => {
    const user = personOf(ctx)
    const pool = input.leadIds ?? (input.campaignId ? null : ctx.run.missionId ? await importedBy(ctx.run.missionId) : [])
    const where = visibleLeads(user, {
      ...(pool ? { id: { in: pool } } : { campaignId: input.campaignId }),
      ...(input.hasEmail ? { OR: [{ company: { email: { not: null } } }, { contact: { email: { not: null } } }] } : {}),
    })
    const leads = await prisma.lead.findMany({
      where,
      select: { id: true, score: true, createdAt: true, campaignId: true, relevances: { select: { campaignId: true, verdict: true, outcome: true, decision: true, confidence: true } } },
      take: 3_000,
    })
    const ranked = leads
      .map((l) => {
        const r = l.relevances.find((x) => x.campaignId === l.campaignId) ?? null
        const verdict = r ? effectiveVerdict(r) : null
        return { id: l.id, rank: RANK[verdict ?? "none"], confidence: r?.confidence ?? 0, score: l.score, at: l.createdAt.getTime(), verdict }
      })
      .filter((l) => (input.verdict === "relevant" ? l.verdict === "RELEVANT" : input.verdict === "relevant_or_maybe" ? l.verdict === "RELEVANT" || l.verdict === "MAYBE" : true))
      .sort((a, b) => a.rank - b.rank || b.confidence - a.confidence || b.score - a.score || a.at - b.at)
    const chosen = ranked.slice(0, input.limit).map((l) => l.id)
    return { done: true, leadIds: chosen, count: chosen.length, pool: leads.length }
  },
  forModel: (o) => ({ done: o.done, count: o.count, pool: o.pool }),
})

// ---------------------------------------------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------------------------------------------

const campaignExport: ExportSpec = { kind: "id", what: "la campagne", own: "sa campagne" }
const leadIdsOf = (input: Record<string, unknown>) => ids(input.leadIds)

const listAction = (name: string, signature: string, verb: (input: Record<string, unknown>, w: Words) => Promise<string>, line: (o: Record<string, unknown>, input: Record<string, unknown>) => string): MissionAction => ({
  def: action(name),
  signature: `${name} ${signature} → leadIds ; par lots de 500`,
  exports: { leadIds: leadsExport("les mêmes fiches", "les mêmes fiches") },
  chunk: 500,
  describe: verb,
  settle: async ({ input, output }) => ({ exports: { leadIds: leadIdsOf(input) }, line: line(output, input) }),
})

export const MISSION_ACTIONS: Record<string, MissionAction> = {
  create_campaign: {
    def: action("create_campaign"),
    signature: "create_campaign {name, sector?, area?, offerSlug?, goalLeads?, status?} → campaignId",
    exports: { campaignId: campaignExport },
    describe: async (i, w) => {
      const bits = [str(i.sector), str(i.area), i.offerSlug ? `offre ${await w.offer(i.offerSlug)}` : null].filter(Boolean)
      return `Créer la campagne ${quoted(w.of(i.name))}${bits.length ? ` (${bits.join(", ")})` : ""}${i.status === "ACTIVE" ? ", active" : ", en brouillon"}`
    },
    settle: async ({ output }) => ({ exports: { campaignId: str(output.campaignId) }, line: `Campagne ${quoted(str(output.name) ?? "")} créée` }),
  },
  update_campaign: {
    def: action("update_campaign"),
    signature: "update_campaign {campaignId, status?, name?, goalLeads?, offerSlug?…} → campaignId",
    exports: { campaignId: campaignExport },
    describe: async (i, w) => `Modifier ${await w.campaign(i.campaignId)}${typeof i.status === "string" && i.status in campaignStatus ? ` : statut ${quoted(campaignStatus[i.status as keyof typeof campaignStatus].label)}` : ""}`,
    settle: async ({ input, output }) => ({ exports: { campaignId: str(input.campaignId) }, line: `Campagne ${quoted(str(output.name) ?? "")} modifiée${output.status ? ` (${output.status})` : ""}` }),
  },
  start_search: {
    def: action("start_search"),
    signature: "start_search {activity, location, maxResults?, enrich?, campaignId?} → searchId, campaignId ; attend la fin de la recherche",
    exports: { searchId: { kind: "id", what: "la recherche", own: "sa recherche" }, campaignId: campaignExport },
    volume: (i) => ({ searches: 1, results: num(i.maxResults) || DEFAULT_SEARCH_RESULTS }),
    describe: async (i, w) =>
      `Rechercher ${quoted(`${w.of(i.activity)} — ${w.of(i.location)}`)} sur l'Extractor (${plural(num(i.maxResults) || DEFAULT_SEARCH_RESULTS, "entreprise", "entreprises")} au plus, ${i.enrich === false ? "sans les emails" : "avec les emails"})${i.campaignId ? `, pour ${await w.campaign(i.campaignId)}` : ""}`,
    waitOf: (o) => (str(o.searchId) ? { kind: "search", id: str(o.searchId)! } : null),
    settle: async ({ output }, user) => {
      const s = await searchLine(user.workspaceId, str(output.searchId))
      return { exports: { searchId: str(output.searchId), campaignId: s.campaignId }, line: s.line }
    },
  },
  import_search: {
    def: action("import_search"),
    signature: "import_search {searchId, hasEmail?} → leadIds (les fiches nouvelles), campaignId ; Jev trie seul les fiches d'une campagne",
    exports: { leadIds: leadsExport("les fiches importées", "ses fiches importées", IMPORT_EXPORT_MAX), campaignId: campaignExport },
    describe: async (i, w) => `Importer les entreprises joignables${i.hasEmail ? " avec un email" : ""} de ${await w.search(i.searchId)}, sans doublon`,
    settle: async ({ input, output }, user) => {
      const batchId = str(output.batchId)
      const [leads, search] = await Promise.all([
        batchId ? prisma.lead.findMany({ where: { workspaceId: user.workspaceId, importBatchId: batchId }, select: { id: true }, orderBy: { createdAt: "asc" }, take: IMPORT_EXPORT_MAX }) : [],
        prisma.extractionSearch.findFirst({ where: { id: str(input.searchId) ?? "", workspaceId: user.workspaceId }, select: { campaignId: true } }),
      ])
      return {
        exports: { leadIds: leads.map((l) => l.id), campaignId: search?.campaignId ?? null },
        line: `${plural(num(output.created), "fiche nouvelle", "fiches nouvelles")}, ${plural(num(output.alreadyKnown), "déjà connue", "déjà connues")}`,
      }
    },
  },
  sort_campaign: {
    def: action("sort_campaign"),
    signature: "sort_campaign {campaignId} → campaignId ; attend que Jev ait trié toutes ses fiches",
    exports: { campaignId: campaignExport },
    ai: "qualifier",
    describe: async (i, w) => `Faire trier par Jev les fiches de ${await w.campaign(i.campaignId)} : bonne cible, possible ou hors cible`,
    // The sorting itself is asked for while the step waits (features/missions/engine.ts): an import may have started it.
    start: async (i) => ({ campaignId: i.campaignId }),
    waitOf: (_, i) => (str(i.campaignId) ? { kind: "sort", id: str(i.campaignId)! } : null),
    settle: async ({ input }, user) => {
      const c = await sortCounts(user, str(input.campaignId) ?? "")
      const rest = c.unsorted ? `, ${plural(c.unsorted, "non triée", "non triées")}` : ""
      return { exports: { campaignId: str(input.campaignId) }, line: `Jev : ${plural(c.relevant, "bonne cible", "bonnes cibles")}, ${plural(c.maybe, "possible", "possibles")}, ${plural(c.notRelevant, "hors cible", "hors cible")}${rest}` }
    },
  },
  propose_targets: {
    def: action("propose_targets"),
    signature: "propose_targets {zone?, focus?, offerSlug?} → targetIds (2 à 4 cibles) ; attend le Stratège",
    exports: { targetIds: { kind: "ids", what: "les cibles", own: "ses cibles", each: "chaque cible", max: 4 } },
    ai: "strategist",
    describe: async (i, w) => `Demander au Stratège 2 à 4 secteurs à prospecter${i.zone ? ` à ${w.of(i.zone)}` : ""}${i.offerSlug ? ` pour l'offre ${await w.offer(i.offerSlug)}` : ""}${i.focus ? ` (${clip(w.of(i.focus), 100)})` : ""}`,
    waitOf: (o) => (str(o.runId) ? { kind: "run", id: str(o.runId)! } : null),
    settle: async ({ output }) => {
      const targets = await prisma.strategyTarget.findMany({ where: { proposalId: str(output.proposalId) ?? "", status: "PROPOSED" }, orderBy: { rank: "asc" }, take: 4, select: { id: true, sector: true } })
      return { exports: { targetIds: targets.map((t) => t.id) }, line: targets.length ? `${plural(targets.length, "cible", "cibles")} : ${targets.map((t) => t.sector).join(", ")}` : "Aucune cible proposée" }
    },
  },
  act_on_target: {
    def: action("act_on_target"),
    signature: `act_on_target {targetId, action: "search" | "campaign", maxResults?} → campaignId, searchId ; « search » crée la campagne de la cible et attend la fin de sa recherche (${MISSION_TARGET_RESULTS} entreprises par défaut)`,
    exports: { campaignId: campaignExport, searchId: { kind: "id", what: "la recherche", own: "sa recherche" } },
    prepare: (i) => (i.action === "search" && i.maxResults === undefined ? { ...i, maxResults: MISSION_TARGET_RESULTS } : i),
    volume: (i) => (i.action === "search" ? { searches: 1, results: num(i.maxResults) || MISSION_TARGET_RESULTS } : {}),
    describe: async (i, w) => {
      const target = await w.target(i.targetId)
      if (i.action !== "search") return `Créer la campagne de ${target}, en brouillon`
      return `Créer la campagne de ${target} et lancer sa recherche (${plural(num(i.maxResults) || MISSION_TARGET_RESULTS, "entreprise", "entreprises")} au plus)`
    },
    waitOf: (o) => (str(o.searchId) ? { kind: "search", id: str(o.searchId)! } : null),
    settle: async ({ output }, user) => {
      if (!str(output.searchId)) return { exports: { campaignId: str(output.campaignId), searchId: null }, line: "Campagne créée" }
      const s = await searchLine(user.workspaceId, str(output.searchId))
      return { exports: { campaignId: str(output.campaignId) ?? s.campaignId, searchId: str(output.searchId) }, line: s.line }
    },
  },
  select_leads: {
    def: selectLeadsTool,
    signature: `select_leads {limit, verdict?: "relevant" (défaut) | "relevant_or_maybe" | "any", hasEmail?, leadIds?, campaignId?} → leadIds ; par défaut parmi les fiches importées par la mission`,
    exports: { leadIds: leadsExport("les fiches retenues", "ses fiches retenues", (i) => num(i.limit) || 500) },
    describe: async (i, w) => {
      const verdict = VERDICT_WORDS[(i.verdict as keyof typeof VERDICT_WORDS) ?? "relevant"] ?? ""
      const pool = i.leadIds ? `parmi ${await w.leads(i.leadIds)}` : i.campaignId ? `dans ${await w.campaign(i.campaignId)}` : "parmi les fiches importées par la mission"
      return `Retenir les ${plural(num(i.limit), "meilleure fiche", "meilleures fiches")}${verdict}${i.hasEmail ? " avec un email" : ""}, ${pool}`
    },
    settle: async ({ output }) => ({ exports: { leadIds: ids(output.leadIds) }, line: `${plural(num(output.count), "fiche retenue", "fiches retenues")} sur ${plural(num(output.pool), "fiche", "fiches")}` }),
  },
  tag_leads: listAction(
    "tag_leads",
    "{leadIds, tag}",
    async (i, w) => `Étiqueter ${quoted(w.of(i.tag).toLowerCase())} ${await w.leads(i.leadIds)}`,
    (o) => `${plural(num(o.updated), "fiche étiquetée", "fiches étiquetées")} ${quoted(str(o.tag) ?? "")}`
  ),
  file_in_campaign: listAction(
    "file_in_campaign",
    "{leadIds, campaignId}",
    async (i, w) => `Ranger ${await w.leads(i.leadIds)} ${i.campaignId ? `dans ${await w.campaign(i.campaignId)}` : "hors campagne"}`,
    (o) => `${plural(num(o.updated), "fiche rangée", "fiches rangées")}`
  ),
  assign_leads: listAction(
    "assign_leads",
    "{leadIds, ownerId}",
    async (i, w) => `Attribuer ${await w.leads(i.leadIds)} ${i.ownerId ? `à ${await w.member(i.ownerId)}` : "au pool commun"}`,
    (o) => `${plural(num(o.updated), "fiche attribuée", "fiches attribuées")}`
  ),
  set_lead_status: listAction(
    "set_lead_status",
    "{leadIds, status}",
    async (i, w) => `Passer ${await w.leads(i.leadIds)} en ${quoted(typeof i.status === "string" && i.status in leadStatus ? leadStatus[i.status as keyof typeof leadStatus].label : w.of(i.status))}`,
    (o) => `${plural(num(o.updated), "fiche mise à jour", "fiches mises à jour")} (${str(o.status) ?? ""})`
  ),
  start_audit: {
    def: action("start_audit"),
    signature: "start_audit {leadId} → leadId ; en boucle sur des fiches retenues (20 au plus) ; attend l'Auditeur",
    exports: { leadId: { kind: "id", what: "la fiche auditée", own: "sa fiche" } },
    loopMax: 20,
    ai: "auditor",
    volume: () => ({ audits: 1 }),
    describe: async (i, w) => `Faire auditer par l'Auditeur le site et la présence en ligne de ${await w.lead(i.leadId)}`,
    waitOf: (o) => (o.started === true && str(o.runId) ? { kind: "run", id: str(o.runId)! } : null),
    settle: async ({ input, output }, user) => {
      const lead = await prisma.lead.findFirst({ where: { id: str(input.leadId) ?? "", workspaceId: user.workspaceId }, select: { company: { select: { name: true } }, contact: { select: { name: true } } } })
      return { exports: { leadId: str(input.leadId) }, line: `Audit de ${leadName(lead)}${output.reused ? " : un audit récent existait déjà" : ""}` }
    },
  },
  draft_email: {
    def: action("draft_email"),
    signature: "draft_email {leadId} → leadId ; en boucle sur des fiches retenues (20 au plus) ; un brouillon à relire, rien n'est envoyé",
    exports: { leadId: { kind: "id", what: "la fiche", own: "sa fiche" } },
    loopMax: 20,
    ai: "writer",
    volume: () => ({ drafts: 1 }),
    describe: async (i, w) => `Faire écrire par le Rédacteur un premier email pour ${await w.lead(i.leadId)}, à relire avant tout envoi`,
    waitOf: (o) => (str(o.runId) ? { kind: "run", id: str(o.runId)! } : null),
    settle: async ({ input }, user) => {
      const lead = await prisma.lead.findFirst({ where: { id: str(input.leadId) ?? "", workspaceId: user.workspaceId }, select: { company: { select: { name: true } }, contact: { select: { name: true } } } })
      return { exports: { leadId: str(input.leadId) }, line: `Brouillon prêt pour ${leadName(lead)}` }
    },
  },
  enroll_in_sequence: {
    def: action("enroll_in_sequence"),
    signature: "enroll_in_sequence {sequenceId, leadIds (100 au plus)} → leadIds ; attend toujours le clic de la personne, qui voit les destinataires",
    exports: { leadIds: leadsExport("les fiches inscrites", "ses fiches inscrites") },
    describe: async (i, w) => `Inscrire ${await w.leads(i.leadIds)} dans ${await w.sequence(i.sequenceId)}`,
    settle: async ({ input, output }) => ({ exports: { leadIds: leadIdsOf(input) }, line: `${plural(num(output.enrolled), "fiche inscrite", "fiches inscrites")}${num(output.skippedCount) ? `, ${plural(num(output.skippedCount), "écartée", "écartées")}` : ""}` }),
  },
}

/** The registry, checked once: every action exists, and its exports are named for references. */
for (const [name, spec] of Object.entries(MISSION_ACTIONS)) {
  if (spec.def.name !== name) throw new Error(`Mission : ${name} ne correspond pas à ${spec.def.name}`)
  for (const key of Object.keys(spec.exports)) if (!/^[a-zA-Z]{2,24}$/.test(key)) throw new Error(`Mission : export ${name}.${key} invalide`)
}

export const MISSION_ACTION_NAMES = Object.keys(MISSION_ACTIONS)

/** For the model: each action with its input and what it gives. */
export const missionSignatures = () =>
  Object.entries(MISSION_ACTIONS)
    .map(([, a]) => `- ${a.signature}`)
    .join("\n")
