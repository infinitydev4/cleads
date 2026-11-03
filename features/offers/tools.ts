import { z } from "zod"
import { defineTool } from "@/features/ai/tools"
import { OFFER_CATEGORIES, formatOfferPrice, withPriceNote } from "./labels"
import { activeOffers } from "./service"
import { signalLabel } from "./signals"

/** list_offers (docs/crm-v1/AGENTS-IA.md §9): the active catalogue as agents see it; drafts and archives never show. */
export const listOffersTool = defineTool({
  name: "list_offers",
  description: "Liste les offres actives du catalogue Cleads : identifiant, nom, catégorie, signaux qui la justifient, livrables et prix. Seules ces offres peuvent être recommandées.",
  permission: null,
  approval: "auto",
  costClass: "free",
  family: "read_crm",
  input: z.object({ category: z.enum(OFFER_CATEGORIES).optional() }),
  execute: async (ctx, input) =>
    (await activeOffers(ctx.run.workspaceId))
      .filter((o) => !input.category || o.category === input.category)
      .map((o) => ({
        slug: o.slug,
        name: o.name,
        category: o.category,
        summary: o.summary,
        signals: o.signals.map((s) => ({ key: s, label: signalLabel(s) })),
        deliverables: o.deliverables,
        price: withPriceNote(formatOfferPrice(o), o.priceNote),
        angle: o.angle,
      })),
})
