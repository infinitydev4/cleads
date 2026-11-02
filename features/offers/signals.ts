/**
 * Audit signals that call for an offer (docs/crm-v1/AGENTS-IA.md §14). The audit (E20) raises them with their proof,
 * the offers catalogue lists which ones each offer answers, and the rules of E21 match the two. Safe in the browser.
 */
export const SIGNAL_GROUPS = {
  site: "Site",
  local: "SEO local",
  content: "Contenus",
  geo: "GEO",
  social: "Réseaux sociaux",
  ads: "Publicité",
  global: "Vue d'ensemble",
} as const
export type SignalGroup = keyof typeof SIGNAL_GROUPS

export const OFFER_SIGNALS = {
  no_website: { group: "site", label: "Pas de site" },
  site_unreachable: { group: "site", label: "Site injoignable" },
  social_only: { group: "site", label: "Seulement une page de réseau social" },
  site_outdated: { group: "site", label: "Site daté" },
  mobile_score_low: { group: "site", label: "Score mobile sous 50" },
  no_https: { group: "site", label: "Pas de HTTPS" },
  cms_outdated: { group: "site", label: "CMS obsolète" },
  weak_cta: { group: "site", label: "Appel à l'action faible" },
  no_booking: { group: "site", label: "Pas de prise de rendez-vous en ligne" },
  ads_without_landing: { group: "site", label: "Publicité sans page dédiée" },
  gbp_incomplete: { group: "local", label: "Fiche Google incomplète" },
  few_reviews: { group: "local", label: "Moins de 20 avis Google" },
  low_rating: { group: "local", label: "Note Google sous 4" },
  nap_inconsistent: { group: "local", label: "Nom, adresse ou téléphone incohérents" },
  no_localbusiness_schema: { group: "local", label: "Pas de données structurées LocalBusiness" },
  few_pages: { group: "content", label: "Peu de pages" },
  no_service_pages: { group: "content", label: "Pas de page par service ou par ville" },
  no_structured_data: { group: "geo", label: "Pas de données structurées" },
  no_faq: { group: "geo", label: "Pas de FAQ" },
  unclear_entity: { group: "geo", label: "Entité floue : qui, quoi, où" },
  no_social: { group: "social", label: "Aucun réseau social" },
  inactive_social: { group: "social", label: "Réseaux inactifs" },
  visual_sector: { group: "social", label: "Secteur visuel" },
  no_google_ads_high_intent: { group: "ads", label: "Pas de balise Google Ads dans un secteur à forte intention" },
  no_meta_pixel_visual: { group: "ads", label: "Pas de pixel Meta dans un secteur visuel" },
  three_low_scores: { group: "global", label: "Au moins trois volets de l'audit sous 50" },
  long_term_fit: { group: "global", label: "Prospect à accompagner dans la durée" },
} as const satisfies Record<string, { group: SignalGroup; label: string }>

export type OfferSignal = keyof typeof OFFER_SIGNALS
export const SIGNAL_KEYS = Object.keys(OFFER_SIGNALS) as OfferSignal[]
export const isOfferSignal = (value: unknown): value is OfferSignal => typeof value === "string" && value in OFFER_SIGNALS
export const signalLabel = (key: string) => (isOfferSignal(key) ? OFFER_SIGNALS[key].label : key)
