import { z } from "zod"
import { BODY_MAX, SUBJECT_MAX } from "@/features/outreach/footer"

/**
 * What the Rédacteur outreach answers (E22, docs/crm-v1/AGENTS-IA.md §15). Facts about a prospect cite audit evidence
 * by its identifier; a fact without existing evidence is dropped before the person sees the draft.
 */
const ids = z.array(z.string().max(8)).max(6)

export const firstEmailSchema = z.object({
  subject: z.string().max(120).describe("Objet de moins de 50 caractères, concret, sans « Re: »"),
  body: z.string().max(2_000).describe("Le message, de 60 à 120 mots, sans signature ni pied de page"),
  facts: z
    .array(z.object({ text: z.string().max(240), evidence: ids.min(1) }))
    .max(3)
    .describe("Les faits de l'audit cités dans le message, chacun avec ses preuves"),
})
export type FirstEmailOutput = z.infer<typeof firstEmailSchema>

export const replyDraftSchema = z.object({ body: z.string().max(2_000).describe("La réponse, de 40 à 100 mots, sans signature, sans lien ni pied de page") })
export type ReplyDraftOutput = z.infer<typeof replyDraftSchema>

export const stepDraftSchema = z.object({
  subject: z.string().max(120).describe("Objet ; vide pour une relance qui continue le fil du premier message"),
  body: z.string().max(2_000).describe("Le message, avec seulement les variables permises"),
})
export type StepDraftOutput = z.infer<typeof stepDraftSchema>

/** A step of a sequence being written, and what the team wants from it. */
export const stepDraftRequestSchema = z
  .object({
    position: z.number().int().min(1).max(10),
    delayDays: z.number().int().min(0).max(60),
    brief: z.string().trim().max(500, "Consigne : 500 caractères au plus").optional(),
    previous: z.array(z.object({ subject: z.string().max(SUBJECT_MAX), body: z.string().max(BODY_MAX) })).max(9),
  })
  .strict()
export type StepDraftRequest = z.infer<typeof stepDraftRequestSchema>
