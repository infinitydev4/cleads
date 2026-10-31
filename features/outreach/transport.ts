import nodemailer from "nodemailer"
import MailComposer from "nodemailer/lib/mail-composer"
import { ImapFlow } from "imapflow"

/** What a connection needs, password already decrypted. Built on the server only and never returned to the browser. */
export interface MailboxCredentials {
  address: string
  displayName: string
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  username: string
  password: string
  imapHost: string | null
  imapPort: number | null
  imapSecure: boolean
  sentFolder: string | null
}

export interface OutgoingMail {
  to: string
  subject: string
  text: string
  messageId: string
  headers: Record<string, string>
}

export type TransportErrorKind = "auth" | "connection" | "recipient" | "other"

/** A send or a test that failed, with a cause a person can act on. `auth` means the mailbox must be fixed before it sends again. */
export class TransportError extends Error {
  constructor(public readonly kind: TransportErrorKind, message: string, public readonly detail?: string) {
    super(message)
  }
}

const TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 }

function smtp(c: MailboxCredentials) {
  return nodemailer.createTransport({
    host: c.smtpHost,
    port: c.smtpPort,
    secure: c.smtpSecure,
    // Port 587 starts in clear and must upgrade: refuse to send a password over a connection that stayed in clear.
    requireTLS: !c.smtpSecure,
    auth: { user: c.username, pass: c.password },
    ...TIMEOUTS,
  })
}

function imap(c: MailboxCredentials) {
  return new ImapFlow({
    host: c.imapHost!,
    port: c.imapPort ?? (c.imapSecure ? 993 : 143),
    secure: c.imapSecure,
    auth: { user: c.username, pass: c.password },
    logger: false,
    disableAutoIdle: true,
    ...TIMEOUTS,
  })
}

/** Translates SMTP / IMAP failures; the raw server answer is kept as `detail` for the log. */
export function toTransportError(error: unknown, stage: "smtp" | "imap"): TransportError {
  if (error instanceof TransportError) return error
  const e = (error ?? {}) as { code?: string; responseCode?: number; response?: string; message?: string; authenticationFailed?: boolean }
  const detail = String(e.response || e.message || error).slice(0, 300)
  const server = stage === "smtp" ? "SMTP" : "IMAP"
  if (e.code === "EAUTH" || e.authenticationFailed || e.responseCode === 535) {
    return new TransportError("auth", `Identifiants ${server} refusés : vérifiez l’identifiant et le mot de passe (souvent un mot de passe d’application).`, detail)
  }
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ETLS"].includes(e.code ?? "")) {
    return new TransportError("connection", `Serveur ${server} injoignable : vérifiez l’hôte, le port et le chiffrement.`, detail)
  }
  if (e.code === "EENVELOPE" || (e.responseCode && e.responseCode >= 550 && e.responseCode < 560)) {
    return new TransportError("recipient", "Le serveur a refusé le destinataire.", detail)
  }
  return new TransportError("other", `Échec ${server} : ${detail}`, detail)
}

async function buildRaw(c: MailboxCredentials, m: OutgoingMail): Promise<Buffer> {
  return new MailComposer({
    from: { name: c.displayName, address: c.address },
    to: m.to,
    subject: m.subject,
    text: m.text,
    messageId: m.messageId,
    headers: m.headers,
    date: new Date(),
    // Short lines and no HTML part: it reads like a person wrote it, because a person did.
    textEncoding: "quoted-printable",
  })
    .compile()
    .build()
}

export const savesSentItself = (smtpHost: string) => /(^|\.)(gmail|googlemail)\.com$/i.test(smtpHost.trim())

async function findSentFolder(client: ImapFlow, preferred: string | null): Promise<string | null> {
  const folders = await client.list()
  if (preferred && folders.some((f) => f.path === preferred)) return preferred
  return folders.find((f) => f.specialUse === "\\Sent")?.path ?? null
}

/**
 * The only door to the mailboxes' servers. An object rather than loose functions so tests can replace `send` and
 * `verify`: nothing in the test suites reaches a real server.
 */
export const transport = {
  /** Logs in by SMTP and, when set, by IMAP; returns the folder sent copies will go to. Throws TransportError. */
  async verify(c: MailboxCredentials): Promise<{ imap: boolean; sentFolder: string | null }> {
    try {
      await smtp(c).verify()
    } catch (error) {
      throw toTransportError(error, "smtp")
    }
    if (!c.imapHost) return { imap: false, sentFolder: null }
    const client = imap(c)
    try {
      await client.connect()
      const sentFolder = await findSentFolder(client, c.sentFolder)
      return { imap: true, sentFolder }
    } catch (error) {
      throw toTransportError(error, "imap")
    } finally {
      await client.logout().catch(() => {})
    }
  },

  /** Sends one message. Resolves once the SMTP server has accepted it; returns the raw message for the copy in "Sent". */
  async send(c: MailboxCredentials, m: OutgoingMail): Promise<{ raw: Buffer; response: string }> {
    const raw = await buildRaw(c, m)
    try {
      const info = await smtp(c).sendMail({ envelope: { from: c.address, to: [m.to] }, raw })
      if (info.rejected?.length) throw new TransportError("recipient", "Le serveur a refusé le destinataire.", String(info.response ?? ""))
      return { raw, response: String(info.response ?? "") }
    } catch (error) {
      throw toTransportError(error, "smtp")
    }
  },

  /**
   * Files a copy in the mailbox's "Sent" folder, as a mail client would: most SMTP servers (Gmail aside) do not do it.
   * Best effort: a missing copy never turns a sent message into a failure.
   */
  async saveToSent(c: MailboxCredentials, raw: Buffer): Promise<boolean> {
    // Gmail files what its SMTP server sends by itself: a second copy would show the message twice.
    if (!c.imapHost || savesSentItself(c.smtpHost)) return false
    const client = imap(c)
    try {
      await client.connect()
      const folder = await findSentFolder(client, c.sentFolder)
      if (!folder) return false
      await client.append(folder, raw, ["\\Seen"])
      return true
    } catch (error) {
      console.error("[OUTREACH_SAVE_SENT]", c.address, toTransportError(error, "imap").detail)
      return false
    } finally {
      await client.logout().catch(() => {})
    }
  },
}
