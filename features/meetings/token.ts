import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Link given to the person who booked, to look at, move or cancel their meeting without an account.
 * Stateless: `<meetingId>.<signature>`; the signature is an HMAC of the id under a server secret, so a link cannot
 * be guessed or forged and no token needs storing. It stops working when the meeting is over (checked by the caller).
 */
function secret(): string {
  const s = process.env.MEETING_LINK_SECRET || process.env.NEXTAUTH_SECRET
  if (!s) throw new Error("MEETING_LINK_SECRET (or NEXTAUTH_SECRET) must be set to sign meeting links.")
  return s
}

const sign = (id: string) => createHmac("sha256", secret()).update(`meeting:${id}`).digest("base64url").slice(0, 32)

export const signMeetingToken = (meetingId: string) => `${meetingId}.${sign(meetingId)}`

/** The meeting id carried by a genuine token, or null. */
export function verifyMeetingToken(token: string): string | null {
  const dot = token.lastIndexOf(".")
  if (dot < 1) return null
  const id = token.slice(0, dot)
  const given = Buffer.from(token.slice(dot + 1))
  const expected = Buffer.from(sign(id))
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null
}
