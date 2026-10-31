import { createHmac, randomUUID, timingSafeEqual } from "node:crypto"
import { appBaseUrl } from "@/features/team/invite-email"

// ── Unsubscribe links ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * Stateless, like the meeting links: `<emailMessageId>.<signature>`. The token names the message, never the
 * address, so no personal data travels in the URL; the message row says who to stop writing to.
 */
function secret(): string {
  const s = process.env.OUTREACH_LINK_SECRET || process.env.NEXTAUTH_SECRET
  if (!s) throw new Error("OUTREACH_LINK_SECRET (or NEXTAUTH_SECRET) must be set to sign unsubscribe links.")
  return s
}

const sign = (id: string) => createHmac("sha256", secret()).update(`unsubscribe:${id}`).digest("base64url").slice(0, 32)

export const signUnsubscribeToken = (emailMessageId: string) => `${emailMessageId}.${sign(emailMessageId)}`

export function verifyUnsubscribeToken(token: string): string | null {
  const dot = token.lastIndexOf(".")
  if (dot < 1) return null
  const id = token.slice(0, dot)
  const given = Buffer.from(token.slice(dot + 1))
  const expected = Buffer.from(sign(id))
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null
}

/**
 * Where unsubscribe links point. A prospecting domain (trycleads.com) can serve them so that cold mail carries no
 * link to cleads.fr; by default they use the CRM's own address.
 */
export const outreachBaseUrl = () => (process.env.OUTREACH_LINK_BASE_URL || appBaseUrl()).replace(/\/$/, "")

export function unsubscribeLinks(emailMessageId: string) {
  const token = signUnsubscribeToken(emailMessageId)
  return {
    /** In the message body: a page with a confirmation button (link scanners open URLs; a GET must not unsubscribe). */
    page: `${outreachBaseUrl()}/u/${token}`,
    /** In the List-Unsubscribe header: one-click POST from the mail client (RFC 8058). */
    oneClick: `${outreachBaseUrl()}/api/public/unsubscribe/${token}`,
  }
}

export { composeText, originText, type ComposeInput } from "./footer"

// ── The message ─────────────────────────────────────────────────────────────────────────────────────────────────

export const newMessageId = (address: string) => `<${randomUUID()}@${address.slice(address.lastIndexOf("@") + 1)}>`

/** Headers every prospecting message carries. No tracking pixel, no attachment, no HTML part. */
export function outreachHeaders(oneClickUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${oneClickUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  }
}

export { SUBJECT_MAX, BODY_MAX } from "./footer"
