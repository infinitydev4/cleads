import type { OfferBilling, OfferCategory } from "@prisma/client"
import { CATEGORY_LABELS, OFFER_CATEGORIES, formatOfferPrice } from "./labels"
import { signalLabel } from "./signals"

/**
 * The skill "offres-cleads" (docs/crm-v1/AGENTS-IA.md §8) is written from the catalogue each time it is used, so agents
 * always see the active offers with their current prices, and never a draft or an archived one.
 */
export const OFFERS_SKILL = {
  name: "offres-cleads",
  generator: "offers",
  description: "À utiliser pour choisir, argumenter ou citer une offre de Cleads : catalogue actif, signaux qui la justifient, livrables, prix, angle et objections.",
} as const

export interface SkillOffer {
  slug: string
  name: string
  category: OfferCategory
  summary: string
  deliverables: string[]
  signals: string[]
  priceMinEur: number | null
  priceMaxEur: number | null
  billing: OfferBilling
  priceNote: string | null
  angle: string | null
  objections: { objection: string; answer: string }[]
}

export function renderOffersSkill(offers: readonly SkillOffer[]): string {
  const lines = [
    "# Offres Cleads",
    "",
    "Le catalogue des offres actives. Tu ne proposes que ces offres, sous leur nom et leur identifiant exacts, chacune justifiée par au moins une preuve de l'audit. Les prix sont des fourchettes hors taxes : le devis final revient au closer.",
  ]
  if (!offers.length) return [...lines, "", "Aucune offre n'est active pour le moment : ne recommande rien et signale-le."].join("\n")
  for (const category of OFFER_CATEGORIES) {
    const inCategory = offers.filter((o) => o.category === category)
    if (!inCategory.length) continue
    lines.push("", `## ${CATEGORY_LABELS[category]}`)
    for (const o of inCategory) {
      lines.push("", `### ${o.name} (\`${o.slug}\`)`, o.summary, `- Prix : ${formatOfferPrice(o)}${o.priceNote ? ` (${o.priceNote})` : ""}`)
      if (o.signals.length) lines.push(`- Quand la proposer : ${o.signals.map(signalLabel).join(" ; ")}`)
      if (o.deliverables.length) lines.push(`- Livrables : ${o.deliverables.join(" ; ")}`)
      if (o.angle) lines.push(`- Angle : ${o.angle}`)
      for (const x of o.objections) lines.push(`- Objection « ${x.objection} » → ${x.answer}`)
    }
  }
  return lines.join("\n")
}
