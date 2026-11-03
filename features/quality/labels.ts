import type { AgentId } from "@/features/ai/agents"

/**
 * AI quality (E27, docs/crm-v1/AGENTS-IA.md §20): what each evaluation suite measures, in words for people. Safe to
 * import from the browser; the sets themselves stay on the server (features/quality/suites.ts).
 */
export const SUITE_IDS = ["auditor", "offers", "writer", "replies", "qualifier", "designer"] as const satisfies readonly AgentId[]
export type SuiteId = (typeof SUITE_IDS)[number]
export const isSuiteId = (v: unknown): v is SuiteId => typeof v === "string" && (SUITE_IDS as readonly string[]).includes(v)

/** The contender that uses no model: the coded rules a decision is compared with. */
export const RULES = "rules"

/** The model that grades free answers (emails, pages), whatever is compared: grades stay comparable over time. */
export const JUDGE_MODEL = "anthropic/claude-sonnet-5.5"

/** Below this gap with the model in service, two scores are equivalent; beyond, better or a regression. */
export const SCORE_TOLERANCE = 3

/** How long an evaluation stands as the proof a model may replace another (features/quality/gate.ts). */
export const EVIDENCE_DAYS = 30

/** The team's labels start counting from this many cases; the spec aims at 200 to 500 replies. */
export const TEAM_MIN_CASES = 10
export const TEAM_TARGET = 200

export type EvaluationSource = "reference" | "team"
export type Sample = "quick" | "full"

export interface SuiteInfo {
  id: SuiteId
  label: string
  /** The reference set, in a few words. */
  set: string
  /** What its main score means. */
  score: string
  /** Every measure the results show, in order. */
  measures: readonly MeasureKey[]
  /** It compares decision models, the coded rules and a language model reading the same question. */
  decision: boolean
  /** It can run on the cases the team labelled in the CRM. */
  team: boolean
}

export const SUITES_INFO: Record<SuiteId, SuiteInfo> = {
  auditor: {
    id: "auditor",
    label: "Auditeur digital",
    set: "30 sites figés, lus sans réseau",
    score: "Signaux justes, sans faux constat ni preuve inventée",
    measures: ["recall", "specificity", "evidence", "reading", "cost", "duration"],
    decision: false,
    team: false,
  },
  offers: {
    id: "offers",
    label: "Conseiller offres",
    set: "10 audits de référence et le catalogue V1",
    score: "Offre principale adaptée au prospect",
    measures: ["mainHit", "forbidden", "evidence", "cost", "duration"],
    decision: false,
    team: false,
  },
  writer: {
    id: "writer",
    label: "Rédacteur outreach",
    set: "10 fiches auditées",
    score: "Grille du juge et règles d'écriture",
    measures: ["rubric", "checks", "sourced", "cost", "duration"],
    decision: false,
    team: false,
  },
  replies: {
    id: "replies",
    label: "Analyste réponses",
    set: "80 réponses étiquetées",
    score: "Réponses bien classées",
    measures: ["accuracy", "stopRecall", "autoShare", "autoAccuracy", "calibration", "urgency", "action", "cost", "duration"],
    decision: true,
    team: true,
  },
  qualifier: {
    id: "qualifier",
    label: "Analyste qualification",
    set: "45 fiches jugées pour trois campagnes",
    score: "Fiches bien jugées",
    measures: ["accuracy", "autoShare", "autoAccuracy", "calibration", "cost", "duration"],
    decision: true,
    team: true,
  },
  designer: {
    id: "designer",
    label: "Designer web",
    set: "3 briefs de référence",
    score: "Critique visuelle et contrôles de la page",
    measures: ["critique", "checks", "axe", "scripts", "cost", "duration"],
    decision: false,
    team: false,
  },
}

export type MeasureKey =
  | "recall"
  | "specificity"
  | "evidence"
  | "reading"
  | "mainHit"
  | "forbidden"
  | "rubric"
  | "checks"
  | "sourced"
  | "accuracy"
  | "stopRecall"
  | "autoShare"
  | "autoAccuracy"
  | "calibration"
  | "urgency"
  | "action"
  | "critique"
  | "axe"
  | "scripts"
  | "cost"
  | "duration"

/** How a measure reads: a share (0-1 shown in %), a grade out of 5, a count, euros or seconds; and whether more is better. */
export const MEASURES: Record<MeasureKey, { label: string; hint: string; unit: "share" | "grade" | "count" | "eur" | "ms"; higherIsBetter: boolean }> = {
  recall: { label: "Constats attendus trouvés", hint: "Part des signaux attendus que l'audit lève", unit: "share", higherIsBetter: true },
  specificity: { label: "Sans faux constat", hint: "Part des signaux interdits que l'audit évite", unit: "share", higherIsBetter: true },
  evidence: { label: "Preuves valides", hint: "Éléments de l'analyse qui citent une preuve existante (objectif : 100 %)", unit: "share", higherIsBetter: true },
  reading: { label: "Lecture du site", hint: "FAQ et clarté de l'entreprise bien lues par le modèle rapide", unit: "share", higherIsBetter: true },
  mainHit: { label: "Offre principale juste", hint: "L'offre principale fait partie des bonnes réponses", unit: "share", higherIsBetter: true },
  forbidden: { label: "Offres hors sujet", hint: "Recommandations d'une offre exclue pour ce prospect", unit: "count", higherIsBetter: false },
  rubric: { label: "Grille du juge", hint: "Personnalisation, demande unique, faits exacts, ton, orthographe (sur 5)", unit: "grade", higherIsBetter: true },
  checks: { label: "Règles respectées", hint: "Contrôles faits par le code", unit: "share", higherIsBetter: true },
  sourced: { label: "Faits sourcés", hint: "Faits cités qui renvoient à une preuve de l'audit", unit: "share", higherIsBetter: true },
  accuracy: { label: "Bien classées", hint: "Part des cas où la réponse est celle attendue", unit: "share", higherIsBetter: true },
  stopRecall: { label: "« Ne plus écrire » repérés", hint: "Aucune demande d'arrêt ne doit être manquée (objectif : 100 %)", unit: "share", higherIsBetter: true },
  autoShare: { label: "Traitées au-dessus du seuil", hint: "Part des cas assez sûrs pour être proposés d'un clic", unit: "share", higherIsBetter: true },
  autoAccuracy: { label: "Justes au-dessus du seuil", hint: "Exactitude des cas proposés d'un clic", unit: "share", higherIsBetter: true },
  calibration: { label: "Écart de calibration", hint: "Écart moyen entre la confiance annoncée et l'exactitude réelle", unit: "share", higherIsBetter: false },
  urgency: { label: "Urgence juste", hint: "Urgence attendue retrouvée", unit: "share", higherIsBetter: true },
  action: { label: "Action juste", hint: "Besoin d'agir bien détecté", unit: "share", higherIsBetter: true },
  critique: { label: "Critique visuelle", hint: "Hiérarchie, lisibilité, contraste, mobile, marque, conversion (sur 5)", unit: "grade", higherIsBetter: true },
  axe: { label: "Défauts d'accessibilité", hint: "Violations graves ou critiques relevées par axe-core, par page", unit: "count", higherIsBetter: false },
  scripts: { label: "Scripts retirés", hint: "Pages où le modèle a écrit un script que le nettoyage a retiré : la page publiée n'en a jamais", unit: "share", higherIsBetter: false },
  cost: { label: "Coût par cas", hint: "Ce que le modèle comparé a coûté, juge à part", unit: "eur", higherIsBetter: false },
  duration: { label: "Durée médiane", hint: "Temps médian d'un cas", unit: "ms", higherIsBetter: false },
}

export const ROLE_OF_RULES = "Règles codées (sans modèle)"
export const contenderLabel = (id: string, modelLabel: (id: string) => string) => (id === RULES ? ROLE_OF_RULES : modelLabel(id))

/** One contender's results in an evaluation (stored in AiEvaluation.results, computed by features/quality/metrics.ts). */
export interface ContenderResult {
  contender: string
  /** 0-100, the suite's main score. */
  score: number | null
  cases: number
  ok: number
  failed: number
  /** Cases left out after repeated access errors on this model. */
  skipped: number
  measures: Partial<Record<MeasureKey, number | null>>
  /** Rules a contender must never break, broken here (« Une demande d'arrêt manquée »). */
  hard: string[]
  costMicros: number
  judgeMicros: number
  /** Calibration of decisions: [confidence bucket, cases, share right]. */
  calibration?: { from: number; to: number; cases: number; accuracy: number | null }[]
}

export type Verdict = "better" | "equivalent" | "regression"

export const VERDICT_LABELS: Record<Verdict, string> = { better: "Meilleur", equivalent: "Équivalent", regression: "Régression" }

const pct = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 })
const one = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 })
const cents = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 4 })

/** A measure as people read it: « 92 % », « 4,6/5 », « 0,0123 € », « 1,4 s ». */
export function formatMeasure(key: MeasureKey, value: number | null | undefined): string {
  if (value == null) return "—"
  switch (MEASURES[key].unit) {
    case "share":
      return pct.format(value)
    case "grade":
      return `${one.format(value)}/5`
    case "count":
      return one.format(value)
    case "eur":
      // A decision costs a few millionths of a euro: two significant digits keep it from reading « 0,00 € ».
      return value > 0 && value < 0.001 ? `${value.toLocaleString("fr-FR", { maximumSignificantDigits: 2 })} €` : cents.format(value)
    case "ms":
      return value < 1_000 ? `${Math.round(value)} ms` : `${one.format(value / 1_000)} s`
  }
}

export const formatScore = (score: number | null | undefined) => (score == null ? "—" : one.format(score))

/** « ×0,3 » for a cost or a time relative to the model in service. */
export const formatRatio = (ratio: number | null | undefined) => (ratio == null ? "—" : `×${one.format(ratio)}`)
