import { randomBytes, timingSafeEqual } from "node:crypto"
import { lookup } from "node:dns/promises"
import { BlockList, isIP } from "node:net"
import type { McpOAuthClient } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { rateLimit } from "@/lib/rate-limit"
import { generateToken, hashToken } from "@/features/team/rules"
import { CLIENT_AUTH_METHODS, type ClientAuthMethod } from "./metadata"
import { checkRedirectUri, declaredName } from "./redirects"

/**
 * The OAuth clients of the CRM's MCP server (E29 lot 2, D44). Two ways to be one:
 * - a Client ID Metadata Document (CIMD, preferred by the MCP spec, used by Claude, Claude Code and ChatGPT): the
 *   client_id is the URL of the application's own JSON document, read for a signed-in member only and kept an hour;
 * - a Dynamic Client Registration (RFC 7591, deprecated but used by Cursor and VS Code).
 * Either way its callbacks must pass D41, and its secret, if it has one, is stored as a hash.
 */

export type OAuthClient = Pick<McpOAuthClient, "id" | "clientId" | "kind" | "name" | "redirectUris" | "tokenAuthMethod" | "secretHash">

const DAY_MS = 86_400_000
const CIMD_TTL_MS = 3_600_000
/** A document that cannot be read again is used up to a day old. */
const CIMD_STALE_MS = DAY_MS
const CIMD_MAX_BYTES = 10_000
const CIMD_TIMEOUT_MS = 5_000

type OAuthError = { error: string; error_description: string }
const oauthError = (error: string, error_description: string): OAuthError => ({ error, error_description })

// ---------------------------------------------------------------------------------------------------------------------
// Dynamic Client Registration (RFC 7591)

const registrationSchema = z
  .object({
    redirect_uris: z.array(z.string()).min(1).max(10),
    client_name: z.string().max(200).optional(),
    token_endpoint_auth_method: z.string().optional(),
    grant_types: z.array(z.string()).optional(),
    response_types: z.array(z.string()).optional(),
  })
  .passthrough()

export type RegistrationResult = { status: 201; body: Record<string, unknown> } | { status: 400 | 429; body: OAuthError }

/** Registers a client that has no metadata document. Anonymous by nature: limited per address. */
export async function registerClient(raw: unknown, ip: string | null): Promise<RegistrationResult> {
  if (!(await rateLimit("oauth-register", ip, 20, 3600))) return { status: 429, body: oauthError("too_many_requests", "Trop d’enregistrements depuis cette adresse : réessayez dans une heure.") }
  const parsed = registrationSchema.safeParse(raw)
  if (!parsed.success) return { status: 400, body: oauthError("invalid_client_metadata", "Enregistrement invalide : redirect_uris (1 à 10 adresses) est requis.") }
  const m = parsed.data
  for (const uri of m.redirect_uris) {
    const check = checkRedirectUri(uri)
    if (!check.ok) return { status: 400, body: oauthError("invalid_redirect_uri", `${uri} : ${check.reason}`) }
  }
  // RFC 7591 defaults to client_secret_basic; MCP clients that say nothing are public ones, and are told so below.
  const method = (m.token_endpoint_auth_method ?? "none") as ClientAuthMethod
  if (!CLIENT_AUTH_METHODS.includes(method)) return { status: 400, body: oauthError("invalid_client_metadata", "Méthode d’authentification non prise en charge : none, client_secret_basic ou client_secret_post.") }
  const grants = m.grant_types ?? ["authorization_code", "refresh_token"]
  if (!grants.includes("authorization_code") || grants.some((g) => g !== "authorization_code" && g !== "refresh_token")) {
    return { status: 400, body: oauthError("invalid_client_metadata", "Seuls les types authorization_code et refresh_token sont pris en charge.") }
  }
  if (m.response_types?.some((r) => r !== "code")) return { status: 400, body: oauthError("invalid_client_metadata", "Seul le type de réponse code est pris en charge.") }

  const clientId = `cleads-${randomBytes(16).toString("base64url")}`
  const secret = method === "none" ? null : `cleads_ocs_${generateToken()}`
  const row = await prisma.mcpOAuthClient.create({
    data: { clientId, kind: "DCR", name: declaredName(m.client_name), redirectUris: m.redirect_uris, tokenAuthMethod: method, secretHash: secret ? hashToken(secret) : null },
  })
  return {
    status: 201,
    body: {
      client_id: clientId,
      client_id_issued_at: Math.floor(row.createdAt.getTime() / 1000),
      client_name: row.name,
      redirect_uris: row.redirectUris,
      // Refresh tokens are given to every client: a connection lasts while it is used (D43).
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: method,
      ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    },
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Client ID Metadata Documents

/** The network a document is read through: replaced in tests, never anything else. */
export const cimdNetwork = {
  lookup: async (host: string): Promise<string[]> => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address),
  fetch: (url: string, init: RequestInit): Promise<Response> => fetch(url, init),
}

const PRIVATE = new BlockList()
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) PRIVATE.addSubnet(net, prefix, "ipv4")
for (const [net, prefix] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["64:ff9b::", 96], ["100::", 64], ["2001:db8::", 32]] as const) {
  PRIVATE.addSubnet(net, prefix, "ipv6")
}

/** A public unicast address: neither private, loopback, link-local, shared, documentation nor multicast. */
export function isPublicAddress(address: string): boolean {
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1] ?? address
  const family = isIP(v4)
  return family !== 0 && !PRIVATE.check(v4, family === 4 ? "ipv4" : "ipv6")
}

/** A client_id that is a document's URL. */
export const isDocumentClientId = (clientId: string) => /^https:\/\//i.test(clientId)

/** The document's address, or why Cleads will not read it: https on the standard port, a domain, a path. */
export function checkDocumentUrl(clientId: string): URL | string {
  let u: URL
  try {
    u = new URL(clientId)
  } catch {
    return "Identifiant d’application invalide."
  }
  if (clientId.length > 2000 || u.protocol !== "https:" || u.username || u.password || u.hash || (u.port && u.port !== "443") || u.pathname === "/") {
    return "Identifiant d’application invalide : une adresse https avec un chemin est attendue."
  }
  if (isIP(u.hostname.replace(/^\[|\]$/g, "")) || !u.hostname.includes(".")) return "Identifiant d’application invalide : un nom de domaine est attendu."
  return u
}

const documentSchema = z
  .object({
    client_id: z.string(),
    client_name: z.string().max(200).optional(),
    redirect_uris: z.array(z.string().max(2000)).min(1).max(20),
    token_endpoint_auth_method: z.string().optional(),
    token_endpoint_auth_methods_supported: z.array(z.string()).optional(),
  })
  .passthrough()

/** A document read, checked: it names itself by its own URL, lists its callbacks, and can act as a public client. */
export function parseClientDocument(url: string, text: string): { name: string; redirectUris: string[] } | { error: string } {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { error: "Le document de l’application n’est pas lisible." }
  }
  const d = documentSchema.safeParse(json)
  if (!d.success) return { error: "Le document de l’application est incomplet (client_id, redirect_uris)." }
  if (d.data.client_id !== url) return { error: "Le document de l’application ne porte pas sa propre adresse." }
  const methods = new Set([...(d.data.token_endpoint_auth_methods_supported ?? []), ...(d.data.token_endpoint_auth_method ? [d.data.token_endpoint_auth_method] : [])])
  if (methods.size && !methods.has("none")) return { error: "Cette application s’authentifie d’une façon que Cleads ne prend pas en charge." }
  return { name: declaredName(d.data.client_name ?? new URL(url).hostname), redirectUris: d.data.redirect_uris }
}

async function readCapped(res: Response, max: number): Promise<string | null> {
  if (!res.body) return ""
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

/** Reads a document: public addresses only, no redirect followed, 5 seconds and 10 kB at most. */
async function fetchDocument(url: URL): Promise<{ name: string; redirectUris: string[] } | { error: string }> {
  try {
    const addresses = await cimdNetwork.lookup(url.hostname)
    if (!addresses.length || !addresses.every(isPublicAddress)) return { error: "Le document de l’application n’est pas sur une adresse publique." }
    const res = await cimdNetwork.fetch(url.href, { redirect: "manual", signal: AbortSignal.timeout(CIMD_TIMEOUT_MS), headers: { accept: "application/json" } })
    if (res.status !== 200) return { error: `Le document de l’application est indisponible (HTTP ${res.status}).` }
    if (Number(res.headers.get("content-length") ?? 0) > CIMD_MAX_BYTES) return { error: "Le document de l’application est trop long." }
    const text = await readCapped(res, CIMD_MAX_BYTES)
    return text === null ? { error: "Le document de l’application est trop long." } : parseClientDocument(url.href, text)
  } catch {
    return { error: "Le document de l’application est injoignable." }
  }
}

/** A document client, from the cache when it is fresh; read again otherwise, the stale copy kept if that fails. */
async function documentClient(clientId: string, actorId: string, now = Date.now()): Promise<OAuthClient | { error: string }> {
  const url = checkDocumentUrl(clientId)
  if (typeof url === "string") return { error: url }
  const cached = await prisma.mcpOAuthClient.findUnique({ where: { clientId } })
  if (cached && cached.kind !== "CIMD") return { error: "Application inconnue." }
  const age = cached?.fetchedAt ? now - cached.fetchedAt.getTime() : Infinity
  if (cached && age < CIMD_TTL_MS) return cached
  const usable = cached && age < CIMD_STALE_MS ? cached : null
  if (!(await rateLimit("oauth-cimd", actorId, 30, 3600))) return usable ?? { error: "Trop de demandes de connexion : réessayez dans une heure." }
  const doc = await fetchDocument(url)
  if ("error" in doc) return usable ?? doc
  const data = { name: doc.name, redirectUris: doc.redirectUris, fetchedAt: new Date(now) }
  return prisma.mcpOAuthClient.upsert({ where: { clientId }, create: { clientId, kind: "CIMD", tokenAuthMethod: "none", ...data }, update: data })
}

/** The client of an authorization request, for a signed-in member: its document read (or cached), or its registration. */
export async function clientForAuthorization(clientId: string, actorId: string): Promise<OAuthClient | { error: string }> {
  if (!clientId || clientId.length > 2000) return { error: "Application inconnue." }
  if (isDocumentClientId(clientId)) return documentClient(clientId, actorId)
  const row = await prisma.mcpOAuthClient.findUnique({ where: { clientId } })
  return row?.kind === "DCR" ? row : { error: "Application inconnue : reconnectez-la depuis l’application, qui s’enregistrera de nouveau." }
}

// ---------------------------------------------------------------------------------------------------------------------
// Client authentication at the token and revocation endpoints (RFC 6749 §2.3)

export type ClientAuthFailure = { error: "invalid_client" | "invalid_request"; description: string; basic: boolean }

const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
const formDecode = (s: string) => {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "))
  } catch {
    return null
  }
}

/** Who calls the token endpoint: a public client by its client_id, a confidential one by its secret (Basic or body). */
export async function authenticateClient(headers: Headers, form: URLSearchParams): Promise<{ client: OAuthClient } | ClientAuthFailure> {
  const basic = /^Basic\s+(\S+)\s*$/i.exec(headers.get("authorization") ?? "")
  let id = form.get("client_id")
  let secret = form.get("client_secret")
  if (basic) {
    const decoded = Buffer.from(basic[1], "base64").toString("utf8")
    const colon = decoded.indexOf(":")
    const bid = colon > 0 ? formDecode(decoded.slice(0, colon)) : null
    if (!bid) return { error: "invalid_client", description: "Authentification de l’application illisible.", basic: true }
    if (id && id !== bid) return { error: "invalid_request", description: "Deux identifiants d’application différents.", basic: true }
    id = bid
    secret = formDecode(decoded.slice(colon + 1)) || null
  }
  if (!id) return { error: "invalid_client", description: "client_id manquant.", basic: !!basic }
  const client = await prisma.mcpOAuthClient.findUnique({ where: { clientId: id } })
  if (!client) return { error: "invalid_client", description: "Application inconnue.", basic: !!basic }
  // A public client proves nothing here: PKCE and the rotation of its refresh token protect it.
  if (client.tokenAuthMethod !== "none" && (!secret || !client.secretHash || !sameHash(hashToken(secret), client.secretHash))) {
    return { error: "invalid_client", description: "Authentification de l’application refusée.", basic: !!basic }
  }
  return { client }
}

/** The client was used: at most once a minute. Never throws. */
export async function touchClient(id: string, now = new Date()): Promise<void> {
  await prisma.mcpOAuthClient
    .updateMany({ where: { id, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: new Date(now.getTime() - 60_000) } }] }, data: { lastUsedAt: now } })
    .catch(() => undefined)
}

/** Housekeeping, on a fraction of token requests: expired codes and access tokens, clients nobody connected for 30 days. */
export async function purgeOAuth(now = Date.now()): Promise<void> {
  const before = (ms: number) => new Date(now - ms)
  await prisma.mcpAccessToken.deleteMany({ where: { expiresAt: { lt: before(DAY_MS) } } })
  await prisma.mcpOAuthCode.deleteMany({ where: { expiresAt: { lt: before(DAY_MS) } } })
  await prisma.mcpOAuthClient.deleteMany({ where: { createdAt: { lt: before(30 * DAY_MS) }, tokens: { none: {} }, codes: { none: {} } } })
}
