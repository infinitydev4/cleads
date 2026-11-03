import { ROLES, type AiRole } from "@/lib/ai/models"
import { allowedModes, isFamily, type ActionFamily, type FamilyMode } from "./actions/families"

/**
 * The agents of the AI agency (docs/crm-v1/AGENTS-IA.md §7). The code fixes who they are: their expert role (persona),
 * model role, tools, V1 skills and limits, versioned and tested with the code. A workspace adds to them without
 * replacing anything (features/ai/definitions.ts): team instructions, skills, a cheaper role, lower limits.
 */
export const AGENT_IDS = ["auditor", "offers", "writer", "replies", "designer", "copilot", "strategist", "qualifier"] as const
export type AgentId = (typeof AGENT_IDS)[number]

export type SkillModeKey = "always" | "on_demand"

export interface AgentDef {
  id: AgentId
  label: string
  mission: string
  /** The expert role: how the agent thinks and writes. The base of its instructions, never replaced. */
  persona: string
  modelRole: AiRole
  /** Roles the owner may switch it to, its own first. */
  modelRoles: readonly AiRole[]
  /** Epic that gives the agent its behaviour. */
  epic: string
  /** Its behaviour is in this version of the worker. */
  available: boolean
  /** Tools it works with (features/ai/tools.ts), registered by its epic. */
  tools: readonly string[]
  /**
   * E28: the families of actions it works with and their level in the code (features/ai/actions/families.ts). The
   * owner can cut one or make it wait for a click (Agents IA › Droits); a family it does not declare is never open.
   */
  families: Readonly<Partial<Record<ActionFamily, FamilyMode>>>
  /** It picks its own tools in a loop (copilot, Stratège): a family can be made to wait for a click, not only cut. */
  picksTools?: boolean
  /** Skills given to it when the V1 catalogue is installed (features/ai/catalog.ts). */
  skills: readonly { name: string; mode: SkillModeKey }[]
  /** What it produces. */
  output: string
  /** What a person validates. */
  approval: string
  limits: {
    /** Model calls and tool calls in one run. */
    maxSteps: number
    /** Budget reserved for one run (D22). */
    maxCostEur: number
  }
}

const TOOL_NAME = /^[a-z][a-z0-9_]{1,47}$/
export const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Decision agents answer typed questions (Jev): they take no written instructions, so no skills either. */
export const usesSkills = (def: Pick<AgentDef, "modelRole">) => ROLES[def.modelRole].kind === "language"

/** Checks an agent's settings once, at load. */
export function defineAgent(def: AgentDef): Readonly<AgentDef> {
  const fail = (why: string) => {
    throw new Error(`Agent ${def.id} : ${why}`)
  }
  if (!def.label.trim() || !def.mission.trim()) fail("nom et mission obligatoires")
  if (def.persona.trim().length < 40) fail("rôle d'expert (persona) trop court")
  if (!Number.isInteger(def.limits.maxSteps) || def.limits.maxSteps < 1 || def.limits.maxSteps > 50) fail("1 à 50 étapes")
  if (!(def.limits.maxCostEur > 0 && def.limits.maxCostEur <= 5)) fail("plafond par exécution entre 0 et 5 €")
  if (def.modelRoles[0] !== def.modelRole || new Set(def.modelRoles).size !== def.modelRoles.length) fail("les rôles permis commencent par le sien, sans doublon")
  if (def.modelRoles.some((r) => ROLES[r].kind !== ROLES[def.modelRole].kind)) fail("un agent de décision ne devient pas rédacteur, et inversement")
  for (const t of def.tools) if (!TOOL_NAME.test(t)) fail(`outil « ${t} » : nom en snake_case`)
  for (const s of def.skills) if (!SKILL_NAME.test(s.name)) fail(`skill « ${s.name} » : nom en kebab-case`)
  if (new Set(def.skills.map((s) => s.name)).size !== def.skills.length) fail("skill en double")
  if (def.skills.length && !usesSkills(def)) fail("un agent de décision n'a pas de skills")
  for (const [family, mode] of Object.entries(def.families)) {
    if (!isFamily(family)) fail(`famille d'actions « ${family} » inconnue`)
    else if (!allowedModes(family, !!def.picksTools).includes(mode as FamilyMode) || mode === "off") fail(`famille « ${family} » : niveau « ${mode} » impossible`)
  }
  return Object.freeze({ ...def, modelRoles: Object.freeze([...def.modelRoles]), tools: Object.freeze([...def.tools]), families: Object.freeze({ ...def.families }), skills: Object.freeze(def.skills.map((s) => Object.freeze({ ...s }))), limits: Object.freeze({ ...def.limits }) })
}

const PLAYBOOKS = ["playbook-artisans-batiment", "playbook-restaurants", "playbook-sante", "playbook-architectes"] as const
const onDemand = (...names: string[]) => names.map((name) => ({ name, mode: "on_demand" as const }))

export const AGENTS: Record<AgentId, Readonly<AgentDef>> = {
  auditor: defineAgent({
    id: "auditor",
    label: "Auditeur digital",
    mission: "Audite le site et la présence en ligne d'un prospect, chaque constat avec sa preuve.",
    persona: `Tu es consultant senior en acquisition locale et en performance web dans une agence française. Tu audites la présence en ligne d'une entreprise (site, vitesse, mobile, SEO local, GEO, réseaux sociaux, publicité) pour qu'un commercial puisse lui proposer des améliorations utiles.
- Tu es factuel : chaque constat cite sa preuve (URL, mesure, capture). Sans preuve, tu ne conclus pas : tu écris ce qu'il faudrait vérifier.
- Tu classes les constats par impact sur l'activité du prospect (demandes, appels, rendez-vous), pas par difficulté technique.
- Tu écris pour un commercial qui n'est pas technicien : phrases courtes, sans jargon, l'enjeu dit clairement.
- Tu respectes l'entreprise auditée : un constat est une occasion de l'aider, jamais une moquerie.`,
    modelRole: "writer",
    modelRoles: ["writer", "fast", "designer"],
    epic: "E20",
    available: true,
    tools: ["fetch_page", "pagespeed", "screenshot", "detect_stack", "find_socials", "dirigeants", "get_business", "save_audit", "read_skill"],
    families: { read_crm: "auto", read_web: "auto", ai_work: "confirm" },
    skills: onDemand("audit-seo-local", "audit-geo-site", "audit-ux-conversion", "presence-sociale", "preparation-ads", ...PLAYBOOKS),
    output: "Audit sourcé : sous-scores, forces, faiblesses, opportunités, résumé en trois points",
    approval: "Aucune : l'audit reste dans le CRM",
    limits: { maxSteps: 12, maxCostEur: 0.3 },
  }),
  offers: defineAgent({
    id: "offers",
    label: "Conseiller offres",
    mission: "Relie les faiblesses de l'audit aux offres du catalogue et prépare le pitch du closer.",
    persona: `Tu es directeur conseil d'une agence d'acquisition. À partir de l'audit d'un prospect, tu choisis dans le catalogue les offres qui répondent à ses vraies faiblesses, et tu prépares le closer.
- Tu ne proposes que des offres actives du catalogue, chacune reliée à au moins une preuve de l'audit.
- Tu composes un pack réaliste pour la taille et le budget probable de l'entreprise : mieux vaut une première offre acceptée qu'un pack complet refusé.
- Pour chaque offre : pourquoi elle, ce que le prospect y gagne, l'objection probable et sa réponse.
- Tu n'inventes ni chiffre, ni résultat garanti, ni référence client.`,
    modelRole: "writer",
    modelRoles: ["writer", "fast", "designer"],
    epic: "E21",
    available: true,
    tools: ["get_audit", "list_offers", "save_recommendations", "read_skill"],
    families: { read_crm: "auto", ai_work: "confirm" },
    skills: [{ name: "offres-cleads", mode: "always" }, ...onDemand("script-appel-15min", "preparation-ads", ...PLAYBOOKS)],
    output: "Offres recommandées avec leurs preuves, script d'appel de 15 minutes, objections, angle d'email",
    approval: "Aucune : la personne accepte ou refuse chaque offre",
    limits: { maxSteps: 4, maxCostEur: 0.1 },
  }),
  writer: defineAgent({
    id: "writer",
    label: "Rédacteur outreach",
    mission: "Rédige des emails courts et sourcés, toujours relus avant envoi.",
    persona: `Tu es copywriter B2B français, spécialiste du premier email de prospection envoyé à des TPE et des PME.
- Court : 60 à 120 mots, un objet de moins de 50 caractères, sans majuscules abusives ni point d'exclamation.
- Personnel : une observation précise et vérifiée sur l'entreprise, tirée de l'audit ; jamais une flatterie générique.
- Une seule demande, simple : un échange de 15 minutes.
- Vouvoiement, ton direct et respectueux, aucune promesse chiffrée ni fausse urgence.
- Tu n'écris ni le pied de page légal ni le lien de désinscription : le CRM les ajoute.`,
    modelRole: "writer",
    modelRoles: ["writer", "fast", "designer"],
    epic: "E22",
    available: true,
    tools: ["get_lead", "get_audit", "get_recommendations", "draft_email", "read_skill"],
    families: { read_crm: "auto", ai_work: "confirm" },
    skills: [{ name: "cold-email-fr", mode: "always" }, ...onDemand("offres-cleads", ...PLAYBOOKS)],
    output: "Brouillon d'email à relire",
    approval: "L'envoi, toujours relu par une personne",
    limits: { maxSteps: 3, maxCostEur: 0.05 },
  }),
  replies: defineAgent({
    id: "replies",
    label: "Analyste réponses",
    mission: "Classe les réponses reçues et leur urgence, avec une probabilité.",
    persona:
      "Tu classes les réponses reçues après une prospection : intéressé, pas maintenant, désinscription, absent, mauvaise personne, transfert ou hors sujet, avec leur urgence. Une demande de désinscription l'emporte toujours sur le reste.",
    modelRole: "decision",
    modelRoles: ["decision"],
    epic: "E22",
    available: true,
    tools: ["classify_reply"],
    families: { read_crm: "auto", ai_work: "confirm" },
    skills: [],
    output: "Classe de la réponse, urgence et probabilité",
    approval: "Sous le seuil de confiance, une personne tranche",
    limits: { maxSteps: 1, maxCostEur: 0.01 },
  }),
  designer: defineAgent({
    id: "designer",
    label: "Designer web",
    mission: "Génère une landing de démonstration à partir du site, de l'audit et de la charte du prospect.",
    persona: `Tu es directeur artistique et intégrateur web. Tu crées une page d'accueil de démonstration moderne pour une entreprise, à partir de son site actuel, de son audit et de son identité.
- Fidèle à l'entreprise : ses textes, ses services, son logo, ses couleurs ; rien d'inventé (ni avis, ni chiffre, ni label).
- Moderne et sobre : hiérarchie claire, typographie lisible, de l'air, une promesse forte dès le premier écran.
- Rapide et accessible : HTML et CSS seulement, aucun script, contrastes suffisants, textes alternatifs.
- Pensée pour convertir : appels à l'action visibles (téléphone, email, rendez-vous), preuves réelles, parcours mobile d'abord.`,
    modelRole: "designer",
    modelRoles: ["designer", "writer"],
    epic: "E23",
    available: true,
    tools: ["collect_site", "build_page", "render_preview", "critique_page", "publish_preview", "read_skill"],
    families: { read_crm: "auto", read_web: "auto", ai_work: "confirm" },
    skills: [{ name: "charte-studio", mode: "always" }, ...onDemand("audit-ux-conversion", ...PLAYBOOKS)],
    output: "Landing de démonstration, avec captures et scores avant / après",
    approval: "Le partage du lien avec le prospect",
    limits: { maxSteps: 16, maxCostEur: 2 },
  }),
  copilot: defineAgent({
    id: "copilot",
    label: "Copilote",
    mission: "Répond sur les données du CRM que la personne voit et agit pour elle : fiches, campagnes, recherches, séquences, rendez-vous, en déléguant aux agents spécialisés.",
    persona: `Tu es le chef d'agence : tu aides la personne connectée à travailler dans le CRM (fiches, campagnes, recherches de prospects, séquences, rendez-vous, emails) et tu agis pour elle quand elle le demande, en confiant les tâches longues aux agents spécialisés.
- Tu ne réponds et n'agis qu'avec ce que la personne a le droit de voir et de faire, et tu cites les fiches concernées.
- Tu agis par tes outils et tu dis ce qui va se passer ; ce qui change le CRM attend son clic, et ce qui contacte un prospect attend toujours le sien.
- Tu réponds en français, brièvement, et tu dis quand tu ne sais pas.`,
    modelRole: "writer",
    modelRoles: ["writer", "fast", "designer"],
    epic: "E28",
    available: true,
    tools: [
      "search_leads",
      "get_lead",
      "get_timeline",
      "get_lead_audit",
      "get_lead_offers",
      "get_today",
      "list_meetings",
      "list_slots",
      "get_pipeline",
      "list_campaigns",
      "get_campaign",
      "get_campaign_sorting",
      "get_strategy",
      "list_searches",
      "get_search",
      "preview_import",
      "list_sequences",
      "list_replies",
      "get_metrics",
      "list_team",
      "list_sectors",
      "search_prospect_base",
      "extractor_health",
      "list_offers",
      "read_skill",
      "open_page",
      "add_note",
      "log_call",
      "create_task",
      "complete_task",
      "reschedule_task",
      "tag_leads",
      "untag_leads",
      "create_lead",
      "update_lead",
      "set_lead_status",
      "assign_leads",
      "file_in_campaign",
      "qualify_lead",
      "move_deal",
      "create_campaign",
      "update_campaign",
      "start_search",
      "cancel_search",
      "import_search",
      "sort_campaign",
      "start_audit",
      "suggest_offers",
      "decide_offer",
      "draft_email",
      "draft_reply",
      "start_studio",
      "studio_build",
      "studio_revise",
      "share_studio_link",
      "propose_targets",
      "act_on_target",
      "enroll_in_sequence",
      "stop_enrollment",
      "pause_sequence",
      "resume_sequence",
      "book_meeting",
      "change_meeting",
      "record_meeting_outcome",
    ],
    families: { read_crm: "auto", read_web: "auto", notes: "auto", records: "confirm", campaigns: "confirm", prospecting: "confirm", ai_work: "confirm", outreach: "confirm", navigation: "auto" },
    picksTools: true,
    skills: onDemand("offres-cleads", ...PLAYBOOKS),
    output: "Réponses, actions et travaux confiés aux agents",
    approval: "Les changements d'un clic dans la conversation ; ce qui contacte un prospect, toujours de son propre clic",
    limits: { maxSteps: 10, maxCostEur: 0.2 },
  }),
  strategist: defineAgent({
    id: "strategist",
    label: "Stratège marché",
    mission: "Propose les secteurs à cibler selon les offres et prépare campagnes et recherches.",
    persona: `Tu es stratège growth pour une agence d'acquisition B2B. Tu recommandes les secteurs et les zones à prospecter, l'offre phare et l'angle, à partir du catalogue d'offres, des résultats des campagnes et des secteurs disponibles dans l'Extractor.
- Chaque recommandation s'appuie sur des chiffres du CRM ou des faits sur le secteur ; tu signales ce qui reste une hypothèse.
- Tu proposes campagnes et recherches en brouillon : leur lancement est validé par une personne.
- Tu préfères peu de cibles bien travaillées à beaucoup de cibles survolées.`,
    modelRole: "writer",
    modelRoles: ["writer", "designer"],
    epic: "E25",
    available: true,
    tools: ["list_offers", "campaign_metrics", "list_sectors", "search_prospect_base", "read_skill"],
    families: { read_crm: "auto", read_web: "auto" },
    picksTools: true,
    skills: [{ name: "offres-cleads", mode: "always" }, ...onDemand(...PLAYBOOKS)],
    output: "Cibles argumentées : secteur, zones, douleurs, offre phare, angle, campagne et recherche proposées",
    approval: "Chaque campagne et chaque recherche, d'un clic : il ne lance rien lui-même",
    limits: { maxSteps: 10, maxCostEur: 0.3 },
  }),
  qualifier: defineAgent({
    id: "qualifier",
    label: "Analyste qualification",
    mission: "Trie les fiches importées selon leur pertinence pour une campagne ou une offre.",
    persona:
      "Tu évalues la pertinence d'une fiche importée pour une campagne ou une offre : oui, peut-être ou non, avec une probabilité. Dans le doute, tu laisses la décision à une personne.",
    modelRole: "decision",
    modelRoles: ["decision"],
    epic: "E25",
    available: true,
    tools: [],
    families: { read_crm: "auto", ai_work: "confirm" },
    skills: [],
    output: "Pertinence de chaque fiche importée pour sa campagne, avec sa probabilité",
    approval: "Sous le seuil de confiance, une personne tranche",
    // One decision per fiche, a batch of 40 per run: a few hundredths of a cent each.
    limits: { maxSteps: 40, maxCostEur: 0.05 },
  }),
}

export const isAgentId = (value: unknown): value is AgentId => typeof value === "string" && (AGENT_IDS as readonly string[]).includes(value)
/** Usage key of evaluation spend (E27): Consommation shows it apart from the agents' work. */
export const EVALUATIONS_USAGE = "evaluations"

export const agentLabel = (id: string) => (isAgentId(id) ? AGENTS[id].label : id === EVALUATIONS_USAGE ? "Évaluations" : id)

/** E28: "via le Copilote", "via l’Auditeur digital": what an action done by an agent for a person says. */
export function viaAgent(id: string): string {
  const label = agentLabel(id)
  return `via ${/^[aeiouyéèêh]/i.test(label) ? "l’" : "le "}${label}`
}
export const agentCapMicros = (id: AgentId) => Math.round(AGENTS[id].limits.maxCostEur * 1_000_000)
