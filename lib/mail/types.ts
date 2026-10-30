/**
 * What an email is for decides which providers may carry it.
 *  - transactional: caused by a person's own action or a CRM event (booking confirmation, invitation, reminder).
 *  - outreach: prospecting to people who did not ask. Never carried by Amazon SES or Resend: their terms forbid it.
 */
export type MailPurpose = "transactional" | "outreach"

export type ProviderId = "ses" | "resend"
export const PROVIDER_IDS: ProviderId[] = ["ses", "resend"]

export interface MailAttachment {
  filename: string
  content: Buffer
  contentType: string
}

export interface MailMessage {
  to: string | string[]
  subject: string
  html: string
  text?: string
  /** Display address; defaults to the CRM's sender. Must belong to a domain verified at the provider. */
  from?: string
  replyTo?: string
  attachments?: MailAttachment[]
}

export interface ResolvedMessage extends Omit<MailMessage, "to" | "from"> {
  to: string[]
  from: string
}

export interface MailProvider {
  id: ProviderId
  label: string
  configured(): boolean
  /** Throws when the provider refuses or cannot be reached. */
  send(message: ResolvedMessage): Promise<{ id: string | null }>
}

export interface SendAttempt {
  provider: ProviderId
  error: string
}

export interface SendOutcome {
  ok: boolean
  provider: ProviderId | null
  messageId: string | null
  /** Set when nothing was sent on purpose. */
  skipped?: "suppressed" | "not_configured"
  attempts: SendAttempt[]
}
