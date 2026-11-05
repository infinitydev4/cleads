import { createHash } from "node:crypto"
import { z } from "zod"

/**
 * E30 lot 3: Meta's Ad Library (D46, D49), read through its Graph API endpoint `ads_archive`. Meta publishes every ad
 * delivered in the European Union, whatever its subject, for a year after it last ran (Digital Services Act): the ads a
 * company runs now prove a marketing budget. The API is free; it needs the user token of someone whose identity Meta
 * confirmed (facebook.com/ID), set on the worker only (META_ADS_TOKEN, valid 60 days).
 *
 * The token goes in the Authorization header. Only Meta's check of the token itself (debug_token) takes it in its
 * address, as Meta requires; no address is ever logged, and no message here carries the token. Meta's preview links
 * (ad_snapshot_url) embed it, so they are never asked for: an ad is linked by its public page in the Ad Library
 * instead. The API gives no landing page, only the domain an ad shows. Worker-safe.
 */
export const META_GRAPH_URL = "https://graph.facebook.com/v27.0"
export const META_ADS_SOURCE = "Bibliothèque publicitaire Meta"
/** At most ten pages per call (search_page_ids). */
export const PAGES_PER_CALL = 10
/** Ads per page of results; a batch of pages reads five pages at most (500 ads), a name search one. */
export const ADS_PAGE_SIZE = 100
const MAX_PAGES = 5
/** A token that expires within this many days is « to renew », and the owners hear of it. */
export const TOKEN_WARN_DAYS = 7
const FIELDS = ["id", "page_id", "page_name", "ad_delivery_start_time", "publisher_platforms", "ad_creative_link_captions", "ad_creative_link_titles"].join(",")
const DAY = 86_400_000

export interface MetaAd {
  id: string
  pageId: string
  pageName: string
  /** YYYY-MM-DD: when the advertiser wanted it to start. */
  start: string | null
  platforms: string[]
  /** The domains the ad shows in its call to action, lower case (« plomberie-roche.fr »). */
  domains: string[]
  titles: string[]
}

export interface MetaAdsDeps {
  /** The user token; null or empty when none is set. */
  token?: string | null
  fetchImpl?: typeof fetch
  timeoutMs?: number
  signal?: AbortSignal
}

/** Why a read failed: the token (expired or revoked), Meta's identity check, its rate limits, or anything else. */
export type MetaFailure = "token" | "identity" | "rate" | "unavailable"

export class MetaAdsError extends Error {
  constructor(
    readonly kind: MetaFailure,
    message: string,
    readonly code: number | null = null
  ) {
    super(message)
    this.name = "MetaAdsError"
  }
}

/** A text with the token taken out, whatever put it there. */
export const scrub = (text: string, token: string | null | undefined) => (token ? text.split(token).join("…") : text)

/** A short fingerprint of a token, never the token: a new token gets its own notices. */
export const tokenPrint = (token: string) => createHash("sha256").update(token).digest("hex").slice(0, 8)

const graphError = z.object({ error: z.object({ message: z.string().nullish(), code: z.number().nullish() }).passthrough() }).passthrough()
/** Meta's rate limits: application, user, page, this API, and the business use case codes (800xx). */
const RATE_CODES = new Set([4, 17, 32, 613])

/** What an error answer means. Meta's message is kept short, without the token. */
export function failureOf(status: number, body: unknown, token: string | null | undefined): MetaAdsError {
  const parsed = graphError.safeParse(body)
  const code = parsed.success ? (parsed.data.error.code ?? null) : null
  const said = scrub(parsed.success ? (parsed.data.error.message ?? `HTTP ${status}`) : `HTTP ${status}`, token).slice(0, 200)
  if (code === 190) return new MetaAdsError("token", `Le jeton Meta n'est plus valable (${said}).`, code)
  if (code === 10 || (code !== null && code >= 200 && code < 300)) {
    return new MetaAdsError("identity", `Meta refuse la lecture de la bibliothèque publicitaire (${said}) : l'identité du titulaire du jeton doit être confirmée sur facebook.com/ID.`, code)
  }
  if (status === 429 || (code !== null && (RATE_CODES.has(code) || (code >= 80_000 && code < 80_100)))) return new MetaAdsError("rate", `Limite de Meta atteinte (${said}).`, code)
  return new MetaAdsError("unavailable", `La bibliothèque publicitaire Meta n'a pas répondu correctement (${said}).`, code)
}

async function request(url: string, deps: MetaAdsDeps): Promise<unknown> {
  const token = deps.token?.trim()
  if (!token) throw new MetaAdsError("token", "Le jeton Meta n'est pas posé sur le worker (META_ADS_TOKEN).")
  const timeout = AbortSignal.timeout(deps.timeoutMs ?? 20_000)
  let res: Response
  try {
    res = await (deps.fetchImpl ?? fetch)(url, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, signal: deps.signal ? AbortSignal.any([deps.signal, timeout]) : timeout })
  } catch (error) {
    throw new MetaAdsError("unavailable", `La bibliothèque publicitaire Meta est injoignable (${scrub(error instanceof Error ? error.message : String(error), token).slice(0, 120)}).`)
  }
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok || (body && typeof body === "object" && "error" in body)) throw failureOf(res.status, body, token)
  return body
}

/** A caption that names a site (« PLOMBERIE-ROCHE.FR », « www.roche.fr/devis »): its domain; anything else, null. */
export function domainOf(caption: string): string | null {
  const t = caption.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#\s]/)[0] ?? ""
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(t) ? t : null
}

const adSchema = z
  .object({
    id: z.string(),
    page_id: z.string().nullish(),
    page_name: z.string().nullish(),
    ad_delivery_start_time: z.string().nullish(),
    publisher_platforms: z.array(z.string()).nullish(),
    ad_creative_link_captions: z.array(z.string()).nullish(),
    ad_creative_link_titles: z.array(z.string()).nullish(),
  })
  .passthrough()
const resultsSchema = z.object({ data: z.array(z.unknown()), paging: z.object({ next: z.string().nullish() }).passthrough().nullish() }).passthrough()

/** One page of `ads_archive` results; an ad without a page is skipped. */
export function parseAds(body: unknown): { ads: MetaAd[]; next: string | null } {
  const page = resultsSchema.safeParse(body)
  if (!page.success) return { ads: [], next: null }
  const ads: MetaAd[] = []
  for (const raw of page.data.data) {
    const a = adSchema.safeParse(raw)
    if (!a.success || !a.data.page_id) continue
    const start = a.data.ad_delivery_start_time ?? ""
    ads.push({
      id: a.data.id,
      pageId: a.data.page_id,
      pageName: (a.data.page_name ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
      start: /^\d{4}-\d{2}-\d{2}/.test(start) ? start.slice(0, 10) : null,
      platforms: [...new Set((a.data.publisher_platforms ?? []).map((p) => p.toUpperCase()))],
      domains: [...new Set((a.data.ad_creative_link_captions ?? []).map(domainOf).filter((d): d is string => !!d))],
      titles: [...new Set((a.data.ad_creative_link_titles ?? []).map((t) => t.replace(/\s+/g, " ").trim().slice(0, 120)).filter(Boolean))].slice(0, 3),
    })
  }
  return { ads, next: page.data.paging?.next ?? null }
}

/**
 * The ads running now in France, of up to ten known pages, or whose text holds a company's name. `more` says the
 * results went on past what was read.
 */
export async function searchAds(query: { pageIds: string[] } | { terms: string }, deps: MetaAdsDeps): Promise<{ ads: MetaAd[]; more: boolean }> {
  const params = new URLSearchParams({ ad_reached_countries: '["FR"]', ad_type: "ALL", ad_active_status: "ACTIVE", fields: FIELDS, limit: String(ADS_PAGE_SIZE) })
  if ("pageIds" in query) {
    params.set("search_page_ids", `[${query.pageIds.slice(0, PAGES_PER_CALL).join(",")}]`)
  } else {
    params.set("search_terms", query.terms.slice(0, 100))
    params.set("search_type", "KEYWORD_EXACT_PHRASE")
  }
  const ads: MetaAd[] = []
  let url: string | null = `${META_GRAPH_URL}/ads_archive?${params}`
  for (let page = 0; url && page < ("pageIds" in query ? MAX_PAGES : 1); page++) {
    const read = parseAds(await request(url, deps))
    ads.push(...read.ads)
    url = nextPage(read.next)
  }
  return { ads, more: !!url }
}

/** Meta's link to the next page, on its own host only, without a token it may carry: the header gives it. */
function nextPage(next: string | null): string | null {
  if (!next) return null
  try {
    const u = new URL(next)
    if (u.hostname !== "graph.facebook.com") return null
    u.searchParams.delete("access_token")
    return u.toString()
  } catch {
    return null
  }
}

/** What the worker knows of its token: never the token itself. */
export interface MetaTokenState {
  state: "ok" | "expiring" | "expired" | "invalid" | "identity" | "missing" | "unknown"
  /** When it expires; null for a token that does not, or when unknown. */
  expiresAt: string | null
  checkedAt: string
  print: string | null
  message?: string
}

const debugSchema = z.object({ data: z.object({ is_valid: z.boolean().nullish(), expires_at: z.number().nullish(), error: z.object({ message: z.string().nullish() }).passthrough().nullish() }).passthrough() }).passthrough()

/**
 * Meta's own view of the token (debug_token): valid or not, and until when. It never throws: a check that cannot
 * reach Meta says « unknown », and the reads then tell.
 */
export async function checkToken(deps: MetaAdsDeps, now = new Date()): Promise<MetaTokenState> {
  const token = deps.token?.trim()
  const checkedAt = now.toISOString()
  if (!token) return { state: "missing", expiresAt: null, checkedAt, print: null }
  const print = tokenPrint(token)
  try {
    const parsed = debugSchema.safeParse(await request(`${META_GRAPH_URL}/debug_token?${new URLSearchParams({ input_token: token })}`, deps))
    if (!parsed.success) return { state: "unknown", expiresAt: null, checkedAt, print }
    const d = parsed.data.data
    const expiresAt = d.expires_at ? new Date(d.expires_at * 1000) : null
    if (expiresAt && expiresAt.getTime() <= now.getTime()) return { state: "expired", expiresAt: expiresAt.toISOString(), checkedAt, print }
    if (d.is_valid === false) return { state: "invalid", expiresAt: expiresAt?.toISOString() ?? null, checkedAt, print, message: scrub(d.error?.message ?? "", token).slice(0, 200) || undefined }
    const soon = !!expiresAt && expiresAt.getTime() - now.getTime() <= TOKEN_WARN_DAYS * DAY
    return { state: soon ? "expiring" : "ok", expiresAt: expiresAt?.toISOString() ?? null, checkedAt, print }
  } catch (error) {
    const failure = error instanceof MetaAdsError ? error : null
    if (failure?.kind === "token") return { state: "invalid", expiresAt: null, checkedAt, print, message: failure.message }
    return { state: "unknown", expiresAt: null, checkedAt, print, message: failure?.message }
  }
}
