import type { LeadSource } from "@prisma/client"

// Pure: the composer shows the exact footer the server will add.

/** Where the address came from, told to the person in the first message (docs/crm-v1/PLAN.md section 7.3). */
export function originText(source: LeadSource | null | undefined): string {
  switch (source) {
    case "EXTRACTOR":
      return "la fiche publique de votre établissement ou votre site internet"
    case "INBOUND":
      return "votre demande de contact"
    default:
      return "un annuaire professionnel public"
  }
}

export interface ComposeInput {
  /** Rendered body written by the person, without signature or footer. */
  body: string
  signature: string | null
  senderName: string
  origin: string
  unsubscribeUrl: string
}

/** Body + signature + the footer nobody can remove: who writes, why they have the address, how to stop it. */
export function composeText(c: ComposeInput): string {
  const body = c.body.replace(/\r\n/g, "\n").trim()
  const signature = (c.signature?.trim() || c.senderName).replace(/\r\n/g, "\n")
  const footer = `Vous recevez ce message à votre adresse professionnelle, trouvée sur ${c.origin}. Pour ne plus recevoir d’emails de notre part : ${c.unsubscribeUrl}`
  return `${body}\n\n${signature}\n\n--\n${footer}\n`
}

export const SUBJECT_MAX = 150
export const BODY_MAX = 5_000
