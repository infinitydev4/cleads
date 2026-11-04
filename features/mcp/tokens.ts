import type { Prisma } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { toCrmRole } from "@/lib/crm/roles"
import { can } from "@/lib/rbac"
import { LeadError } from "@/features/leads/errors"
import { generateToken, hashToken } from "@/features/team/rules"
import { ACCESS_PREFIX, MCP_ACTION, TOKEN_PREFIX, clientName } from "./names"
import { isOurResource } from "./oauth/metadata"
import { appOf, type AppIdentity } from "./oauth/redirects"

/**
 * The accesses to the CRM's MCP server (E29): a member's personal tokens (D36), made for a script or a tool without
 * OAuth, and their OAuth connections (lot 2, D44), opened by clicking « Autoriser » for Claude, ChatGPT, Claude Code…
 * Either stands for its member and nothing more: their role is read again at every request, and a deactivated account,
 * an expired or revoked access, or MCP switched off in the workspace stops it at once. Only hashes are stored.
 */

export { TOKEN_PREFIX }
export const MAX_ACTIVE_TOKENS = 10
/** The last use is written at most this often, not at every call. */
const TOUCH_MS = 60_000

const DAY_MS = 86_400_000

export const createTokenSchema = z
  .object({
    name: z.string().trim().min(2, "Un nom de 2 caractères au moins").max(60, "60 caractères au plus"),
    readOnly: z.boolean().default(true),
    // TOKEN_DAYS (features/mcp/names.ts): there is no token without an end.
    days: z.union([z.literal(30), z.literal(90), z.literal(365)]).default(90),
  })
  .strict()
export type CreateTokenInput = z.input<typeof createTokenSchema>

export type TokenStatus = "active" | "expired" | "revoked"

export interface McpTokenView {
  id: string
  /** A personal token, or an OAuth connection (its name is then the application's). */
  kind: "token" | "connection"
  name: string
  /** The first characters of the secret, to recognise it: cleads_mcp_ab12cd… Empty for a connection. */
  hint: string
  /** A connection's application: verified or as it names itself, and where its code went back. */
  app: AppIdentity | null
  readOnly: boolean
  status: TokenStatus
  expiresAt: string
  revokedAt: string | null
  lastUsedAt: string | null
  lastClient: string | null
  createdAt: string
  /** Shown to the owner in the team's list. */
  owner: { id: string; name: string } | null
  canRevoke: boolean
}

const statusOf = (t: { revokedAt: Date | null; expiresAt: Date }, now = new Date()): TokenStatus => (t.revokedAt ? "revoked" : t.expiresAt <= now ? "expired" : "active")
const isOwner = (u: CurrentUser) => can(u.role, "ai:manage")

const select = {
  id: true,
  name: true,
  hint: true,
  readOnly: true,
  expiresAt: true,
  revokedAt: true,
  lastUsedAt: true,
  lastClient: true,
  createdAt: true,
  userId: true,
  redirectUri: true,
  user: { select: { name: true, email: true } },
  oauthClient: { select: { kind: true, clientId: true, name: true } },
} satisfies Prisma.McpTokenSelect
type Row = Prisma.McpTokenGetPayload<{ select: typeof select }>

function toView(t: Row, actor: CurrentUser, withOwner: boolean): McpTokenView {
  const status = statusOf(t)
  const app = t.oauthClient ? appOf(t.oauthClient, t.redirectUri) : null
  return {
    id: t.id,
    kind: app ? "connection" : "token",
    name: t.name,
    hint: app ? "" : `${TOKEN_PREFIX}${t.hint}…`,
    app,
    readOnly: t.readOnly,
    status,
    expiresAt: t.expiresAt.toISOString(),
    revokedAt: t.revokedAt?.toISOString() ?? null,
    lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
    lastClient: t.lastClient,
    createdAt: t.createdAt.toISOString(),
    owner: withOwner ? { id: t.userId, name: t.user.name ?? t.user.email ?? "Membre" } : null,
    canRevoke: status === "active" && (t.userId === actor.id || isOwner(actor)),
  }
}

/** A new secret: the prefix says what it is (and lets secret scanners spot it), 256 random bits follow. */
export function newSecret(): { secret: string; hash: string; hint: string } {
  const secret = `${TOKEN_PREFIX}${generateToken()}`
  return { secret, hash: hashToken(secret), hint: secret.slice(TOKEN_PREFIX.length, TOKEN_PREFIX.length + 6) }
}

async function mcpEnabled(workspaceId: string): Promise<boolean> {
  return !!(await prisma.aiSetting.findUnique({ where: { workspaceId }, select: { mcpEnabled: true } }))?.mcpEnabled
}

/** Creates a token for the member who asks. The secret is returned once and never stored. */
export async function createToken(actor: CurrentUser, raw: CreateTokenInput, ip?: string | null): Promise<{ token: McpTokenView; secret: string }> {
  if (!can(actor.role, "ai:use")) throw new LeadError("forbidden", "Votre rôle ne permet pas d'ouvrir un accès MCP.", 403)
  if (!(await mcpEnabled(actor.workspaceId))) throw new LeadError("conflict", "L'accès MCP est coupé dans cet espace : le propriétaire l'active dans Réglages › Accès MCP.", 409)
  const input = createTokenSchema.parse(raw)
  const now = new Date()
  const active = await prisma.mcpToken.count({ where: { userId: actor.id, oauthClientId: null, revokedAt: null, expiresAt: { gt: now } } })
  if (active >= MAX_ACTIVE_TOKENS) throw new LeadError("conflict", `${MAX_ACTIVE_TOKENS} jetons actifs au plus : révoquez-en un d'abord.`, 409)
  const { secret, hash, hint } = newSecret()
  const row = await prisma.mcpToken.create({
    data: { workspaceId: actor.workspaceId, userId: actor.id, name: input.name, tokenHash: hash, hint, readOnly: input.readOnly, expiresAt: new Date(now.getTime() + input.days * DAY_MS) },
    select,
  })
  await audit({ action: "mcp.token_created", actorId: actor.id, workspaceId: actor.workspaceId, entityType: "McpToken", entityId: row.id, metadata: { name: input.name, readOnly: input.readOnly, days: input.days }, ip })
  return { token: toView(row, actor, false), secret }
}

/** One's own tokens and connections; with `team`, the owner sees every member's. Newest first, the closed ones of 30 days. */
export async function listTokens(actor: CurrentUser, opts: { team?: boolean } = {}): Promise<McpTokenView[]> {
  if (!can(actor.role, "ai:use")) throw new LeadError("forbidden", "Accès refusé", 403)
  const team = !!opts.team && isOwner(actor)
  const since = new Date(Date.now() - 30 * DAY_MS)
  const rows = await prisma.mcpToken.findMany({
    where: {
      workspaceId: actor.workspaceId,
      ...(team ? {} : { userId: actor.id }),
      OR: [{ revokedAt: null, expiresAt: { gt: since } }, { revokedAt: { gt: since } }],
    },
    select,
    orderBy: { createdAt: "desc" },
    take: 100,
  })
  return rows.map((t) => toView(t, actor, team))
}

/**
 * Closes a token or a connection, once: what it left waiting in « À valider » is refused with it, since an access closed
 * because it leaked must not leave its requests behind. `actorId` is null when Cleads closes it (stolen refresh token,
 * replayed code, the connections' limit). Returns whether it was still open.
 */
export async function closeToken(tokenId: string, workspaceId: string, actorId: string | null, note: string, now = new Date()): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const closed = await tx.mcpToken.updateMany({ where: { id: tokenId, workspaceId, revokedAt: null }, data: { revokedAt: now, revokedById: actorId } })
    if (closed.count !== 1) return false
    const waiting = await tx.agentRun.findMany({
      where: { workspaceId, status: "WAITING_APPROVAL", input: { path: ["tokenId"], equals: tokenId } },
      select: { id: true, input: true },
    })
    const runIds = waiting.filter((r) => (r.input as { kind?: unknown } | null)?.kind === MCP_ACTION).map((r) => r.id)
    if (runIds.length) {
      await tx.agentApproval.updateMany({ where: { runId: { in: runIds }, status: "PENDING" }, data: { status: "REJECTED", decidedById: actorId, decidedAt: now, note } })
      await tx.agentRun.updateMany({ where: { id: { in: runIds } }, data: { status: "CANCELLED", finishedAt: now, reservedMicros: 0, error: note } })
    }
    return true
  })
}

/** Revokes a token or closes a connection: its member, or the owner for anyone's. */
export async function revokeToken(actor: CurrentUser, tokenId: string, ip?: string | null): Promise<McpTokenView> {
  const t = await prisma.mcpToken.findFirst({ where: { id: tokenId, workspaceId: actor.workspaceId }, select })
  if (!t || (t.userId !== actor.id && !isOwner(actor))) throw new LeadError("not_found", "Accès introuvable.", 404)
  const connection = !!t.oauthClient
  if (t.revokedAt || !(await closeToken(t.id, actor.workspaceId, actor.id, connection ? "Connexion MCP fermée" : "Jeton MCP révoqué"))) {
    throw new LeadError("conflict", connection ? "Cette connexion est déjà fermée." : "Ce jeton est déjà révoqué.", 409)
  }
  await audit({ action: "mcp.token_revoked", actorId: actor.id, workspaceId: actor.workspaceId, entityType: "McpToken", entityId: t.id, metadata: { name: t.name, ownerId: t.userId, kind: connection ? "connection" : "token" }, ip })
  return toView(await prisma.mcpToken.findUniqueOrThrow({ where: { id: t.id }, select }), actor, isOwner(actor))
}

/** Who calls: the access's member as the CRM sees them now, and what the access allows. */
export interface McpCaller {
  user: CurrentUser
  workspaceName: string
  /** `lastClient`: what a legacy client said at its handshake, for its later requests that do not say it again. */
  token: { id: string; kind: "token" | "connection"; name: string; readOnly: boolean; lastClient: string | null }
}

/** `invalidToken`: a token was presented and refused, which the 401's challenge says (RFC 6750 §3.1). */
export type AuthFailure = { status: 401 | 403; message: string; invalidToken?: boolean }

const callerSelect = {
  id: true,
  name: true,
  workspaceId: true,
  readOnly: true,
  expiresAt: true,
  revokedAt: true,
  lastClient: true,
  oauthClientId: true,
  resource: true,
  user: { select: { id: true, name: true, email: true, image: true, role: true, active: true, workspaceId: true } },
  workspace: { select: { name: true, aiSetting: { select: { mcpEnabled: true } } } },
} satisfies Prisma.McpTokenSelect

/** The access a bearer stands for: a personal token by its own hash, a connection by one of its access tokens. */
async function accessOf(secret: string, now: Date) {
  const hash = hashToken(secret)
  if (secret.startsWith(TOKEN_PREFIX)) {
    const t = await prisma.mcpToken.findUnique({ where: { tokenHash: hash }, select: callerSelect })
    return t && !t.oauthClientId ? t : null
  }
  if (!secret.startsWith(ACCESS_PREFIX)) return null
  const a = await prisma.mcpAccessToken.findUnique({ where: { hash }, select: { expiresAt: true, token: { select: callerSelect } } })
  return !a ? null : a.expiresAt <= now ? ("expired" as const) : a.token
}

/**
 * Reads `Authorization: Bearer <token>`: a personal token, or an OAuth connection's access token. A missing, unknown,
 * expired or revoked one, or an inactive member, is a 401; MCP switched off or a role without AI is a 403. A refresh
 * token never opens the server.
 */
export async function authenticate(header: string | null, now = new Date()): Promise<McpCaller | AuthFailure> {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "")
  if (!match) return { status: 401, message: "Jeton manquant : connectez l'application à Cleads, ou envoyez « Authorization: Bearer <jeton> » (Réglages › Accès MCP)." }
  const secret = match[1]
  const t = secret.length > 120 ? null : await accessOf(secret, now)
  if (t === "expired") return { status: 401, message: "Jeton d'accès expiré : l'application le renouvelle.", invalidToken: true }
  if (!t) return { status: 401, message: "Jeton invalide.", invalidToken: true }
  const connection = !!t.oauthClientId
  if (t.revokedAt) return { status: 401, message: connection ? "Cette connexion a été fermée : reconnectez l'application à Cleads." : "Ce jeton a été révoqué : créez-en un autre dans Réglages › Accès MCP.", invalidToken: true }
  if (t.expiresAt <= now) return { status: 401, message: connection ? "Cette connexion a expiré après 90 jours sans usage : reconnectez l'application à Cleads." : "Ce jeton a expiré : créez-en un autre dans Réglages › Accès MCP.", invalidToken: true }
  // RFC 8707: a connection is bound to this MCP server.
  if (connection && t.resource && !isOurResource(t.resource)) return { status: 401, message: "Ce jeton n'a pas été délivré pour ce serveur.", invalidToken: true }
  const u = t.user
  const role = toCrmRole(u.role)
  if (!u.active || !role || u.workspaceId !== t.workspaceId) return { status: 401, message: "Le compte de cet accès n'a plus accès au CRM.", invalidToken: true }
  if (!t.workspace.aiSetting?.mcpEnabled) return { status: 403, message: "L'accès MCP est coupé dans cet espace : le propriétaire l'active dans Réglages › Accès MCP." }
  if (!can(role, "ai:use")) return { status: 403, message: "Votre rôle ne permet pas d'utiliser l'IA dans le CRM." }
  return {
    user: { id: u.id, workspaceId: t.workspaceId, name: u.name ?? u.email ?? "", email: u.email ?? "", image: u.image, role },
    workspaceName: t.workspace.name,
    token: { id: t.id, kind: connection ? "connection" : "token", name: t.name, readOnly: t.readOnly, lastClient: t.lastClient },
  }
}

/** Writes the token's last use and client, at most once a minute (or when the client changes). Never throws. */
export async function touchToken(tokenId: string, client: string | null, now = new Date()): Promise<void> {
  const name = client ? clientName(client) : null
  await prisma.mcpToken
    .updateMany({
      where: { id: tokenId, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: new Date(now.getTime() - TOUCH_MS) } }, ...(name ? [{ lastClient: { not: name } }] : [])] },
      data: { lastUsedAt: now, ...(name ? { lastClient: name } : {}) },
    })
    .catch(() => undefined)
}

export interface McpCallView {
  id: string
  tool: string
  client: string | null
  outcome: "DONE" | "PENDING" | "REFUSED" | "ERROR"
  approvalId: string | null
  durationMs: number
  createdAt: string
}

/** An access's last calls, for its member or the owner. */
export async function tokenCalls(actor: CurrentUser, tokenId: string, limit = 50): Promise<McpCallView[]> {
  const t = await prisma.mcpToken.findFirst({ where: { id: tokenId, workspaceId: actor.workspaceId }, select: { userId: true } })
  if (!t || (t.userId !== actor.id && !isOwner(actor))) throw new LeadError("not_found", "Accès introuvable.", 404)
  const rows = await prisma.mcpCall.findMany({ where: { tokenId }, orderBy: { createdAt: "desc" }, take: Math.min(limit, 100) })
  return rows.map((c) => ({ id: c.id, tool: c.tool, client: c.client, outcome: c.outcome, approvalId: c.approvalId, durationMs: c.durationMs, createdAt: c.createdAt.toISOString() }))
}
