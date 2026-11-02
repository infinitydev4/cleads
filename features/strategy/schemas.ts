import { z } from "zod"
import { MAX_SEARCH_RESULTS } from "@/features/search/schemas"

/**
 * The Stratège (E25, docs/crm-v1/AGENTS-IA.md §17): what a person asks it, what it answers, and what turns one of its
 * targets into a campaign and a search. Its answer is read loosely (providers do not enforce lengths, and a long answer
 * must not be lost for one long sentence): the code then clips, counts and checks everything against the catalogue.
 */

export const BRIEF_LIMITS = { zone: 120, focus: 400 } as const

/** What the person asks: all optional, the Stratège works from the CRM's own figures. */
export const strategyBriefSchema = z.object({
  zone: z.string().trim().max(BRIEF_LIMITS.zone).optional().transform((v) => v || undefined),
  focus: z.string().trim().max(BRIEF_LIMITS.focus).optional().transform((v) => v || undefined),
  /** An active offer to push, by its identifier. */
  offerSlug: z.string().trim().max(80).optional().transform((v) => v || undefined),
})
export type StrategyBrief = z.infer<typeof strategyBriefSchema>

export const BASES = ["crm", "extractor", "catalogue", "hypothesis"] as const
export type Basis = (typeof BASES)[number]

export const TARGET_LIMITS = { targets: 4, zones: 5, pains: 5, rationale: 6, sector: 80, zone: 80, pain: 220, angle: 400, point: 300, campaignName: 80, activity: 100, location: 120, summary: 900 } as const

/** The model's answer. `offers` are the active offers' identifiers: the only ones it can name. */
export function strategyOutputSchema(offers: readonly [string, ...string[]]) {
  return z.object({
    summary: z.string().describe("Ta lecture de la situation en deux à quatre phrases : ce que disent les chiffres du CRM, et ce qui reste à vérifier"),
    targets: z
      .array(
        z.object({
          sector: z.string().describe("Le métier ou secteur visé, tel qu'un commercial le dirait (ex. « plombiers-chauffagistes »)"),
          sectorKey: z.string().nullable().describe("Sa clé dans la taxonomie de l'Extractor (list_sectors), ou null si elle n'y est pas"),
          zones: z.array(z.string()).describe("Les villes ou départements à prospecter, du plus prometteur au moins prometteur"),
          pains: z.array(z.string()).describe("Les douleurs de ce métier que l'offre soulage, concrètes"),
          offer: z.enum(offers).describe("L'offre phare, par son identifiant exact"),
          angle: z.string().describe("L'angle d'approche, en une ou deux phrases"),
          rationale: z
            .array(z.object({ text: z.string(), basis: z.enum(BASES).describe("crm : un chiffre du CRM ; extractor : la base ou la taxonomie de l'Extractor ; catalogue : l'offre elle-même ; hypothesis : une hypothèse, à vérifier") }))
            .describe("Pourquoi cette cible : chaque point dit sur quoi il s'appuie"),
          campaignName: z.string().describe("Nom court de la campagne (ex. « Plombiers Lyon — refonte mobile »)"),
          search: z.object({
            activity: z.string().describe("L'activité à chercher dans l'Extractor (ex. « plombier »)"),
            location: z.string().describe("Le lieu de la recherche (ex. « Lyon, France »)"),
            maxResults: z.number().int().describe("Nombre d'entreprises à chercher, 50 à 300 en général"),
          }),
          knownCount: z.number().int().nullable().describe("Combien d'entreprises l'Extractor connaît déjà pour ce secteur et cette zone, si search_prospect_base te l'a dit ; sinon null"),
        })
      )
      .describe("Deux à quatre cibles, la plus prometteuse d'abord"),
  })
}
export type StrategyOutput = z.infer<ReturnType<typeof strategyOutputSchema>>

/** A target's search, as the person confirms it before launching (they may adjust it). */
export const launchSearchSchema = z.object({
  activity: z.string().trim().min(2, "Indiquez une activité (ex. plombier)").max(TARGET_LIMITS.activity),
  location: z.string().trim().min(2, "Indiquez une zone (ex. Lyon, France)").max(TARGET_LIMITS.location),
  maxResults: z.number().int().min(10).max(MAX_SEARCH_RESULTS),
})

export const targetActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("campaign") }),
  z.object({ action: z.literal("search"), search: launchSearchSchema }),
  z.object({ action: z.literal("dismiss") }),
])
export type TargetAction = z.infer<typeof targetActionSchema>
