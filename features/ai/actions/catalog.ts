import { readSkillTool } from "@/features/ai/runtime"
import { listOffersTool } from "@/features/offers/tools"
import type { AnyToolDef } from "@/features/ai/tools"
import { FAMILY_INFO } from "./families"
import { READ_ACTIONS } from "./read"
import { NOTE_ACTIONS } from "./notes"
import { RECORD_ACTIONS } from "./records"
import { PROSPECTING_ACTIONS } from "./prospecting"
import { AI_ACTIONS } from "./ai-work"
import { OUTREACH_ACTIONS } from "./outreach"
import { openPageTool } from "./navigation"
import { MISSION_TOOLS } from "@/features/missions/tools"

/**
 * The catalogue of actions (E28, docs/crm-v1/AGENTS-IA.md §9): every operation of the CRM an agent may run for a
 * person, declared once. The copilot calls it in-process (no network hop); the CRM's MCP server will publish the same
 * catalogue to outside clients (D30).
 *
 * A turn starts with the core only; the rest is found on demand (AI SDK `toolSearch`), so sixty definitions are not paid
 * for at every step.
 */
export const ACTIONS: readonly AnyToolDef[] = [
  ...READ_ACTIONS,
  listOffersTool,
  readSkillTool,
  openPageTool,
  ...NOTE_ACTIONS,
  ...RECORD_ACTIONS,
  ...PROSPECTING_ACTIONS,
  ...AI_ACTIONS,
  ...OUTREACH_ACTIONS,
  ...MISSION_TOOLS,
]

/** Loaded at every turn: what most questions need first. */
export const CORE_ACTIONS: ReadonlySet<string> = new Set(["search_leads", "get_lead", "get_today", "list_campaigns", "open_page", "propose_mission", "read_skill"])

/** Words people use for an action, beyond its name and description (French, without accents). */
const KEYWORDS: Record<string, string> = {
  search_leads: "fiches prospects liste trouver chercher qui lesquelles",
  get_lead: "fiche prospect detail entreprise contact",
  get_timeline: "historique echanges notes appels emails passe",
  get_lead_audit: "audit site seo vitesse mobile constats",
  get_lead_registry: "registre siren naf creation effectif dirigeants gerant procedure redressement liquidation bodacc",
  list_signals: "signaux bodacc creations reprises cessions nouveau dirigeant demenagement procedure appeler maintenant",
  get_lead_offers: "offres suggerees conseiller pitch prix",
  get_today: "journee aujourdhui taches retard rendez-vous agenda planning",
  list_meetings: "agenda rendez-vous semaine calendrier rdv",
  list_slots: "creneaux disponibilites libre hote rdv",
  get_pipeline: "pipeline opportunites deals affaires ventes montant",
  list_campaigns: "campagnes resultats",
  get_campaign: "campagne detail objectifs",
  get_campaign_sorting: "tri pertinence jev bonnes cibles campagne",
  get_strategy: "stratege cibles secteurs proposition",
  list_searches: "recherches extractor scraping",
  get_search: "recherche avancement resultats extractor",
  preview_import: "apercu import doublons",
  list_sequences: "sequences emails automatiques relances",
  list_replies: "reponses boite reception emails recus",
  get_metrics: "chiffres statistiques rapport taux conversion tendance secteurs",
  list_team: "equipe membres commerciaux sdr closer attribuer",
  list_sectors: "secteurs metiers activites taxonomie",
  search_prospect_base: "base extractor entreprises connues existe deja",
  extractor_health: "extractor sante google bloque",
  list_offers: "offres catalogue prix services agence",
  open_page: "ouvrir afficher montrer voir page aller",
  add_note: "note noter retenir compte rendu",
  log_call: "appel telephone appele joint repondeur",
  create_task: "tache rappeler relancer rappel todo",
  complete_task: "tache faite terminee finie cocher",
  reschedule_task: "tache replanifier decaler reporter echeance",
  tag_leads: "etiquette tag marquer selection",
  untag_leads: "etiquette retirer enlever tag",
  create_lead: "creer fiche nouveau prospect ajouter entreprise",
  update_lead: "modifier fiche corriger site telephone adresse contact",
  set_lead_status: "statut qualifie contacte ne pas contacter disqualifie",
  assign_leads: "attribuer assigner donner commercial pool",
  file_in_campaign: "ranger campagne ajouter a la campagne",
  qualify_lead: "qualifier disqualifier qualification opportunite closer",
  move_deal: "opportunite etape gagne perdu montant signature proposition negociation",
  create_campaign: "creer campagne nouvelle",
  update_campaign: "modifier campagne activer pause terminer objectif",
  start_search: "rechercher scraper extraire trouver entreprises prospects google maps lancer recherche extractor",
  cancel_search: "arreter annuler recherche",
  import_search: "importer resultats recherche ajouter fiches",
  sort_campaign: "trier jev pertinence classer fiches campagne",
  start_audit: "auditer audit site analyser",
  suggest_offers: "offres conseiller proposer quoi vendre",
  decide_offer: "retenir ecarter offre",
  draft_email: "email brouillon ecrire premier mail prospection",
  draft_reply: "repondre reponse brouillon email",
  start_studio: "maquette landing site demonstration studio",
  studio_build: "generer maquette page",
  studio_revise: "retoucher modifier maquette",
  share_studio_link: "lien partager maquette envoyer",
  propose_targets: "stratege cibles secteurs identifier quels secteurs prospecter",
  act_on_target: "cible campagne recherche stratege lancer ecarter",
  enroll_in_sequence: "inscrire sequence emails automatiques campagne emailing",
  stop_enrollment: "arreter sequence desinscrire",
  pause_sequence: "pause suspendre arreter sequence envois",
  resume_sequence: "reprendre relancer redemarrer sequence envois",
  book_meeting: "rendez-vous planifier rdv reserver invitation",
  change_meeting: "rendez-vous reporter annuler confirmer",
  record_meeting_outcome: "rendez-vous resultat cloturer compte rendu absent",
  propose_mission: "mission plan plusieurs etapes enchainer automatiser recurrente chaque semaine lancer",
  list_missions: "missions suivi avancement bilan ou en est",
  manage_mission: "mission pause reprendre annuler arreter recurrence",
}

const STOP = new Set(["les", "des", "une", "pour", "avec", "dans", "sur", "aux", "que", "qui", "est", "son", "ses", "leur", "mes", "nos", "vos", "the", "and"])
const words = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w))

const familyWords = new Map(ACTIONS.map((a) => [a.name, a.family ? words(FAMILY_INFO[a.family].label) : []]))

/** Two words match when equal, or when they share a stem: « fiches » finds « fiche », « étiqueter » finds « étiquette ». */
function same(a: string, b: string): boolean {
  if (a === b) return true
  const short = Math.min(a.length, b.length)
  if (short < 5) return false
  let n = 0
  while (n < short && a[n] === b[n]) n++
  return n >= Math.min(6, short - 1)
}

/**
 * Ranks the deferred actions for a search of the model: a word of the query in the name counts most, then in the
 * action's own keywords, its family and its description. A word most actions share (« fiches ») counts less than a rare
 * one (« étiqueter »).
 */
export function rankActions(query: string, candidates: readonly { name: string; description?: string }[]): string[] {
  const q = [...new Set(words(query))]
  if (!q.length) return []
  const pools = candidates.map((c) => ({
    name: words(c.name.replace(/_/g, " ")),
    keys: words(KEYWORDS[c.name] ?? ""),
    family: familyWords.get(c.name) ?? [],
    desc: words(c.description ?? ""),
  }))
  const hit = (pool: string[], w: string) => pool.some((p) => same(p, w))
  const weight = new Map(
    q.map((w) => {
      const df = pools.filter((p) => hit(p.name, w) || hit(p.keys, w) || hit(p.family, w) || hit(p.desc, w)).length
      return [w, Math.log((pools.length + 1) / (df + 1)) + 0.1]
    })
  )
  return candidates
    .map((c, i) => {
      const p = pools[i]
      const score = q.reduce((s, w) => s + weight.get(w)! * ((hit(p.name, w) ? 6 : 0) + (hit(p.keys, w) ? 4 : 0) + (hit(p.family, w) ? 2 : 0) + (hit(p.desc, w) ? 1 : 0)), 0)
      return { name: c.name, score, i }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((r) => r.name)
}
