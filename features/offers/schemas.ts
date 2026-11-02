import { z } from "zod"
import { OFFER_BILLINGS, OFFER_CATEGORIES, OFFER_STATUSES } from "./labels"
import { SIGNAL_KEYS, type OfferSignal } from "./signals"

const optionalText = (max: number) => z.string().trim().max(max, `${max} caractères au plus`).nullish().transform((v) => v || null)
const price = z.number({ message: "Un prix en euros" }).int("Un prix en euros entiers").min(0, "Pas de prix négatif").max(1_000_000, "1 000 000 € au plus").nullable()

export const objectionSchema = z.object({
  objection: z.string().trim().min(3, "Objection trop courte").max(300, "Objection : 300 caractères au plus"),
  answer: z.string().trim().min(3, "Réponse trop courte").max(600, "Réponse : 600 caractères au plus"),
})

const fields = {
  name: z.string().trim().min(2, "Donnez un nom à l’offre (2 caractères au moins)").max(80, "Nom : 80 caractères au plus"),
  category: z.enum(OFFER_CATEGORIES, { message: "Catégorie inconnue" }),
  summary: z.string().trim().min(10, "Décrivez l’offre en une ou deux phrases").max(500, "Description : 500 caractères au plus"),
  deliverables: z.array(z.string().trim().min(2, "Livrable trop court").max(200, "Livrable : 200 caractères au plus")).max(12, "12 livrables au plus"),
  signals: z.array(z.enum(SIGNAL_KEYS as [OfferSignal, ...OfferSignal[]], { message: "Signal inconnu" })).max(12, "12 signaux au plus"),
  priceMinEur: price,
  priceMaxEur: price,
  billing: z.enum(OFFER_BILLINGS, { message: "Facturation inconnue" }),
  priceNote: optionalText(120),
  angle: optionalText(600),
  objections: z.array(objectionSchema).max(8, "8 objections au plus"),
  status: z.enum(OFFER_STATUSES).optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
}

interface Prices {
  priceMinEur?: number | null
  priceMaxEur?: number | null
  billing?: string
}
/** Both prices given: the range goes up. Not on quote: at least one price. */
export const pricesInOrder = (v: Prices) => v.priceMinEur == null || v.priceMaxEur == null || v.priceMaxEur >= v.priceMinEur
export const pricedUnlessQuote = (v: Prices) => v.billing === "QUOTE" || v.priceMinEur != null || v.priceMaxEur != null
const orderMessage = { message: "Le prix maximum doit dépasser le minimum", path: ["priceMaxEur"] }
const pricedMessage = { message: "Indiquez un prix, ou choisissez « Sur devis »", path: ["priceMinEur"] }

export const createOfferSchema = z
  .object({ ...fields, deliverables: fields.deliverables.default([]), signals: fields.signals.default([]), objections: fields.objections.default([]) })
  .strict()
  .refine(pricesInOrder, orderMessage)
  .refine(pricedUnlessQuote, pricedMessage)
export type CreateOfferInput = z.infer<typeof createOfferSchema>

/** Every field optional; the identifier (slug) never changes. Prices are checked again once merged with the offer. */
export const updateOfferSchema = z
  .object({
    name: fields.name.optional(),
    category: fields.category.optional(),
    summary: fields.summary.optional(),
    deliverables: fields.deliverables.optional(),
    signals: fields.signals.optional(),
    priceMinEur: fields.priceMinEur.optional(),
    priceMaxEur: fields.priceMaxEur.optional(),
    billing: fields.billing.optional(),
    priceNote: fields.priceNote.optional(),
    angle: fields.angle.optional(),
    objections: fields.objections.optional(),
    status: fields.status,
    sortOrder: fields.sortOrder,
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Aucun changement demandé" })
export type UpdateOfferInput = z.infer<typeof updateOfferSchema>
