import { Resend } from "resend"

let client: Resend | null | undefined

/**
 * Transactional email client, created on first use. Importing a route must never fail because the key is
 * missing (local development, previews): callers check for null and skip or report the missing email.
 */
export function getResend(): Resend | null {
  if (client === undefined) client = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
  return client
}
