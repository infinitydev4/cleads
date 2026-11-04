import { z } from "zod"

/**
 * The meeting brief of the Enquêteur (E30 lot 2, D51): what the model answers, and what is saved once the code has
 * checked it. Safe in the browser.
 *
 * The model cites sources by number (« W3 » for the third page its searches returned, « CRM » for a fact of the fiche):
 * it never writes a link, so it cannot invent one. A claim citing nothing that exists is left out.
 */
export const BRIEF_LIMITS = { who: 5, news: 5, market: 4, angles: 3, questions: 6, claim: 400, title: 120, why: 500, question: 300 } as const

const ref = z.string().describe("« W3 » pour la page W3 de tes recherches, « CRM » pour un fait donné par la fiche")
const claim = z.object({
  text: z.string().describe("Un fait, en une phrase courte"),
  sources: z.array(ref).describe("Ce qui le prouve : une ou deux références"),
  date: z.string().nullable().describe("Sa date telle que la source la donne (jour, ou mois et année), ou null"),
})

/** `offers` are the identifiers of the active offers; without any, an angle names none. */
export function briefOutputSchema(offers: readonly string[]) {
  const offer = offers.length ? z.enum(offers as [string, ...string[]]).nullable() : z.null()
  return z.object({
    who: z.array(claim).describe("Qui ils sont : activité, clientèle, taille, ancienneté, positionnement. Deux à cinq faits."),
    news: z.array(claim).describe("Leur actualité des douze derniers mois, la plus récente d'abord. Vide si tu n'as rien trouvé de daté."),
    market: z.array(claim).describe("Leur marché local : concurrents cités, annuaires et plateformes qui dominent. Un à quatre faits."),
    angles: z
      .array(
        z.object({
          title: z.string().describe("L'angle, en quelques mots"),
          offer: offer.describe("L'identifiant exact de l'offre active qu'il sert, ou null"),
          why: z.string().describe("Pourquoi cet angle, relié à un fait ou à un signal ci-dessus"),
          sources: z.array(ref).describe("Les références des faits qui le justifient"),
        })
      )
      .describe("Trois angles d'approche pour le rendez-vous"),
    questions: z.array(z.string()).describe("Cinq questions à poser, ouvertes, tirées de ce que tu as appris"),
  })
}
export type BriefOutput = z.infer<ReturnType<typeof briefOutputSchema>>

export const briefSourceSchema = z.object({ url: z.string(), title: z.string(), date: z.string().nullable() })
export type BriefSource = z.infer<typeof briefSourceSchema>

const savedClaim = z.object({ text: z.string(), sources: z.array(z.string()), crm: z.boolean(), date: z.string().nullable() })
export type BriefClaim = z.infer<typeof savedClaim>

/** What is saved: claims whose sources are links (or the CRM), angles tied to an active offer, the CRM's signals. */
export const briefContentSchema = z.object({
  who: z.array(savedClaim),
  news: z.array(savedClaim),
  market: z.array(savedClaim),
  angles: z.array(z.object({ title: z.string(), offer: z.string().nullable(), offerName: z.string().nullable(), why: z.string(), sources: z.array(z.string()) })),
  questions: z.array(z.string()),
  /** Written by the code from the fiche, never by the model. */
  signals: z.array(z.object({ label: z.string(), summary: z.string(), occurredAt: z.string(), sourceUrl: z.string().nullable() })),
  meeting: z.object({ startsAt: z.string(), type: z.string() }).nullable(),
})
export type BriefContent = z.infer<typeof briefContentSchema>
