import { prisma } from "@/lib/prisma"
import { resendProvider } from "./providers/resend"
import { ses } from "./providers/ses"
import { getMailSettings } from "./settings"
import type { MailMessage, MailProvider, MailPurpose, ProviderId, ResolvedMessage, SendAttempt, SendOutcome } from "./types"
import { defaultWorkspaceId } from "./workspace"

export * from "./types"

export const providers: Record<ProviderId, MailProvider> = { ses, resend: resendProvider }

export class MailPolicyError extends Error {}

/** The CRM's sender. Its domain must be verified at every provider that may carry the mail. */
export const defaultFrom = () => {
  const address = process.env.MAIL_FROM || process.env.RESEND_FROM_EMAIL || "contact@cleads.fr"
  return address.includes("<") ? address : `Cleads <${address}>`
}

const normalize = (to: string | string[]) => [...new Set((Array.isArray(to) ? to : [to]).map((a) => a.trim().toLowerCase()).filter(Boolean))]

/** Addresses that bounced for good or complained must not get anything else, transactional included. */
async function blocked(workspaceId: string | null, recipients: string[]): Promise<Set<string>> {
  if (!workspaceId || recipients.length === 0) return new Set()
  const rows = await prisma.suppression.findMany({ where: { workspaceId, email: { in: recipients }, reason: { in: ["BOUNCED", "COMPLAINED"] } }, select: { email: true } })
  return new Set(rows.map((r) => r.email!).filter(Boolean))
}

/**
 * Sends a CRM email. Never throws because a provider failed: the caller gets the outcome and decides (a booking is kept
 * even when its confirmation cannot go out). It throws only on a policy violation, which is a programming error.
 *
 * Outreach (cold prospecting) is refused here by design: Amazon SES and Resend forbid it in their terms, and a
 * suspension would take the transactional emails down with it. Outreach goes through dedicated mailboxes (E9a).
 */
export async function sendMail(message: MailMessage, opts: { purpose: MailPurpose; workspaceId?: string | null }): Promise<SendOutcome> {
  if (opts.purpose !== "transactional") {
    throw new MailPolicyError("Seuls les emails transactionnels passent par SES ou Resend : la prospection utilise des boîtes dédiées.")
  }
  const workspaceId = opts.workspaceId ?? (await defaultWorkspaceId())
  const all = normalize(message.to)
  const stopped = await blocked(workspaceId, all)
  const to = all.filter((a) => !stopped.has(a))
  if (to.length === 0) return { ok: false, provider: null, messageId: null, skipped: "suppressed", attempts: [] }

  const settings = workspaceId ? await getMailSettings(workspaceId) : { transactionalProvider: ses.configured() ? ("ses" as const) : ("resend" as const), fallbackEnabled: true }
  const order: ProviderId[] = [settings.transactionalProvider, ...(settings.fallbackEnabled ? (settings.transactionalProvider === "ses" ? (["resend"] as const) : (["ses"] as const)) : [])]
  const usable = order.map((id) => providers[id]).filter((p) => p.configured())
  if (usable.length === 0) return { ok: false, provider: null, messageId: null, skipped: "not_configured", attempts: [] }

  const resolved: ResolvedMessage = { ...message, to, from: message.from ?? defaultFrom() }
  const attempts: SendAttempt[] = []
  for (const provider of usable) {
    try {
      const { id } = await provider.send(resolved)
      return { ok: true, provider: provider.id, messageId: id, attempts }
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      attempts.push({ provider: provider.id, error: text })
      console.error(`[MAIL_${provider.id.toUpperCase()}]`, text)
    }
  }
  return { ok: false, provider: null, messageId: null, attempts }
}

/** Sends through one chosen provider only, no fallback: a test must show what that provider really does. */
export async function sendTest(provider: ProviderId, to: string): Promise<SendOutcome> {
  const p = providers[provider]
  if (!p.configured()) return { ok: false, provider, messageId: null, skipped: "not_configured", attempts: [] }
  try {
    const { id } = await p.send({
      to: [to.trim().toLowerCase()],
      from: defaultFrom(),
      subject: `Test d’envoi Cleads (${p.label})`,
      html: `<p>Bonjour,</p><p>Ce message de test confirme que le CRM Cleads envoie bien ses emails par <strong>${p.label}</strong>.</p><p>Vous n’avez rien à faire.</p>`,
      text: `Ce message de test confirme que le CRM Cleads envoie bien ses emails par ${p.label}.`,
    })
    return { ok: true, provider, messageId: id, attempts: [] }
  } catch (error) {
    return { ok: false, provider, messageId: null, attempts: [{ provider, error: error instanceof Error ? error.message : String(error) }] }
  }
}
