import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { generateToken, hashToken } from "@/features/team/rules"
import { clientForAuthorization, type OAuthClient } from "./clients"
import { CODE_TTL_MS } from "./grants"
import { isOurResource, issuer, mcpResource, requestedAccess } from "./metadata"
import { appOf, checkRedirectUri, redirectMatches, type AppIdentity } from "./redirects"

/**
 * The authorization request (RFC 6749 §4.1, OAuth 2.1, MCP 2026-07-28), read for a signed-in member: which application
 * asks, where its code goes back, what it may get. An unknown client or callback is shown, never redirected to; the other
 * errors go back to the client with its state and the issuer (RFC 9207). Nothing is given without the member's click.
 */

/** The request's parameters, read by the consent page and carried, unchanged, by its form. */
export const AUTHORIZE_PARAMS = ["response_type", "client_id", "redirect_uri", "state", "scope", "code_challenge", "code_challenge_method", "resource"] as const
export type AuthorizeParams = Partial<Record<(typeof AUTHORIZE_PARAMS)[number], string>>

export interface AuthorizationRequest {
  client: OAuthClient
  app: AppIdentity
  redirectUri: string
  state: string | null
  codeChallenge: string
  /** The application asked for writing (or named no scope of ours): « Lecture et actions » can be chosen. */
  canWrite: boolean
  params: AuthorizeParams
}

export type AuthorizationCheck =
  | { kind: "ok"; request: AuthorizationRequest }
  /** Shown on the page: the callback cannot be trusted, so nothing goes back. */
  | { kind: "problem"; title: string; message: string }
  /** An error the client reads at its callback. */
  | { kind: "redirect"; url: string }

/** The first value of each known parameter; anything else is dropped. */
export function readParams(source: URLSearchParams | Record<string, string | string[] | undefined>): AuthorizeParams {
  const out: AuthorizeParams = {}
  for (const key of AUTHORIZE_PARAMS) {
    const raw = source instanceof URLSearchParams ? source.get(key) : source[key]
    const value = Array.isArray(raw) ? raw[0] : raw
    if (typeof value === "string" && value) out[key] = value
  }
  return out
}

/** The client's callback with the answer's parameters and the issuer, so that it knows the answer is Cleads' (RFC 9207). */
export function backTo(redirectUri: string, params: Record<string, string | null | undefined>): string {
  const url = new URL(redirectUri)
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value)
  url.searchParams.set("iss", issuer())
  return url.toString()
}

const PKCE_CHALLENGE = /^[A-Za-z0-9._~-]{43,128}$/
const problem = (title: string, message: string): AuthorizationCheck => ({ kind: "problem", title, message })

export async function checkAuthorizationRequest(params: AuthorizeParams, actor: CurrentUser): Promise<AuthorizationCheck> {
  if (!params.client_id) return problem("Demande incomplète", "L’application n’a pas dit qui elle est. Relancez la connexion depuis l’application.")
  const client = await clientForAuthorization(params.client_id, actor.id)
  if ("error" in client) return problem("Application non reconnue", client.error)
  const redirectUri = params.redirect_uri ?? ""
  if (!redirectUri || !client.redirectUris.some((registered) => redirectMatches(registered, redirectUri))) {
    return problem("Adresse de retour inconnue", "Cette application demande à recevoir l’accès à une adresse qu’elle n’a pas déclarée. Rien n’a été envoyé.")
  }
  const where = checkRedirectUri(redirectUri)
  if (!where.ok) return problem("Application non admise", where.reason)

  const state = params.state ?? null
  const fail = (error: string, description: string): AuthorizationCheck => ({ kind: "redirect", url: backTo(redirectUri, { error, error_description: description, state: state && state.length <= 1000 ? state : null }) })
  if (state && state.length > 1000) return fail("invalid_request", "Paramètre state trop long.")
  if (params.response_type !== "code") return fail("unsupported_response_type", "Seul response_type=code est pris en charge.")
  if (params.code_challenge_method !== "S256" || !params.code_challenge || !PKCE_CHALLENGE.test(params.code_challenge)) return fail("invalid_request", "PKCE avec la méthode S256 est requis.")
  if (params.resource && !isOurResource(params.resource)) return fail("invalid_target", "Cette ressource n’est pas le serveur MCP de Cleads.")
  return {
    kind: "ok",
    request: { client, app: appOf(client, redirectUri), redirectUri, state, codeChallenge: params.code_challenge, canWrite: requestedAccess(params.scope).write, params },
  }
}

/** Why this member cannot connect an application now, or null: MCP closed in the workspace (D39), or a role without AI. */
export async function connectRefusal(actor: CurrentUser): Promise<string | null> {
  if (!can(actor.role, "ai:use")) return "Votre rôle ne permet pas d’utiliser l’IA dans le CRM : aucune application ne peut s’y connecter en votre nom."
  const on = (await prisma.aiSetting.findUnique({ where: { workspaceId: actor.workspaceId }, select: { mcpEnabled: true } }))?.mcpEnabled
  if (on) return null
  return can(actor.role, "ai:manage")
    ? "L’accès MCP est coupé dans votre espace. Activez-le dans Réglages › Accès MCP, puis relancez la connexion depuis l’application."
    : "L’accès MCP est coupé dans votre espace : le propriétaire l’active dans Réglages › Accès MCP."
}

/** « Autoriser »: a code for five minutes, one use, sent back with the state and the issuer. */
export async function approveAuthorization(actor: CurrentUser, request: AuthorizationRequest, choice: { readOnly: boolean }, ip?: string | null): Promise<string> {
  const readOnly = choice.readOnly || !request.canWrite
  const code = generateToken()
  await prisma.mcpOAuthCode.create({
    data: {
      codeHash: hashToken(code),
      oauthClientId: request.client.id,
      workspaceId: actor.workspaceId,
      userId: actor.id,
      redirectUri: request.redirectUri,
      codeChallenge: request.codeChallenge,
      resource: mcpResource(),
      readOnly,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  })
  await audit({
    action: "mcp.oauth_authorized",
    actorId: actor.id,
    workspaceId: actor.workspaceId,
    entityType: "McpOAuthClient",
    entityId: request.client.id,
    metadata: { app: request.app.name, verified: request.app.verified, destination: request.app.destination, readOnly },
    ip,
  })
  return backTo(request.redirectUri, { code, state: request.state })
}

/** « Refuser »: the client learns it, nothing is given. */
export function denyAuthorization(request: Pick<AuthorizationRequest, "redirectUri" | "state">): string {
  return backTo(request.redirectUri, { error: "access_denied", error_description: "L’accès a été refusé dans Cleads.", state: request.state })
}
