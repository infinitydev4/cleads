import { z } from "zod"
import { REJECTION_REASONS } from "./labels"

/**
 * What the Conseiller offres answers (E21, docs/crm-v1/AGENTS-IA.md §14) and what is kept of it. Offers are named by
 * their identifier, among the candidates the rules found; every argument cites audit evidence by its identifier (P page,
 * M measure, C screenshot, S source). Items whose evidence does not exist are dropped before saving.
 */
export const PITCH_ROLES = ["main", "complement", "entry", "later"] as const
export type PitchRole = (typeof PITCH_ROLES)[number]

const text = (max: number) => z.string().max(max)
const ids = z.array(z.string().max(8)).max(6)
const cited = ids.min(1)

export const objectionSchema = z.object({ objection: text(240), answer: text(500) })
export type Objection = z.infer<typeof objectionSchema>

/** The call script as it is kept; the hook may have lost its evidence only through a fallback, never silently. */
export const scriptSchema = z.object({
  opening: text(400),
  hook: z.object({ text: text(500), evidence: ids }),
  questions: z.array(text(240)).max(3),
  proposal: text(700),
  close: text(400),
})
export type CallScript = z.infer<typeof scriptSchema>

export const emailAngleSchema = z.object({ subject: text(90), angle: text(500), evidence: ids })
export type EmailAngle = z.infer<typeof emailAngleSchema>

/** The model's answer. `slugs` are the candidate offers: the only ones it can name. */
export function pitchOutputSchema(slugs: readonly [string, ...string[]]) {
  return z.object({
    headline: text(260).describe("Une phrase pour le closer : pourquoi ce prospect a besoin de nous, avec le fait le plus fort de l'audit"),
    recommendations: z
      .array(
        z.object({
          offer: z.enum(slugs).describe("Identifiant exact d'une offre candidate"),
          role: z.enum(PITCH_ROLES).describe("main : l'offre principale (une seule) ; complement : dans le pack avec elle ; entry : une première étape moins chère ; later : pour plus tard"),
          fit: z.number().int().min(0).max(100).describe("Adéquation au prospect, de 0 à 100"),
          why: text(500).describe("Pourquoi cette offre, avec les faits de l'audit, en deux phrases au plus"),
          gain: text(400).describe("Ce que le prospect y gagne concrètement, sans chiffre inventé"),
          evidence: cited.describe("Identifiants des preuves de l'audit sur lesquelles l'argument s'appuie"),
          objection: objectionSchema.nullable().describe("L'objection la plus probable à cette offre et la réponse à donner"),
        })
      )
      .min(1)
      .max(4),
    script: z.object({
      opening: text(400).describe("Ouverture : se présenter, rappeler le contexte, demander si c'est un bon moment"),
      hook: z.object({ text: text(500).describe("Un constat précis de l'audit, posé comme une question"), evidence: cited }),
      questions: z.array(text(240)).min(1).max(3).describe("Trois questions de découverte au plus, adaptées au métier"),
      proposal: text(700).describe("L'offre principale reliée au besoin, et l'offre d'entrée s'il y en a une"),
      close: text(400).describe("La prochaine étape proposée : rendez-vous, maquette à montrer ou proposition écrite"),
    }),
    objections: z.array(objectionSchema).max(3).describe("Les objections les plus probables pendant l'appel, avec leur réponse"),
    email: z.object({
      subject: text(90).describe("Objet du premier email, moins de 50 caractères"),
      angle: text(500).describe("L'angle du premier email, en deux phrases"),
      evidence: cited,
    }),
  })
}
export type PitchOutput = z.infer<ReturnType<typeof pitchOutputSchema>>

/** A person's decision on a suggested offer; back to "suggested" undoes it. */
export const decideSchema = z
  .object({
    status: z.enum(["ACCEPTED", "REJECTED", "SUGGESTED"], { message: "Décision inconnue" }),
    reason: z.enum(REJECTION_REASONS, { message: "Raison inconnue" }).optional(),
    note: z.string().trim().max(300, "Note : 300 caractères au plus").optional(),
  })
  .strict()
  .refine((v) => v.status === "REJECTED" || (v.reason === undefined && v.note === undefined), { message: "Une raison ne se donne qu’en écartant l’offre", path: ["reason"] })
export type DecideInput = z.infer<typeof decideSchema>

export const startPitchSchema = z.object({}).strict()
