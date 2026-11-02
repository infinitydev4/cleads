import type { PageKind } from "./page-kind"

/**
 * What the copilot's panel shows (E24), shared by the server and the browser: the tools in words, the fiches an answer
 * read (links under the answer, and what the conversation follows for erasure), and questions to start with.
 */

/** Tools that change something or hand work to a specialist: they wait for the person's click. */
export const ACTION_TOOLS: ReadonlySet<string> = new Set(["create_task", "add_note", "start_audit", "suggest_offers", "draft_email", "start_studio"])

/** While a tool runs, then once it is done. */
export const TOOL_LABELS: Record<string, { running: string; done: string }> = {
  search_leads: { running: "Recherche dans les fiches…", done: "Fiches consultées" },
  get_lead: { running: "Lecture de la fiche…", done: "Fiche lue" },
  get_lead_audit: { running: "Lecture de l’audit…", done: "Audit lu" },
  get_lead_offers: { running: "Lecture des offres suggérées…", done: "Offres lues" },
  get_today: { running: "Lecture de votre journée…", done: "Journée lue" },
  list_meetings: { running: "Lecture de l’agenda…", done: "Agenda lu" },
  get_pipeline: { running: "Lecture du pipeline…", done: "Pipeline lu" },
  list_campaigns: { running: "Lecture des campagnes…", done: "Campagnes lues" },
  get_campaign: { running: "Lecture de la campagne…", done: "Campagne lue" },
  read_skill: { running: "Lecture d’un savoir-faire…", done: "Savoir-faire lu" },
  create_task: { running: "Création de la tâche…", done: "Tâche créée" },
  add_note: { running: "Ajout de la note…", done: "Note ajoutée" },
  start_audit: { running: "Lancement de l’audit…", done: "Audit confié à l’Auditeur" },
  suggest_offers: { running: "Lancement du Conseiller…", done: "Offres confiées au Conseiller" },
  draft_email: { running: "Lancement du Rédacteur…", done: "Brouillon confié au Rédacteur" },
  start_studio: { running: "Lancement du Studio…", done: "Maquette confiée au Designer" },
}

export const toolLabel = (name: string, state: "running" | "done") => TOOL_LABELS[name]?.[state] ?? (state === "running" ? "Recherche…" : "Fait")

/** The title an action's card wears while it waits for the person. */
export const ACTION_TITLES: Record<string, string> = {
  create_task: "Créer une tâche",
  add_note: "Ajouter une note",
  start_audit: "Lancer un audit IA",
  suggest_offers: "Demander les offres",
  draft_email: "Écrire un brouillon",
  start_studio: "Ouvrir une maquette",
}

export interface LeadRef {
  id: string
  name: string
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
const ID = /^[a-z0-9]{8,40}$/i

/** Fiches named in a tool's result ({ leadId, name } anywhere, two levels deep), first seen first. */
export function leadRefsIn(output: unknown): LeadRef[] {
  const out = new Map<string, string>()
  const visit = (v: unknown, depth: number) => {
    if (depth > 3) return
    if (Array.isArray(v)) return v.forEach((x) => visit(x, depth + 1))
    if (!isRecord(v)) return
    if (typeof v.leadId === "string" && ID.test(v.leadId) && typeof v.name === "string" && !out.has(v.leadId)) out.set(v.leadId, v.name)
    for (const x of Object.values(v)) if (typeof x === "object") visit(x, depth + 1)
  }
  visit(output, 0)
  return [...out].map(([id, name]) => ({ id, name }))
}

interface PartLike {
  type: string
  input?: unknown
  output?: unknown
  state?: string
}

/**
 * Every fiche a message's tools read or acted on: the conversation is erased with any of them. A call that failed or
 * was refused read nothing (a fiche the person may not see stays out).
 */
export function leadIdsOf(message: { parts: readonly unknown[] }): string[] {
  const ids = new Set<string>()
  for (const raw of message.parts) {
    const p = raw as PartLike
    if (!p.type?.startsWith("tool-") || p.state !== "output-available") continue
    const input = isRecord(p.input) ? p.input.leadId : null
    if (typeof input === "string" && ID.test(input)) ids.add(input)
    for (const ref of leadRefsIn(p.output)) ids.add(ref.id)
  }
  return [...ids]
}

/** Questions offered on an empty conversation, by page. */
export function suggestionsFor(kind: PageKind | null): string[] {
  switch (kind) {
    case "lead":
    case "site":
      return ["Résume cette fiche et dis-moi quoi faire ensuite", "Que dit l’audit de ce prospect ?", "Quelle offre lui proposer, et pourquoi ?"]
    case "leads":
      return ["Quelles fiches de cette liste traiter en premier ?", "Lesquelles n’ont jamais été contactées ?", "Résume cette liste en trois points"]
    case "campaign":
      return ["Comment se porte cette campagne ?", "Quelles fiches de cette campagne relancer ?", "Où la campagne perd-elle des prospects ?"]
    case "pipeline":
      return ["Quelles opportunités risquent de stagner ?", "Que me reste-t-il à conclure ce mois-ci ?", "Résume le pipeline en trois points"]
    case "meetings":
      return ["Quels rendez-vous ai-je cette semaine ?", "Quels rendez-vous restent à clôturer ?", "Prépare mon prochain rendez-vous"]
    default:
      return ["Que dois-je faire aujourd’hui ?", "Quelles fiches relancer en priorité ?", "Où en sont mes campagnes ?"]
  }
}
