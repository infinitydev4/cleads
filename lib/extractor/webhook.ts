import { createHmac, timingSafeEqual } from "node:crypto"

export const WEBHOOK_TOLERANCE_S = 5 * 60

export type SignatureCheck = { ok: true } | { ok: false; reason: "missing_secret" | "missing_headers" | "stale" | "bad_signature" }

/**
 * Checks `X-Cleads-Signature: sha256=HMAC(secret, timestamp + "." + body)`. The timestamp window rejects replays of an
 * old capture; the comparison is constant-time.
 */
export function verifyWebhook(input: { secret: string | undefined; timestamp: string | null; signature: string | null; body: string; now?: number }): SignatureCheck {
  if (!input.secret) return { ok: false, reason: "missing_secret" }
  if (!input.timestamp || !input.signature) return { ok: false, reason: "missing_headers" }
  const ts = Number(input.timestamp)
  const now = Math.floor((input.now ?? Date.now()) / 1000)
  if (!Number.isFinite(ts) || Math.abs(now - ts) > WEBHOOK_TOLERANCE_S) return { ok: false, reason: "stale" }
  const expected = createHmac("sha256", input.secret).update(`${input.timestamp}.${input.body}`).digest("hex")
  const given = input.signature.replace(/^sha256=/, "")
  const a = Buffer.from(expected, "utf8")
  const b = Buffer.from(given, "utf8")
  return a.length === b.length && timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: "bad_signature" }
}

/** Same computation as the sender, for tests and tooling. */
export const signWebhook = (secret: string, timestamp: string, body: string) => `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`
