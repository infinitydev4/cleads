import dns from "node:dns"
import http from "node:http"
import https from "node:https"
import net from "node:net"
import zlib from "node:zlib"
import type { Readable } from "node:stream"

/**
 * Fetching a prospect's website safely (docs/crm-v1/AGENTS-IA.md §9 and §19). The audit visits addresses that come
 * from outside the CRM, from a server that also reaches private services (the Extractor, its database, the host): every
 * connection, redirects included, goes to public addresses only, on ports 80 and 443, within size and time limits, and
 * under a name that says who we are.
 */
export const BOT_USER_AGENT = "Mozilla/5.0 (compatible; CleadsAuditBot/1.0; +https://cleads.fr/robot)"
export const BOT_TOKEN = "cleadsauditbot"

export const FETCH_LIMITS = { maxBytes: 2_000_000, timeoutMs: 10_000, maxRedirects: 5 } as const

export type FetchFailure = "address" | "protocol" | "port" | "redirects" | "timeout" | "tls" | "dns" | "network"

export class FetchRefused extends Error {
  constructor(
    public readonly reason: FetchFailure,
    message: string
  ) {
    super(message)
  }
}

// ── Addresses ────────────────────────────────────────────────────────────────────────────────────────────────────

const v4ToInt = (ip: string) => ip.split(".").reduce((n, part) => (n << 8) + Number(part), 0) >>> 0
const inV4 = (ip: number, base: string, bits: number) => (bits === 0 ? true : (ip >>> (32 - bits)) === (v4ToInt(base) >>> (32 - bits)))

const PRIVATE_V4: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]

function isPublicV4(ip: string): boolean {
  const n = v4ToInt(ip)
  return !PRIVATE_V4.some(([base, bits]) => inV4(n, base, bits))
}

/** The 8 groups of an IPv6 address, an embedded IPv4 tail included; null when it is not one. */
function v6Groups(ip: string): number[] | null {
  let text = ip.toLowerCase().split("%")[0]
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(text)
  if (tail) {
    if (!net.isIPv4(tail[1])) return null
    const n = v4ToInt(tail[1])
    text = text.slice(0, -tail[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`
  }
  const halves = text.split("::")
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(":") : []
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : []
  const missing = 8 - head.length - rest.length
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...rest].map((g) => parseInt(g, 16))
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null
}

function isPublicV6(ip: string): boolean {
  const g = v6Groups(ip)
  if (!g) return false
  const v4Of = (hi: number, lo: number) => `${hi >>> 8}.${hi & 0xff}.${lo >>> 8}.${lo & 0xff}`
  // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::a.b.c.d): judged by the IPv4 address inside.
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return isPublicV4(v4Of(g[6], g[7]))
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isPublicV4(v4Of(g[6], g[7]))
  if (g.every((x) => x === 0) || (g.slice(0, 7).every((x) => x === 0) && g[7] === 1)) return false // :: and ::1
  if ((g[0] & 0xe000) !== 0x2000) return false // outside 2000::/3: ULA, link-local, multicast, reserved
  if (g[0] === 0x2001 && g[1] < 0x0200) return false // 2001::/23, IETF protocols (Teredo included)
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false // documentation
  if (g[0] === 0x2002) return false // 6to4: the IPv4 inside could be anything
  return true
}

/** Public unicast addresses only: no private, local, link-local, shared, reserved, documentation or multicast range. */
export function isPublicAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isPublicV4(ip)
  if (net.isIPv6(ip)) return isPublicV6(ip)
  return false
}

// ── Fetch ────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface FetchOptions {
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
  /** Do not read the body (robots.txt existence, llms.txt…): only the status. */
  headOnly?: boolean
  /** Tests only: a local server on any port. Never set in the application. */
  unsafeTestOverrides?: { allowAddress?: (ip: string) => boolean; allowPort?: (port: number) => boolean; resolve?: (host: string) => Promise<string[]> }
}

export interface FetchResult {
  url: string
  finalUrl: string
  status: number
  /** Each address the request went through before the final one. */
  redirects: string[]
  contentType: string | null
  body: string | null
  /** Bytes read, after decompression. */
  bytes: number
  truncated: boolean
  timeMs: number
}

const TEXT_TYPE = /^(text\/|application\/(xhtml\+xml|xml|json|ld\+json|rss\+xml|atom\+xml))/i

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void

/** A DNS lookup that only ever hands public addresses to the socket: checked at connection time, so no rebinding. */
function guardedLookup(opts: FetchOptions) {
  const allow = opts.unsafeTestOverrides?.allowAddress ?? isPublicAddress
  const resolve = opts.unsafeTestOverrides?.resolve ?? (async (host: string) => (await dns.promises.lookup(host, { all: true, verbatim: true })).map((a) => a.address))
  return (hostname: string, options: dns.LookupOptions, callback: LookupCallback) => {
    resolve(hostname)
      .then((addresses) => {
        if (!addresses.length) throw Object.assign(new Error(`Aucune adresse pour ${hostname}`), { code: "ENOTFOUND" })
        if (addresses.some((a) => !allow(a))) throw Object.assign(new Error(`${hostname} pointe vers une adresse privée ou réservée`), { code: "EADDRREFUSED" })
        const list = addresses.map((address) => ({ address, family: net.isIPv6(address) ? 6 : 4 }))
        if (options.all) callback(null, list)
        else callback(null, list[0].address, list[0].family)
      })
      .catch((error: NodeJS.ErrnoException) => callback(error, ""))
  }
}

function checkUrl(raw: string, opts: FetchOptions): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new FetchRefused("protocol", `Adresse invalide : ${raw.slice(0, 200)}`)
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new FetchRefused("protocol", `Protocole refusé : ${url.protocol}`)
  if (url.username || url.password) throw new FetchRefused("protocol", "Adresse avec identifiants refusée")
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80
  const allowPort = opts.unsafeTestOverrides?.allowPort ?? ((p: number) => p === 80 || p === 443)
  if (!allowPort(port)) throw new FetchRefused("port", `Port refusé : ${port}`)
  // An address written as an IP never goes through DNS: it is checked here.
  const host = url.hostname.replace(/^\[|\]$/g, "")
  const allow = opts.unsafeTestOverrides?.allowAddress ?? isPublicAddress
  if (net.isIP(host) && !allow(host)) throw new FetchRefused("address", `Adresse privée ou réservée refusée : ${host}`)
  return url
}

function decoderFor(contentType: string | null): TextDecoder {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType ?? "")?.[1]?.toLowerCase()
  try {
    return new TextDecoder(charset && charset !== "utf8" ? charset : "utf-8")
  } catch {
    return new TextDecoder("utf-8")
  }
}

function decompress(res: http.IncomingMessage): Readable {
  switch ((res.headers["content-encoding"] ?? "").toLowerCase()) {
    case "gzip":
    case "x-gzip":
      return res.pipe(zlib.createGunzip())
    case "deflate":
      return res.pipe(zlib.createInflate())
    case "br":
      return res.pipe(zlib.createBrotliDecompress())
    default:
      return res
  }
}

const failureOf = (error: NodeJS.ErrnoException): FetchRefused => {
  const code = error.code ?? ""
  if (code === "EADDRREFUSED") return new FetchRefused("address", error.message)
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "ENODATA") return new FetchRefused("dns", "Nom de domaine introuvable")
  if (/CERT|SSL|TLS|ERR_TLS/i.test(code) || /certificate/i.test(error.message)) return new FetchRefused("tls", `Certificat HTTPS invalide (${code || "TLS"})`)
  if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT") return new FetchRefused("timeout", "Le site n'a pas répondu à temps")
  return new FetchRefused("network", `Connexion impossible (${code || error.message.slice(0, 80)})`)
}

function once(url: URL, opts: FetchOptions, deadline: number): Promise<{ status: number; location: string | null; contentType: string | null; body: string | null; bytes: number; truncated: boolean }> {
  const maxBytes = opts.maxBytes ?? FETCH_LIMITS.maxBytes
  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now()
    if (remaining <= 0) return reject(new FetchRefused("timeout", "Le site n'a pas répondu à temps"))
    const client = url.protocol === "https:" ? https : http
    const req = client.request(url, {
      method: "GET",
      agent: false,
      lookup: guardedLookup(opts) as unknown as typeof dns.lookup,
      headers: { "User-Agent": BOT_USER_AGENT, Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5", "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.5", "Accept-Encoding": "gzip, deflate, br" },
    })
    const timer = setTimeout(() => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })), remaining)
    req.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      reject(error instanceof FetchRefused ? error : failureOf(error))
    })
    req.on("response", (res) => {
      const status = res.statusCode ?? 0
      const contentType = (res.headers["content-type"] as string | undefined) ?? null
      const location = status >= 300 && status < 400 ? ((res.headers.location as string | undefined) ?? null) : null
      if (location || opts.headOnly || !(status >= 200 && status < 300) || (contentType && !TEXT_TYPE.test(contentType))) {
        clearTimeout(timer)
        res.resume()
        req.destroy()
        return resolve({ status, location, contentType, body: null, bytes: 0, truncated: false })
      }
      const stream = decompress(res)
      const chunks: Buffer[] = []
      let bytes = 0
      let truncated = false
      const finish = () => {
        clearTimeout(timer)
        const buffer = Buffer.concat(chunks)
        resolve({ status, location: null, contentType, body: decoderFor(contentType).decode(buffer), bytes: buffer.length, truncated })
      }
      stream.on("data", (chunk: Buffer) => {
        if (truncated) return
        if (bytes + chunk.length > maxBytes) {
          chunks.push(chunk.subarray(0, maxBytes - bytes))
          bytes = maxBytes
          truncated = true
          req.destroy()
          finish()
          return
        }
        chunks.push(chunk)
        bytes += chunk.length
      })
      stream.on("end", () => !truncated && finish())
      stream.on("error", (error: NodeJS.ErrnoException) => {
        if (truncated) return
        clearTimeout(timer)
        reject(failureOf(error))
      })
    })
    req.end()
  })
}

/** GET a public page: follows up to 5 redirects, each checked again; reads at most 2 MB of text within 10 seconds. */
export async function safeFetch(raw: string, opts: FetchOptions = {}): Promise<FetchResult> {
  const started = Date.now()
  const deadline = started + (opts.timeoutMs ?? FETCH_LIMITS.timeoutMs)
  const redirects: string[] = []
  let url = checkUrl(raw, opts)
  for (;;) {
    const res = await once(url, opts, deadline)
    if (res.location) {
      if (redirects.length >= (opts.maxRedirects ?? FETCH_LIMITS.maxRedirects)) throw new FetchRefused("redirects", "Trop de redirections")
      redirects.push(url.toString())
      url = checkUrl(new URL(res.location, url).toString(), opts)
      continue
    }
    return { url: raw, finalUrl: url.toString(), status: res.status, redirects, contentType: res.contentType, body: res.body, bytes: res.bytes, truncated: res.truncated, timeMs: Date.now() - started }
  }
}

/** "https://www.Example.fr/page" → "example.fr". */
export function hostOf(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase().replace(/^www\./, "") || null
  } catch {
    return null
  }
}

/** The address of a website as people write it ("monsite.fr", "http://…") made absolute; null when it is not one. */
export function siteUrl(raw: string | null | undefined): string | null {
  const text = raw?.trim()
  if (!text) return null
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}
