import { simpleParser, type ParsedMail } from "mailparser"
import { normalizeEmail } from "@/lib/crm/normalize"

/** What a message read from a mailbox turned out to be. */
export type Inbound =
  | { kind: "bounce"; hard: boolean; originalMessageId: string | null; recipient: string | null; diagnostic: string }
  | { kind: "reply"; automatic: boolean; fromEmail: string; messageId: string; inReplyTo: string[]; subject: string; text: string; date: Date }
  | { kind: "ignore"; reason: string }

const REPORT_BODY_MAX = 6000
const MESSAGE_ID = /^message-id:\s*(<[^>\r\n]+>)/im

const asArray = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : v.split(/\s+/)).filter((x) => x.startsWith("<") && x.endsWith(">"))

const headerText = (mail: ParsedMail, name: string): string => {
  const v = mail.headers.get(name)
  if (v === undefined || v === null) return ""
  if (typeof v === "string") return v
  if (typeof v === "object" && "value" in v && typeof (v as { value: unknown }).value === "string") return (v as { value: string }).value
  return String(v)
}

/** The part of a reply the person wrote: quoted history ("Le … a écrit :", "> …", "Original Message") is cut. */
export function replyBody(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^>/.test(line)) break
    if (/^\s*(le .{5,120}(a écrit|à écrit)\s*:?|on .{5,120}wrote:?)\s*$/i.test(line)) break
    // "Le lun. 3 nov. 2026 à 10:00, X <x@y> a écrit :" wrapped on two lines.
    if (/^\s*(le|on)\s.{3,80},?\s*$/i.test(line) && /(a écrit|wrote)\s*:?\s*$/i.test(lines[i + 1] ?? "")) break
    if (/^\s*-{2,}\s*(original message|message d'origine|message d’origine|forwarded)/i.test(line)) break
    if (/^\s*(de|from)\s*:\s.+@/i.test(line) && /^\s*(envoyé|sent|date)\s*:/i.test(lines[i + 1] ?? "")) break
    out.push(line)
  }
  return out.join("\n").trim().slice(0, 5000)
}

const OUT_OF_OFFICE = /(absence du bureau|absent(e)?\b|out of office|automatic reply|auto.?reply|réponse automatique|reponse automatique|congés|en congé|vacation)/i

/** Auto-replies must not count as an answer from the prospect (they do not mean the person read anything). */
export function isAutomatic(headers: { autoSubmitted: string; precedence: string; autoreply: string; subject: string }): boolean {
  const auto = headers.autoSubmitted.trim().toLowerCase()
  if (auto && auto !== "no") return true
  if (headers.autoreply) return true
  if (/^(bulk|auto_reply|junk|list)$/i.test(headers.precedence.trim())) return true
  return OUT_OF_OFFICE.test(headers.subject)
}

function parseDeliveryStatus(report: string) {
  const fields = (name: string) => [...report.matchAll(new RegExp(`^${name}:\\s*(.+)$`, "gim"))].map((m) => m[1].trim())
  const recipient = fields("Final-Recipient").concat(fields("Original-Recipient")).map((v) => normalizeEmail(v.replace(/^rfc822;\s*/i, ""))).find(Boolean) ?? null
  const status = fields("Status")[0] ?? ""
  const action = (fields("Action")[0] ?? "").toLowerCase()
  const diagnostic = fields("Diagnostic-Code")[0]?.replace(/^smtp;\s*/i, "") ?? ""
  return { recipient, status, action, diagnostic }
}

/**
 * Reads one raw message. A delivery failure report (RFC 3464) says which message failed and whether for good (5.x.x);
 * anything else from the address of a real person is a reply. Reports that cannot be tied to a message we sent, and
 * mail from our own address, are ignored: the CRM keeps answers to its messages, not the mailbox's other mail.
 */
export async function analyze(source: Buffer, ownAddress: string): Promise<Inbound> {
  const mail = await simpleParser(source)
  const from = normalizeEmail(mail.from?.value?.[0]?.address)
  const contentType = headerText(mail, "content-type")
  const isReport = /multipart\/report/i.test(contentType) && /report-type=["']?delivery-status/i.test(contentType)
  const looksLikeDaemon = !!from && /^(mailer-daemon|postmaster)@/i.test(from)

  if (isReport || looksLikeDaemon) {
    // mailparser does not expose the machine-readable report part, so it is read from the raw source (headers are plain text).
    const raw = source.toString("latin1")
    const statusAt = raw.search(/content-type:\s*message\/delivery-status/i)
    const status = parseDeliveryStatus(statusAt >= 0 ? raw.slice(statusAt) : "")
    const original = (mail.attachments ?? []).find((a) => /message\/rfc822|text\/rfc822-headers/i.test(a.contentType))
    const originalAt = raw.search(/content-type:\s*(message\/rfc822|text\/rfc822-headers)/i)
    const originalId = (original ? MESSAGE_ID.exec(original.content.toString("utf8"))?.[1] : null) ?? (originalAt >= 0 ? MESSAGE_ID.exec(raw.slice(originalAt))?.[1] : null) ?? null
    const body = (mail.text ?? "").slice(0, REPORT_BODY_MAX)
    // Without a delivery-status part, fall back to the SMTP code quoted in the text.
    const code = status.status || /\b([45]\.\d{1,3}\.\d{1,3})\b/.exec(body)?.[1] || ""
    const refs = asArray(mail.references).concat(asArray(mail.inReplyTo))
    const hard = status.action ? status.action === "failed" && code.startsWith("5") : code.startsWith("5")
    return {
      kind: "bounce",
      hard,
      originalMessageId: originalId ?? refs[0] ?? null,
      recipient: status.recipient,
      diagnostic: [code, status.diagnostic || body.split("\n").find((l) => l.trim().length > 20)?.trim()].filter(Boolean).join(" · ").slice(0, 300),
    }
  }

  if (!from) return { kind: "ignore", reason: "no sender" }
  if (from === ownAddress.toLowerCase()) return { kind: "ignore", reason: "own message" }
  const inReplyTo = asArray(mail.inReplyTo).concat(asArray(mail.references))
  if (!inReplyTo.length) return { kind: "ignore", reason: "not an answer to a message" }
  const subject = mail.subject ?? ""
  const automatic = isAutomatic({ autoSubmitted: headerText(mail, "auto-submitted"), precedence: headerText(mail, "precedence"), autoreply: headerText(mail, "x-autoreply") || headerText(mail, "x-autorespond"), subject })
  return {
    kind: "reply",
    automatic,
    fromEmail: from,
    messageId: mail.messageId ?? "",
    inReplyTo,
    subject: subject.slice(0, 300),
    text: replyBody(mail.text ?? ""),
    date: mail.date ?? new Date(),
  }
}
