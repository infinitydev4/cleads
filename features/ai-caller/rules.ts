import type { AiCallOutcome } from "@prisma/client"
import { isHoliday } from "@/lib/holidays"
import { zonedParts } from "@/features/meetings/slots"
import type { SiteState } from "@/features/leads/types"

/**
 * E33, the AI caller: everything that decides without a database. The agent calls professionals only (CNIL: B2B
 * prospecting on legitimate interest, about their trade), says it is an AI in its first sentence (AI Act art. 50), and
 * only quotes what the fiche's audit says. It calls from one of the workspace's Zadarma numbers, imported in ElevenLabs as a
 * SIP trunk; which number is the owner's choice and responsibility (ARCEP reserves 09 48, 01 62… to automated calls).
 */

export const TZ = "Europe/Paris"

// ── Hooks ──────────────────────────────────────────────────────────────────────────────────────────────────────

export const HOOK_KEYS = ["mobile", "competition", "nosite", "mockup"] as const
export type HookKey = (typeof HOOK_KEYS)[number]
export type HookMode = "auto" | HookKey

export const HOOK_LABELS: Record<HookKey, string> = {
  mobile: "Site mal affiché sur mobile",
  competition: "Concurrents devant sur Google",
  nosite: "Pas de site",
  mockup: "Maquette offerte",
}

export const HOOK_WHEN: Record<HookKey, string> = {
  mobile: "l’audit trouve un problème de téléphone ou de vitesse",
  competition: "l’audit trouve un problème de visibilité sur Google",
  nosite: "la fiche n’a pas de site, ou seulement une page Facebook",
  mockup: "une maquette est déjà prête dans le Studio",
}

/** Placeholders a hook may use, filled from the fiche. A placeholder with no value makes the hook unusable for it. */
export const HOOK_VARIABLES = ["{entreprise}", "{metier}", "{ville}", "{probleme}"] as const

export const DEFAULT_HOOKS: Record<HookKey, string> = {
  mobile: "Sur téléphone, votre site a un souci : {probleme}. Et c’est sur téléphone que la plupart de vos clients vous cherchent.",
  competition: "Quand on cherche « {metier} {ville} » sur Google, votre site ressort mal : {probleme}. Les clients appellent alors ceux qui sortent avant vous.",
  nosite: "Quand quelqu’un cherche un {metier} à {ville} sur Google, il ne trouve pas de site à votre nom, et il appelle le suivant.",
  mockup: "On a préparé une maquette de votre futur site, au nom de {entreprise}. Un chef de projet peut vous la montrer en quinze minutes.",
}

export const HOOK_MAX_LENGTH = 400

export function hooksOf(saved: unknown): Record<HookKey, string> {
  const s = (saved && typeof saved === "object" ? saved : {}) as Record<string, unknown>
  return Object.fromEntries(HOOK_KEYS.map((k) => [k, typeof s[k] === "string" && (s[k] as string).trim() ? (s[k] as string).trim() : DEFAULT_HOOKS[k]])) as Record<HookKey, string>
}

/** What the agent may say about a fiche. Nothing else reaches it. */
export interface CallFacts {
  company: string
  trade: string | null
  city: string | null
  contactName: string | null
  site: SiteState
  /** The audit's first finding on the phone or speed, and on Google visibility, as written in the audit. */
  mobileProblem: string | null
  searchProblem: string | null
  /** The audit's three points for the closer. */
  auditPoints: string[]
  hasMockup: boolean
}

function vars(f: CallFacts, hook: HookKey): Record<string, string | null> {
  return {
    "{entreprise}": f.company,
    "{metier}": f.trade?.toLowerCase() ?? null,
    "{ville}": f.city,
    "{probleme}": hook === "mobile" ? f.mobileProblem : hook === "competition" ? f.searchProblem : null,
  }
}

/** The hook's text for this fiche, or null when one of its placeholders has nothing true to put in. */
export function fillHook(text: string, f: CallFacts, hook: HookKey): string | null {
  const values = vars(f, hook)
  let missing = false
  const out = text.replace(/\{(entreprise|metier|ville|probleme)\}/g, (m) => {
    const v = values[m]
    if (!v) missing = true
    return v ?? ""
  })
  return missing ? null : out.replace(/\s+/g, " ").trim()
}

/** Can this hook honestly be said to this fiche? */
export function hookFits(hook: HookKey, f: CallFacts): boolean {
  switch (hook) {
    case "mockup":
      return f.hasMockup
    case "nosite":
      return f.site === "none" || f.site === "social"
    case "mobile":
      return !!f.mobileProblem
    case "competition":
      return !!f.searchProblem
  }
}

/** Auto: the strongest true thing (a ready mockup, no site, the phone problem, Google). A forced hook that does not fit falls back to auto. */
export function pickHook(mode: HookMode, f: CallFacts, texts: Record<HookKey, string>): { hook: HookKey; text: string } | null {
  const order: HookKey[] = mode === "auto" ? ["mockup", "nosite", "mobile", "competition"] : [mode, ...(["mockup", "nosite", "mobile", "competition"] as HookKey[]).filter((k) => k !== mode)]
  for (const hook of order) {
    if (!hookFits(hook, f)) continue
    const text = fillHook(texts[hook], f, hook)
    if (text) return { hook, text }
  }
  return null
}

// ── Who may be called, and when ────────────────────────────────────────────────────────────────────────────────

/** V1 calls France only: the number, the hours and the law are French. */
export const callableNumber = (canonical: string | null | undefined): canonical is string => !!canonical && /^\+33[1-9]\d{8}$/.test(canonical)

/** Monday to Friday, 10:00–13:00 and 14:00–19:00 in Paris, never on a public holiday (the consumer rules, kept as good practice). */
export const CALL_WINDOWS: [number, number][] = [
  [10 * 60, 13 * 60],
  [14 * 60, 19 * 60],
]
export const CALL_HOURS_LABEL = "Lun.–ven. · 10:00–13:00, 14:00–19:00"

export function inCallingHours(now: Date): boolean {
  const p = zonedParts(now, TZ)
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()
  if (weekday === 0 || weekday === 6) return false
  if (isHoliday(new Date(Date.UTC(p.year, p.month - 1, p.day, 12))).isHoliday) return false
  const minute = p.hour * 60 + p.minute
  // A call started at 18:58 still ends after 19:00: the last one leaves five minutes before the end.
  return CALL_WINDOWS.some(([a, b]) => minute >= a && minute < b - 5)
}

/** Lines the agent may hold at once. */
export const MAX_CONCURRENT = 2
/** A call ElevenLabs never reported on is closed after this. */
export const STALE_AFTER_MIN = 20
/** No answer or a voicemail: one more try the next day, then the fiche stays with the team. */
export const MAX_ATTEMPTS = 2
export const RETRY_AFTER_HOURS = 24
export const WAVE_SIZES = [20, 50, 100, 150] as const

// ── Cost ───────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Estimated euros per minute on the line: ElevenLabs 0.08 $ (≈ 0.074 €) + the model (≈ 0.005 €) + Zadarma to a French
 * mobile 0.033 €. Rings without an answer cost nothing. Rounded up so the cap stops early rather than late.
 */
export const EUR_PER_MINUTE = 0.115
export const costMicrosOf = (durationSec: number) => Math.ceil((Math.max(0, durationSec) / 60) * EUR_PER_MINUTE * 1_000_000)
export const euros = (micros: number) => `${(micros / 1_000_000).toFixed(2).replace(".", ",")} €`

// ── What the agent is told ─────────────────────────────────────────────────────────────────────────────────────

export interface CallBrief {
  facts: CallFacts
  hookText: string
  hostName: string
  format: "meet" | "phone"
  /** "mardi 10 novembre 2026 (2026-11-10)": the agent has no clock of its own. */
  today: string
}

export function firstMessage(b: CallBrief): string {
  return `Bonjour, ici l’assistante IA de Cleads. Je suis bien chez ${b.facts.company} ?`
}

/** The whole instruction for one call. The facts are the only ones the agent may use. */
export function buildPrompt(b: CallBrief): string {
  const f = b.facts
  const where = b.format === "meet" ? "en visio Google Meet" : "au téléphone"
  const points = f.auditPoints.length ? f.auditPoints.map((p) => `- ${p}`).join("\n") : "- (pas d’audit détaillé : ne cite aucun chiffre)"
  return `Tu es l’assistante vocale IA de Cleads, une agence qui crée et améliore les sites internet des artisans et des petites entreprises. Tu appelles un professionnel pour son activité.

# Ton but, en moins de 90 secondes
Obtenir un rendez-vous de 15 minutes ${where} avec ${b.hostName}, chef de projet, qui présentera gratuitement l’audit complet du site et une maquette.

# Aujourd’hui
${b.today}

# La fiche
- Entreprise : ${f.company}
- Métier : ${f.trade ?? "inconnu"}
- Ville : ${f.city ?? "inconnue"}
- Interlocuteur : ${f.contactName ?? "inconnu, demande le gérant"}
- Ce que l’audit a trouvé :
${points}

# Le déroulé
1. Tu t’es déjà présentée comme une IA. Si on te demande si tu es un robot, dis-le simplement : oui, une assistante IA de Cleads.
2. Demande si la personne a trente secondes. Si ce n’est pas le gérant ou le décideur, demande quand le joindre, puis utilise l’outil callback.
3. Dis l’accroche, avec tes mots mais sans rien ajouter : « ${b.hookText} »
4. Explique que ça fait perdre des demandes de devis, sans donner de chiffre précis.
5. Pose deux questions courtes : c’est bien la personne qui décide pour le site ? Avoir plus de demandes, c’est une priorité en ce moment ?
6. Propose le rendez-vous. Appelle l’outil get_slots et propose deux créneaux, pas plus. Quand la personne en choisit un, appelle book_meeting avec l’heure exacte donnée par get_slots.
7. Confirme le jour, l’heure et le format, remercie, puis raccroche avec end_call.

# Règles
- Vouvoie toujours. Phrases courtes. Si on te coupe, tais-toi et écoute.
- Ne cite que ce qui est écrit dans la fiche ci-dessus. N’invente jamais un chiffre, un nom de concurrent, un prix ou une promesse de résultat.
- Ne donne pas de prix : c’est le chef de projet qui en parle.
- « Rappelez-moi plus tard » : demande quand, puis utilise l’outil callback.
- « Pas intéressé » : remercie poliment et raccroche. N’insiste qu’une seule fois, avec une phrase.
- « Ne m’appelez plus », « retirez mon numéro » : excuse-toi, utilise l’outil do_not_call, confirme que le numéro ne sera plus appelé, et raccroche.
- Si une messagerie répond, raccroche sans laisser de message.
- Si la personne veut parler à un humain, propose le rendez-vous avec ${b.hostName} ou un rappel.
- Si on te demande d’où vient le numéro : de la fiche publique de l’entreprise (Google). Cleads est joignable sur cleads.fr.`
}

/** The dynamic variables sent with the call; `call_token` lets the tools know which call they serve. */
export function dynamicVariables(token: string, b: CallBrief): Record<string, string> {
  return { call_token: token, company: b.facts.company, host_name: b.hostName, meeting_format: b.format === "meet" ? "visio" : "téléphone" }
}

// ── What comes back ────────────────────────────────────────────────────────────────────────────────────────────

export interface TranscriptLine {
  role: "agent" | "user"
  text: string
  at: number
}

export function parseTranscript(raw: unknown): TranscriptLine[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((t) => {
      const r = t as { role?: unknown; message?: unknown; time_in_call_secs?: unknown }
      const text = typeof r.message === "string" ? r.message.trim() : ""
      return { role: r.role === "agent" ? ("agent" as const) : ("user" as const), text, at: typeof r.time_in_call_secs === "number" ? r.time_in_call_secs : 0 }
    })
    .filter((t) => t.text)
    .slice(0, 400)
}

export const FACT_FIELDS = {
  decision_maker: { type: "string", description: "La personne est-elle le décideur pour le site ? Réponse courte en français (ex. « Oui, c’est le gérant »). Vide si on ne le sait pas." },
  priority: { type: "string", description: "Avoir plus de demandes est-il une priorité pour elle ? Réponse courte en français. Vide si non abordé." },
  objection: { type: "string", description: "La principale objection exprimée, en quelques mots, et si elle a été levée. Vide s’il n’y en a pas." },
  preference: { type: "string", description: "Préférence exprimée pour le rendez-vous (visio, téléphone, moment). Vide sinon." },
  voicemail: { type: "boolean", description: "Vrai si c’est une messagerie ou un répondeur qui a répondu, et non une personne." },
} as const satisfies Record<string, { type: "string" | "boolean"; description: string }>

export const FACT_LABELS: Record<Exclude<keyof typeof FACT_FIELDS, "voicemail">, string> = { decision_maker: "Décideur", priority: "Priorité", objection: "Objection", preference: "Préférence" }

/** analysis.data_collection_results: { id: { value, … } }. */
export function parseFacts(raw: unknown): { facts: Record<string, string>; voicemail: boolean } {
  const results = (raw && typeof raw === "object" ? raw : {}) as Record<string, { value?: unknown } | undefined>
  const facts: Record<string, string> = {}
  for (const key of Object.keys(FACT_LABELS)) {
    const v = results[key]?.value
    if (typeof v === "string" && v.trim() && !/^(null|none|n\/a|inconnu)$/i.test(v.trim())) facts[key] = v.trim().slice(0, 200)
  }
  const vm = results.voicemail?.value
  return { facts, voicemail: vm === true || vm === "true" }
}

/**
 * The call's result. A tool the agent used during the call (meeting, callback, do-not-call) wins; otherwise the
 * transcript tells a voicemail, someone who said no, or nobody at all.
 */
export function finalOutcome(i: { fromTool: AiCallOutcome | null; voicemail: boolean; userSpoke: boolean; durationSec: number }): AiCallOutcome {
  if (i.fromTool) return i.fromTool
  if (i.voicemail) return "VOICEMAIL"
  if (!i.userSpoke || i.durationSec < 3) return "NO_ANSWER"
  return "NOT_INTERESTED"
}

/** Worth a second try the next day. */
export const retryable = (o: AiCallOutcome) => o === "NO_ANSWER" || o === "VOICEMAIL"

export const OUTCOME_LABELS: Record<AiCallOutcome, string> = {
  MEETING: "Rendez-vous pris",
  CALLBACK: "À rappeler",
  NOT_INTERESTED: "Pas intéressé",
  VOICEMAIL: "Messagerie",
  NO_ANSWER: "Pas de réponse",
  DO_NOT_CALL: "Liste rouge",
  FAILED: "Échec",
}

/** call_initiation_failure: busy and no-answer are a missed call, anything else a failure. */
export const failureOutcome = (reason: unknown): AiCallOutcome => (reason === "busy" || reason === "no-answer" ? "NO_ANSWER" : "FAILED")

/**
 * What a wave of `calls` may give, shown before launching: about a third of the numbers answer, 5 to 10 % of those
 * take a meeting, a conversation lasts about 1 min 30 and a voicemail 15 s. Hypotheses until the pilot measures them.
 */
export function estimateWave(calls: number) {
  const reached = Math.round(calls * 0.35)
  const voicemails = Math.round(calls * 0.2)
  const minutes = reached * 1.5 + voicemails * 0.25
  return { reached, meetingsLow: Math.floor(reached * 0.05), meetingsHigh: Math.ceil(reached * 0.1), costMicros: Math.ceil(minutes * EUR_PER_MINUTE * 1_000_000) }
}
