/**
 * Every figure the CRM shows, with the sentence that defines it (E10 rule: no indicator without a definition, all of
 * them recalculable from the data). Shared by the 3D view, the campaigns and, later, the reports. No open or click
 * rate: prospecting emails carry no tracking pixel (E9a), so those numbers do not exist.
 */
export const INDICATORS = {
  leads: { label: "Prospects", definition: "Fiches créées pendant la période, toutes sources (Extractor, CSV, formulaire, saisie)." },
  contacted: { label: "Contactés", definition: "Fiches qui ont reçu au moins un email de prospection (hors test) ou un appel enregistré pendant la période." },
  replied: { label: "Réponses", definition: "Fiches dont une personne a répondu par email pendant la période ; les absences automatiques ne comptent pas." },
  replyRate: { label: "Taux de réponse", definition: "Réponses ÷ contactés, sur la même période." },
  qualified: { label: "Qualifiés", definition: "Opportunités créées pendant la période : qualifier une fiche crée son opportunité." },
  meetings: { label: "RDV pris", definition: "Rendez-vous réservés pendant la période, hors annulés ; un rendez-vous reporté compte une fois." },
  won: { label: "Gagnés", definition: "Opportunités passées à « Gagné » pendant la période." },
  conversion: { label: "Taux de conversion", definition: "RDV pris ÷ prospects créés, sur la même période (un ratio d’activité, pas le suivi d’un lot de fiches)." },
  activeCampaigns: { label: "Campagnes actives", definition: "Campagnes au statut « Active », hors archivées." },
} as const

export type IndicatorKey = keyof typeof INDICATORS

/**
 * Campaign figures follow the fiches of the campaign over its whole life (a cohort), not a period: how many of its
 * fiches reached each step.
 */
export const CAMPAIGN_INDICATORS = {
  leads: { label: "Prospects", definition: "Fiches rangées dans la campagne." },
  contacted: { label: "Contactés", definition: "Fiches de la campagne qui ont reçu au moins un email (hors test) ou un appel." },
  replied: { label: "Réponses", definition: "Fiches de la campagne dont une personne a répondu par email (absences exclues)." },
  qualified: { label: "Qualifiés", definition: "Fiches de la campagne qui ont une opportunité." },
  meetings: { label: "RDV", definition: "Fiches de la campagne qui ont obtenu au moins un rendez-vous, hors annulés." },
  won: { label: "Gagnés", definition: "Fiches de la campagne dont une opportunité est gagnée." },
  replyRate: { label: "Taux de réponse", definition: "Réponses ÷ contactés." },
  conversion: { label: "Taux de conversion", definition: "Fiches avec rendez-vous ÷ fiches de la campagne." },
} as const

export type CampaignIndicatorKey = keyof typeof CAMPAIGN_INDICATORS

export const PERIODS = [7, 30, 90] as const
export type PeriodDays = (typeof PERIODS)[number]
export const parsePeriod = (v: unknown): PeriodDays => (PERIODS.find((p) => p === Number(v)) ?? 30)

/** Share of `part` in `whole`, or null when there is nothing to divide (never a fake 0 %). */
export const rate = (part: number, whole: number): number | null => (whole > 0 ? part / whole : null)

/** Relative change in %, or null when the previous value is 0 (a "+∞ %" says nothing). */
export const deltaPct = (current: number, previous: number): number | null => (previous > 0 ? ((current - previous) / previous) * 100 : null)

/** Change of a rate, in percentage points, or null when either side is unknown. */
export const deltaPts = (current: number | null, previous: number | null): number | null => (current == null || previous == null ? null : (current - previous) * 100)

const pctFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })
const intFormat = new Intl.NumberFormat("fr-FR")

export const formatCount = (n: number) => intFormat.format(n)
/** 0.0836 → "8,4 %"; null → "—". */
export const formatRate = (r: number | null) => (r == null ? "—" : `${pctFormat.format(r * 100)} %`)
/** +12.3 → "+12 %"; null → null so the caller shows nothing rather than an invented trend. */
export const formatDeltaPct = (d: number | null) => (d == null ? null : `${d >= 0 ? "+" : "−"}${intFormat.format(Math.round(Math.abs(d)))} %`)
export const formatDeltaPts = (d: number | null) => (d == null ? null : `${d >= 0 ? "+" : "−"}${pctFormat.format(Math.abs(d))} pt`)
