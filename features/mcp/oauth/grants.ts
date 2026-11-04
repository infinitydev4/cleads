import { createHash, timingSafeEqual } from "node:crypto"
import type { Role } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import { toCrmRole } from "@/lib/crm/roles"
import { generateToken, hashToken } from "@/features/team/rules"
import { ACCESS_PREFIX, REFRESH_PREFIX } from "../names"
import { closeToken } from "../tokens"
import { purgeOAuth, touchClient, type OAuthClient } from "./clients"
import { grantedScope, isOurResource } from "./metadata"
import { appOf } from "./redirects"

/**
 * The token endpoint's grants (E29 lot 2, D43). A code becomes a connection: an McpToken in the application's name, with
 * an access token of one hour and a refresh token that turns at each use. A connection that serves stays open; ninety
 * days without use close it. Everything secret is kept as a hash only.
 */

export const ACCESS_TTL_S = 3600
export const CONNECTION_DAYS = 90
export const CODE_TTL_MS = 5 * 60_000
/** Two refreshes of the same client at once: the late one is refused without closing anything. */
export const REUSE_GRACE_MS = 30_000
export const MAX_CONNECTIONS = 10

const DAY_MS = 86_400_000

export interface TokenResponse {
  access_token: string
  token_type: "Bearer"
  expires_in: number
  refresh_token: string
  scope: string
}

export interface TokenError {
  error: "invalid_grant" | "invalid_request" | "invalid_target"
  error_description: string
}

const grantError = (error_description: string): TokenError => ({ error: "invalid_grant", error_description })
const OTHER_RESOURCE: TokenError = { error: "invalid_target", error_description: "Cette ressource n’est pas le serveur MCP de Cleads." }

/** PKCE S256 (RFC 7636 §4.6): the verifier's SHA-256, in base64url, is the challenge given at authorization. */
export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false
  const computed = Buffer.from(createHash("sha256").update(verifier).digest("base64url"))
  const expected = Buffer.from(challenge)
  return computed.length === expected.length && timingSafeEqual(computed, expected)
}

/** The member behind a code or a connection can still use the CRM, in the same workspace. */
const memberActive = (u: { active: boolean; role: Role; workspaceId: string | null }, workspaceId: string) => u.active && !!toCrmRole(u.role) && u.workspaceId === workspaceId

/** A new access token for a connection, valid one hour. */
async function issueAccess(tokenId: string, now: Date): Promise<string> {
  const secret = `${ACCESS_PREFIX}${generateToken()}`
  await prisma.mcpAccessToken.create({ data: { tokenId, hash: hashToken(secret), expiresAt: new Date(now.getTime() + ACCESS_TTL_S * 1000) } })
  return secret
}

const ACTIVE_CONNECTION = (userId: string, now: Date) => ({ userId, oauthClientId: { not: null }, revokedAt: null, expiresAt: { gt: now } })
const LEAST_USED = [{ lastUsedAt: { sort: "asc" as const, nulls: "first" as const } }, { createdAt: "asc" as const }]

/** The connection a new one would close, when the member already has ten: the least used. Said on the consent screen. */
export async function connectionToClose(userId: string, now = new Date()): Promise<{ id: string; name: string; lastUsedAt: Date | null } | null> {
  const active = await prisma.mcpToken.findMany({ where: ACTIVE_CONNECTION(userId, now), select: { id: true, name: true, lastUsedAt: true }, orderBy: LEAST_USED })
  return active.length >= MAX_CONNECTIONS ? active[0] : null
}

/** Keeps a member within ten open connections, closing the least used ones but the new one. */
async function keepWithinLimit(userId: string, workspaceId: string, keepId: string, now: Date): Promise<void> {
  const active = await prisma.mcpToken.findMany({ where: ACTIVE_CONNECTION(userId, now), select: { id: true, name: true }, orderBy: LEAST_USED })
  const extra = active.filter((t) => t.id !== keepId).slice(0, Math.max(0, active.length - MAX_CONNECTIONS))
  for (const t of extra) {
    if (await closeToken(t.id, workspaceId, null, "Connexion MCP fermée : une nouvelle l’a remplacée", now)) {
      await audit({ action: "mcp.token_revoked", actorKind: "SYSTEM", workspaceId, entityType: "McpToken", entityId: t.id, metadata: { name: t.name, ownerId: userId, kind: "connection", reason: "limit" } })
    }
  }
}

/** `authorization_code`: the code the member's « Autoriser » gave, once, to the client it was given to (OAuth 2.1 §4.1.3). */
export async function exchangeCode(client: OAuthClient, form: URLSearchParams, now = new Date()): Promise<TokenResponse | TokenError> {
  const code = form.get("code")
  const verifier = form.get("code_verifier")
  const redirectUri = form.get("redirect_uri")
  const resource = form.get("resource")
  if (!code || !verifier) return { error: "invalid_request", error_description: "code et code_verifier sont requis." }
  if (resource && !isOurResource(resource)) return OTHER_RESOURCE
  const row = await prisma.mcpOAuthCode.findUnique({ where: { codeHash: hashToken(code) }, include: { user: { select: { active: true, role: true, workspaceId: true } } } })
  if (!row || row.oauthClientId !== client.id) return grantError("Code d’autorisation inconnu.")
  // Whoever presents it first takes it. Presented again, it closes the connection it opened: it has leaked.
  const taken = await prisma.mcpOAuthCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } })
  if (taken.count !== 1) {
    if (row.tokenId && (await closeToken(row.tokenId, row.workspaceId, null, "Connexion MCP fermée : code rejoué", now))) {
      await audit({ action: "mcp.token_revoked", actorKind: "SYSTEM", workspaceId: row.workspaceId, entityType: "McpToken", entityId: row.tokenId, metadata: { ownerId: row.userId, kind: "connection", reason: "code_replayed" } })
    }
    return grantError("Code d’autorisation déjà utilisé : la connexion qu’il avait ouverte est fermée.")
  }
  if (row.expiresAt <= now) return grantError("Code d’autorisation expiré : relancez la connexion depuis l’application.")
  if (redirectUri !== null && redirectUri !== row.redirectUri) return grantError("redirect_uri différente de celle de la demande.")
  if (!pkceMatches(verifier, row.codeChallenge)) return grantError("code_verifier ne correspond pas à la demande (PKCE).")
  if (!memberActive(row.user, row.workspaceId)) return grantError("Ce compte n’a plus accès au CRM.")

  const refresh = `${REFRESH_PREFIX}${generateToken()}`
  const connection = await prisma.mcpToken.create({
    data: {
      workspaceId: row.workspaceId,
      userId: row.userId,
      name: appOf(client, row.redirectUri).name,
      tokenHash: hashToken(refresh),
      hint: "",
      readOnly: row.readOnly,
      expiresAt: new Date(now.getTime() + CONNECTION_DAYS * DAY_MS),
      oauthClientId: client.id,
      redirectUri: row.redirectUri,
      resource: row.resource,
    },
    select: { id: true },
  })
  await prisma.mcpOAuthCode.update({ where: { id: row.id }, data: { tokenId: connection.id } })
  await keepWithinLimit(row.userId, row.workspaceId, connection.id, now)
  const access = await issueAccess(connection.id, now)
  await touchClient(client.id, now)
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: grantedScope(row.readOnly) }
}

/**
 * `refresh_token`: a new pair, the refresh token turned (OAuth 2.1 §4.3.1, required for public clients) and the
 * connection kept 90 more days. The access tokens already given stay valid until their hour ends, so a call under way
 * survives. The previous refresh token presented again means someone else holds it: the connection is closed.
 */
export async function refreshConnection(client: OAuthClient, form: URLSearchParams, now = new Date()): Promise<TokenResponse | TokenError> {
  const presented = form.get("refresh_token")
  const resource = form.get("resource")
  if (!presented) return { error: "invalid_request", error_description: "refresh_token est requis." }
  if (resource && !isOurResource(resource)) return OTHER_RESOURCE
  if (!presented.startsWith(REFRESH_PREFIX) || presented.length > 120) return grantError("Jeton de rafraîchissement invalide.")
  const hash = hashToken(presented)
  const t = await prisma.mcpToken.findUnique({
    where: { tokenHash: hash },
    select: { id: true, workspaceId: true, readOnly: true, expiresAt: true, revokedAt: true, oauthClientId: true, user: { select: { active: true, role: true, workspaceId: true } } },
  })
  if (!t || t.oauthClientId !== client.id) {
    const reused = await prisma.mcpToken.findUnique({ where: { previousHash: hash }, select: { id: true, workspaceId: true, userId: true, name: true, rotatedAt: true, oauthClientId: true } })
    if (!reused || reused.oauthClientId !== client.id) return grantError("Jeton de rafraîchissement invalide.")
    if (reused.rotatedAt && now.getTime() - reused.rotatedAt.getTime() < REUSE_GRACE_MS) return grantError("Jeton de rafraîchissement déjà renouvelé.")
    if (await closeToken(reused.id, reused.workspaceId, null, "Connexion MCP fermée : jeton de rafraîchissement réutilisé", now)) {
      await audit({ action: "mcp.oauth_refresh_reused", actorKind: "SYSTEM", workspaceId: reused.workspaceId, entityType: "McpToken", entityId: reused.id, metadata: { name: reused.name, ownerId: reused.userId } })
    }
    return grantError("Jeton de rafraîchissement déjà utilisé : la connexion est fermée par sécurité. Reconnectez l’application.")
  }
  if (t.revokedAt) return grantError("Cette connexion a été fermée : reconnectez l’application à Cleads.")
  if (t.expiresAt <= now) return grantError("Cette connexion a expiré après 90 jours sans usage : reconnectez l’application à Cleads.")
  if (!memberActive(t.user, t.workspaceId)) return grantError("Ce compte n’a plus accès au CRM.")
  const next = `${REFRESH_PREFIX}${generateToken()}`
  const turned = await prisma.mcpToken.updateMany({
    where: { id: t.id, tokenHash: hash, revokedAt: null },
    data: { tokenHash: hashToken(next), previousHash: hash, rotatedAt: now, expiresAt: new Date(now.getTime() + CONNECTION_DAYS * DAY_MS) },
  })
  if (turned.count !== 1) return grantError("Jeton de rafraîchissement déjà renouvelé.")
  const access = await issueAccess(t.id, now)
  await touchClient(client.id, now)
  if (Math.random() < 0.01) await purgeOAuth(now.getTime()).catch(() => undefined)
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: next, scope: grantedScope(t.readOnly) }
}

/** RFC 7009: an access or refresh token of one of the client's connections closes that connection. Unknown: nothing. */
export async function revokePresented(client: OAuthClient, presented: string | null, now = new Date()): Promise<void> {
  if (!presented || presented.length > 120) return
  const hash = hashToken(presented)
  const select = { id: true, workspaceId: true, userId: true, name: true, oauthClientId: true }
  const t = presented.startsWith(ACCESS_PREFIX)
    ? ((await prisma.mcpAccessToken.findUnique({ where: { hash }, select: { token: { select } } }))?.token ?? null)
    : presented.startsWith(REFRESH_PREFIX)
      ? await prisma.mcpToken.findFirst({ where: { OR: [{ tokenHash: hash }, { previousHash: hash }] }, select })
      : null
  if (!t || t.oauthClientId !== client.id) return
  if (await closeToken(t.id, t.workspaceId, null, "Connexion MCP fermée par l’application", now)) {
    await audit({ action: "mcp.token_revoked", actorKind: "SYSTEM", workspaceId: t.workspaceId, entityType: "McpToken", entityId: t.id, metadata: { name: t.name, ownerId: t.userId, kind: "connection", reason: "client" } })
  }
}
