/**
 * The families of actions (E28, docs/crm-v1/AGENTS-IA.md §9): what the agents' rights matrix allows, cuts or makes
 * wait for a click. Shared by the server and Agents IA › Droits.
 *
 * A family's floor is the lowest level it can run at: reading and small notes may go without a click, every other
 * internal change waits for one (the action's own card, or the plan that contains it). What contacts a prospect always
 * waits for its own click, whatever the family says (an action's `costClass: "external"`).
 */
export const ACTION_FAMILIES = ["read_crm", "read_web", "notes", "records", "campaigns", "prospecting", "ai_work", "outreach", "missions", "navigation"] as const
export type ActionFamily = (typeof ACTION_FAMILIES)[number]

/** off: never; confirm: after a click; auto: without a click (families whose floor allows it). */
export const FAMILY_MODES = ["off", "confirm", "auto"] as const
export type FamilyMode = (typeof FAMILY_MODES)[number]

export interface FamilyInfo {
  label: string
  /** For a column header. */
  short: string
  hint: string
  floor: "auto" | "confirm"
  /** On or off only: its actions are proposals the person launches themselves (a mission's plan). */
  binary?: true
}

export const FAMILY_INFO: Record<ActionFamily, FamilyInfo> = {
  read_crm: { label: "Lire le CRM", short: "Lire le CRM", hint: "Fiches, historique, journée, pipeline, agenda, campagnes, recherches, séquences, réponses, offres", floor: "auto" },
  read_web: { label: "Lire le web et l'Extractor", short: "Web, Extractor", hint: "Pages publiques, PageSpeed, annuaire des entreprises, base et secteurs de l'Extractor", floor: "auto" },
  notes: { label: "Notes, tâches, étiquettes", short: "Notes, tâches", hint: "Ajouter une note ou un appel, créer, terminer ou replanifier une tâche, étiqueter des fiches", floor: "auto" },
  records: { label: "Fiches et pipeline", short: "Fiches, pipeline", hint: "Créer ou modifier une fiche, statut, attribution, rangement en campagne, qualification, opportunités", floor: "confirm" },
  campaigns: { label: "Campagnes", short: "Campagnes", hint: "Créer et modifier les campagnes", floor: "confirm" },
  prospecting: { label: "Prospection", short: "Prospection", hint: "Recherches de l'Extractor, imports, tri des fiches par Jev", floor: "confirm" },
  ai_work: { label: "Travaux d'IA", short: "Travaux d’IA", hint: "Audits, offres, brouillons, maquettes, cibles du Stratège : le travail des agents spécialisés", floor: "confirm" },
  outreach: { label: "Séquences et rendez-vous", short: "Séquences, RDV", hint: "Inscriptions en séquence et rendez-vous ; ce qui contacte un prospect demande toujours son propre clic", floor: "confirm" },
  missions: { label: "Missions", short: "Missions", hint: "Proposer un plan de plusieurs actions, lancé d'un clic et mené par le worker ; le suspendre, le reprendre, l'annuler. Chaque étape garde les droits de sa propre famille", floor: "auto", binary: true },
  navigation: { label: "Navigation", short: "Navigation", hint: "Ouvrir une page du CRM ou un espace du QG 3D", floor: "auto" },
}

export const MODE_LABELS: Record<FamilyMode, string> = { off: "Coupé", confirm: "Avec un clic", auto: "Sans clic" }

export type ActionPolicy = Record<ActionFamily, FamilyMode>

export const isFamily = (v: unknown): v is ActionFamily => typeof v === "string" && (ACTION_FAMILIES as readonly string[]).includes(v)

/**
 * The modes the owner may choose for a family. An agent that picks its own tools (the copilot, the Stratège) can make a
 * family wait for a click; a specialist's workflow only has it on or off.
 */
export function allowedModes(family: ActionFamily, picksTools: boolean): FamilyMode[] {
  if (!picksTools || FAMILY_INFO[family].binary) return ["off", FAMILY_INFO[family].floor]
  return FAMILY_INFO[family].floor === "auto" ? ["off", "confirm", "auto"] : ["off", "confirm"]
}
