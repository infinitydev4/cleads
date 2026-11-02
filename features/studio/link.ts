import { createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto"
import { previewHost } from "./host"

export { previewHost }

/**
 * Links to a site's preview (docs/crm-v1/AGENTS-IA.md §16). A share token is 128 bits derived from a random nonce and a
 * server secret: the database keeps the nonce and the token's hash, never the token, yet the CRM can show the link
 * again. PageSpeed reads a version through a short-lived random token, hashed the same way.
 */
export const LINK_DAYS = 30
export const PURGE_DAYS = 90
export const PROBE_MINUTES = 15
export const TOKEN = /^[A-Za-z0-9_-]{22}$/

/** The secret links are derived from: STUDIO_PREVIEW_SECRET, or a key derived from NEXTAUTH_SECRET for this use only. */
function secret(): Buffer {
  const own = process.env.STUDIO_PREVIEW_SECRET
  if (own && own.length >= 32) return Buffer.from(own)
  const base = process.env.NEXTAUTH_SECRET
  if (!base) throw new Error("STUDIO_PREVIEW_SECRET ou NEXTAUTH_SECRET manquant : les liens d’aperçu ne peuvent pas être signés.")
  return Buffer.from(hkdfSync("sha256", base, "cleads-studio", "preview-links", 32))
}

export const newNonce = () => randomBytes(16).toString("base64url")
export const randomToken = () => randomBytes(16).toString("base64url")
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex")

/** The share token of a site: the same nonce always gives the same token, a new nonce revokes the old one. */
export function shareToken(siteId: string, nonce: string): string {
  return createHmac("sha256", secret()).update(`link:${siteId}:${nonce}`).digest("base64url").slice(0, 22)
}

/** Whether the stored hash still matches (it does not after the secret changed: the link must be created again). */
export function tokenMatches(token: string, hash: string): boolean {
  const a = Buffer.from(hashToken(token), "hex")
  const b = Buffer.from(hash, "hex")
  return a.length === b.length && timingSafeEqual(a, b)
}

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$|\.localhost(:\d+)?$/

/** Where a token's page lives, for links shown in the CRM and for PageSpeed. */
export function previewUrl(token: string, host = previewHost()): string | null {
  if (host) return `${LOCAL.test(host) ? "http" : "https"}://${host}/${token}`
  const app = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL
  return app ? `${app.replace(/\/+$/, "")}/apercu/${token}` : null
}

export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000)
