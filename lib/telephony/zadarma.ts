import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { normalizePhone } from "@/lib/crm/normalize"

/**
 * Zadarma's REST API and webhooks (E32): https://zadarma.com/en/support/api/
 * The keys come from the personal account (Settings › API) and live in ZADARMA_API_KEY and ZADARMA_API_SECRET only.
 */
const API = "https://api.zadarma.com"

export class ZadarmaError extends Error {
  constructor(
    public readonly kind: "not_configured" | "unreachable" | "refused" | "rate_limited" | "bad_response",
    message: string
  ) {
    super(message)
  }
}

export function zadarmaConfigured(): boolean {
  return Boolean(process.env.ZADARMA_API_KEY && process.env.ZADARMA_API_SECRET)
}

/** PHP's urlencode, which Zadarma's signature is computed over: like encodeURIComponent, but only -_. stay as they are. */
function phpEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, "+")
}

/** http_build_query of the parameters sorted by key, as the signature expects. */
export function queryString(params: Record<string, string | number>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${phpEncode(k)}=${phpEncode(String(params[k]))}`)
    .join("&")
}

/** PHP's base64_encode(hash_hmac('sha1', …)): the hex digest, itself base64-encoded. */
function hmac(text: string, secret: string): string {
  return Buffer.from(createHmac("sha1", secret).update(text).digest("hex")).toString("base64")
}

/** The Authorization header of an API request: key, then the HMAC of path + query + md5(query). */
export function authorization(path: string, query: string, key: string, secret: string): string {
  return `${key}:${hmac(path + query + createHash("md5").update(query).digest("hex"), secret)}`
}

/** A GET on the API. `path` is like "/v1/statistics/pbx/". Answers the body as text: some ids do not survive JSON numbers. */
export async function zadarmaGet(path: string, params: Record<string, string | number> = {}): Promise<string> {
  const key = process.env.ZADARMA_API_KEY
  const secret = process.env.ZADARMA_API_SECRET
  if (!key || !secret) throw new ZadarmaError("not_configured", "La téléphonie Zadarma n’est pas configurée.")
  const query = queryString(params)
  let res: Response
  try {
    res = await fetch(`${API}${path}${query ? `?${query}` : ""}`, { headers: { Authorization: authorization(path, query, key, secret) }, signal: AbortSignal.timeout(15_000) })
  } catch {
    throw new ZadarmaError("unreachable", "Zadarma ne répond pas.")
  }
  const text = await res.text()
  if (res.status === 429) throw new ZadarmaError("rate_limited", "Trop de demandes à Zadarma : réessayez dans une minute.")
  if (!res.ok || /"status"\s*:\s*"error"/.test(text)) throw new ZadarmaError("refused", `Zadarma a refusé la demande (${res.status}).`)
  return text
}

/**
 * Which fields each webhook signs, joined with nothing between them (the documentation's table). An event missing here
 * carries no data we keep.
 */
const SIGNED_FIELDS: Record<string, string[]> = {
  NOTIFY_START: ["caller_id", "called_did", "call_start"],
  NOTIFY_INTERNAL: ["caller_id", "called_did", "call_start"],
  NOTIFY_ANSWER: ["caller_id", "destination", "call_start"],
  NOTIFY_END: ["caller_id", "called_did", "call_start"],
  NOTIFY_OUT_START: ["internal", "destination", "call_start"],
  NOTIFY_OUT_END: ["internal", "destination", "call_start"],
  NOTIFY_RECORD: ["pbx_call_id", "call_id_with_rec"],
}

/** The Signature header of a webhook, checked in constant time. False for an unknown event or a missing signature. */
export function verifyWebhook(fields: URLSearchParams, signature: string | null, secret: string): boolean {
  const signed = SIGNED_FIELDS[fields.get("event") ?? ""]
  if (!signed || !signature) return false
  const expected = Buffer.from(hmac(signed.map((f) => fields.get(f) ?? "").join(""), secret))
  const given = Buffer.from(signature)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** The webhook's signature for these fields: the tests and nothing else need it. */
export function signWebhook(fields: Record<string, string>, secret: string): string {
  return hmac((SIGNED_FIELDS[fields.event] ?? []).map((f) => fields[f] ?? "").join(""), secret)
}

/**
 * A number as Zadarma writes it ("33612345678", "+33…", "0612…", "0033…") made canonical like the CRM's (+33…), so it
 * matches the fiches. A short internal number or a hidden caller stays as given.
 */
export function canonicalNumber(raw: string | null | undefined): string {
  const given = (raw ?? "").trim()
  const digits = given.replace(/[^\d+]/g, "")
  const plain = /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : digits
  return normalizePhone(plain) ?? given
}
