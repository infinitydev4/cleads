import type { PageKind } from "./page-kind"

/**
 * What the copilot's panel shows (E24), shared by the server and the browser: the tools in words, the fiches an answer
 * read (links under the answer, and what the conversation follows for erasure), and questions to start with.
 */

/** Tools that change something or hand work to a specialist (E28: every family but reading and navigation). */
export const ACTION_TOOLS: ReadonlySet<string> = new Set([
  "add_note", "log_call", "create_task", "complete_task", "reschedule_task", "tag_leads", "untag_leads",
  "create_lead", "update_lead", "set_lead_status", "assign_leads", "file_in_campaign", "qualify_lead", "move_deal",
  "create_campaign", "update_campaign", "start_search", "cancel_search", "import_search", "sort_campaign",
  "start_audit", "start_research", "suggest_offers", "decide_offer", "draft_email", "draft_reply", "start_studio", "studio_build", "studio_revise", "share_studio_link", "propose_targets", "act_on_target",
  "enroll_in_sequence", "stop_enrollment", "pause_sequence", "resume_sequence", "book_meeting", "change_meeting", "record_meeting_outcome",
  "propose_mission", "manage_mission",
])

/** While a tool runs, then once it is done. */
export const TOOL_LABELS: Record<string, { running: string; done: string }> = {
  find_actions: { running: "Recherche d’une action…", done: "Actions trouvées" },
  search_leads: { running: "Recherche dans les fiches…", done: "Fiches consultées" },
  get_lead: { running: "Lecture de la fiche…", done: "Fiche lue" },
  get_timeline: { running: "Lecture de l’historique…", done: "Historique lu" },
  get_lead_audit: { running: "Lecture de l’audit…", done: "Audit lu" },
  get_lead_registry: { running: "Lecture du registre…", done: "Registre lu" },
  list_signals: { running: "Lecture des signaux…", done: "Signaux lus" },
  get_lead_research: { running: "Lecture des recherches…", done: "Recherches lues" },
  get_lead_offers: { running: "Lecture des offres suggérées…", done: "Offres lues" },
  get_today: { running: "Lecture de votre journée…", done: "Journée lue" },
  list_meetings: { running: "Lecture de l’agenda…", done: "Agenda lu" },
  list_slots: { running: "Lecture des créneaux…", done: "Créneaux lus" },
  get_pipeline: { running: "Lecture du pipeline…", done: "Pipeline lu" },
  list_campaigns: { running: "Lecture des campagnes…", done: "Campagnes lues" },
  get_campaign: { running: "Lecture de la campagne…", done: "Campagne lue" },
  get_campaign_sorting: { running: "Lecture du tri de la campagne…", done: "Tri lu" },
  get_strategy: { running: "Lecture des cibles du Stratège…", done: "Cibles lues" },
  list_searches: { running: "Lecture des recherches…", done: "Recherches lues" },
  get_search: { running: "Lecture de la recherche…", done: "Recherche lue" },
  preview_import: { running: "Aperçu de l’import…", done: "Aperçu de l’import" },
  list_sequences: { running: "Lecture des séquences…", done: "Séquences lues" },
  list_replies: { running: "Lecture des réponses…", done: "Réponses lues" },
  get_metrics: { running: "Lecture des chiffres…", done: "Chiffres lus" },
  list_team: { running: "Lecture de l’équipe…", done: "Équipe lue" },
  list_sectors: { running: "Lecture des secteurs de l’Extractor…", done: "Secteurs lus" },
  search_prospect_base: { running: "Recherche dans la base de l’Extractor…", done: "Base de l’Extractor consultée" },
  extractor_health: { running: "État de l’Extractor…", done: "État de l’Extractor lu" },
  list_offers: { running: "Lecture du catalogue d’offres…", done: "Catalogue lu" },
  read_skill: { running: "Lecture d’un savoir-faire…", done: "Savoir-faire lu" },
  open_page: { running: "Ouverture de la page…", done: "Page ouverte" },
  add_note: { running: "Ajout de la note…", done: "Note ajoutée" },
  log_call: { running: "Enregistrement de l’appel…", done: "Appel enregistré" },
  create_task: { running: "Création de la tâche…", done: "Tâche créée" },
  complete_task: { running: "Mise à jour de la tâche…", done: "Tâche faite" },
  reschedule_task: { running: "Replanification de la tâche…", done: "Tâche replanifiée" },
  tag_leads: { running: "Ajout de l’étiquette…", done: "Fiches étiquetées" },
  untag_leads: { running: "Retrait de l’étiquette…", done: "Étiquette retirée" },
  create_lead: { running: "Création de la fiche…", done: "Fiche créée" },
  update_lead: { running: "Modification de la fiche…", done: "Fiche modifiée" },
  set_lead_status: { running: "Changement de statut…", done: "Statut changé" },
  assign_leads: { running: "Attribution des fiches…", done: "Fiches attribuées" },
  file_in_campaign: { running: "Rangement des fiches…", done: "Fiches rangées" },
  qualify_lead: { running: "Qualification…", done: "Qualification enregistrée" },
  move_deal: { running: "Mise à jour de l’opportunité…", done: "Opportunité mise à jour" },
  create_campaign: { running: "Création de la campagne…", done: "Campagne créée" },
  update_campaign: { running: "Modification de la campagne…", done: "Campagne modifiée" },
  start_search: { running: "Lancement de la recherche…", done: "Recherche lancée sur l’Extractor" },
  cancel_search: { running: "Arrêt de la recherche…", done: "Recherche arrêtée" },
  import_search: { running: "Import des résultats…", done: "Résultats importés" },
  sort_campaign: { running: "Lancement du tri…", done: "Tri confié à Jev" },
  start_audit: { running: "Lancement de l’audit…", done: "Audit confié à l’Auditeur" },
  start_research: { running: "Lancement de l’Enquêteur…", done: "Recherche confiée à l’Enquêteur" },
  suggest_offers: { running: "Lancement du Conseiller…", done: "Offres confiées au Conseiller" },
  decide_offer: { running: "Décision sur l’offre…", done: "Offre décidée" },
  draft_email: { running: "Lancement du Rédacteur…", done: "Brouillon confié au Rédacteur" },
  draft_reply: { running: "Lancement du Rédacteur…", done: "Réponse confiée au Rédacteur" },
  start_studio: { running: "Lancement du Studio…", done: "Maquette confiée au Designer" },
  studio_build: { running: "Lancement de la génération…", done: "Génération confiée au Designer" },
  studio_revise: { running: "Lancement de la retouche…", done: "Retouche confiée au Designer" },
  share_studio_link: { running: "Création du lien…", done: "Lien de la maquette créé" },
  propose_targets: { running: "Lancement du Stratège…", done: "Cibles confiées au Stratège" },
  act_on_target: { running: "Suite donnée à la cible…", done: "Cible traitée" },
  enroll_in_sequence: { running: "Inscription en séquence…", done: "Fiches inscrites" },
  stop_enrollment: { running: "Arrêt de la séquence…", done: "Séquence arrêtée" },
  pause_sequence: { running: "Mise en pause de la séquence…", done: "Séquence en pause" },
  resume_sequence: { running: "Reprise de la séquence…", done: "Séquence reprise" },
  book_meeting: { running: "Planification du rendez-vous…", done: "Rendez-vous planifié" },
  change_meeting: { running: "Mise à jour du rendez-vous…", done: "Rendez-vous mis à jour" },
  record_meeting_outcome: { running: "Clôture du rendez-vous…", done: "Rendez-vous clôturé" },
  propose_mission: { running: "Préparation du plan…", done: "Plan proposé" },
  list_missions: { running: "Lecture des missions…", done: "Missions lues" },
  manage_mission: { running: "Mise à jour de la mission…", done: "Mission mise à jour" },
}

export const toolLabel = (name: string, state: "running" | "done") => TOOL_LABELS[name]?.[state] ?? (state === "running" ? "Recherche…" : "Fait")

/** The title an action's card wears while it waits for the person. */
export const ACTION_TITLES: Record<string, string> = {
  add_note: "Ajouter une note",
  log_call: "Enregistrer un appel",
  create_task: "Créer une tâche",
  complete_task: "Terminer une tâche",
  reschedule_task: "Replanifier une tâche",
  tag_leads: "Étiqueter des fiches",
  untag_leads: "Retirer une étiquette",
  create_lead: "Créer une fiche",
  update_lead: "Modifier une fiche",
  set_lead_status: "Changer le statut",
  assign_leads: "Attribuer des fiches",
  file_in_campaign: "Ranger dans une campagne",
  qualify_lead: "Qualifier une fiche",
  move_deal: "Faire avancer une opportunité",
  create_campaign: "Créer une campagne",
  update_campaign: "Modifier une campagne",
  start_search: "Lancer une recherche",
  cancel_search: "Arrêter une recherche",
  import_search: "Importer des résultats",
  sort_campaign: "Trier une campagne",
  start_audit: "Lancer un audit IA",
  start_research: "Confier une recherche à l’Enquêteur",
  suggest_offers: "Demander les offres",
  decide_offer: "Décider d’une offre",
  draft_email: "Écrire un brouillon",
  draft_reply: "Préparer une réponse",
  start_studio: "Ouvrir une maquette",
  studio_build: "Générer une maquette",
  studio_revise: "Retoucher une maquette",
  share_studio_link: "Partager une maquette",
  propose_targets: "Demander des cibles",
  act_on_target: "Donner suite à une cible",
  enroll_in_sequence: "Inscrire en séquence",
  stop_enrollment: "Arrêter une séquence",
  pause_sequence: "Mettre une séquence en pause",
  resume_sequence: "Reprendre une séquence",
  book_meeting: "Planifier un rendez-vous",
  change_meeting: "Modifier un rendez-vous",
  record_meeting_outcome: "Clôturer un rendez-vous",
  propose_mission: "Mission proposée",
  manage_mission: "Gérer une mission",
}

/** Actions done without a click that their card can put back (features/copilot/undo.ts). */
export const UNDOABLE_TOOLS: ReadonlySet<string> = new Set(["create_task", "complete_task", "reschedule_task", "tag_leads", "untag_leads"])

/** Actions that contact a prospect: their card says so, and they never ride on another approval (D28). */
export const CONTACT_TOOLS: ReadonlySet<string> = new Set(["enroll_in_sequence", "resume_sequence", "book_meeting", "change_meeting", "share_studio_link"])

/** The actions the last answers used: loaded with the core at the next turn, so the model can carry on with them. */
export function recentTools(history: readonly { role: string; parts: readonly unknown[] }[], answers = 2): Set<string> {
  const out = new Set<string>()
  for (const m of history.filter((x) => x.role === "assistant").slice(-answers)) {
    for (const raw of m.parts) {
      const type = (raw as { type?: unknown }).type
      if (typeof type === "string" && type.startsWith("tool-")) out.add(type.slice(5))
    }
  }
  return out
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
