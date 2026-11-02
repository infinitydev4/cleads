import type { OfferBilling, OfferCategory, OfferStatus } from "@prisma/client"

/** Words shown for offers; safe to import from the browser. */
export const OFFER_CATEGORIES = ["WEBSITE", "SEO", "GEO", "SOCIAL", "ADS", "PACK", "RETAINER"] as const satisfies readonly OfferCategory[]
export const OFFER_BILLINGS = ["ONE_OFF", "MONTHLY", "QUOTE"] as const satisfies readonly OfferBilling[]
export const OFFER_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const satisfies readonly OfferStatus[]

export const CATEGORY_LABELS: Record<OfferCategory, string> = {
  WEBSITE: "Site et landing",
  SEO: "SEO",
  GEO: "GEO",
  SOCIAL: "Réseaux sociaux",
  ADS: "Publicité",
  PACK: "Packs",
  RETAINER: "Accompagnement Cleads",
}

export const BILLING_LABELS: Record<OfferBilling, string> = {
  ONE_OFF: "Forfait",
  MONTHLY: "Par mois",
  QUOTE: "Sur devis",
}

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  DRAFT: "À valider",
  ACTIVE: "Active",
  ARCHIVED: "Archivée",
}

export const OFFER_STATUS_TONE: Record<OfferStatus, "warning" | "success" | "neutral"> = {
  DRAFT: "warning",
  ACTIVE: "success",
  ARCHIVED: "neutral",
}

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })

/** "1 500 à 4 000 € HT", "300 à 800 € HT par mois", "Sur devis". */
export function formatOfferPrice(o: { priceMinEur: number | null; priceMaxEur: number | null; billing: OfferBilling }): string {
  const { priceMinEur: min, priceMaxEur: max } = o
  if (o.billing === "QUOTE" || (min == null && max == null)) return "Sur devis"
  const range =
    min != null && max != null ? (max === min ? eur.format(min) : `${eur.format(min)} à ${eur.format(max)}`) : min != null ? `À partir de ${eur.format(min)}` : `Jusqu’à ${eur.format(max!)}`
  return `${range} HT${o.billing === "MONTHLY" ? " par mois" : ""}`
}

/** "300 à 900 € HT par mois (Hors budget publicitaire)"; a note that already starts with the price replaces it ("Sur devis, engagement initial de 3 mois"). */
export function withPriceNote(price: string, note: string | null | undefined): string {
  if (!note) return price
  return note.toLowerCase().startsWith(price.toLowerCase()) ? note : `${price} (${note})`
}
