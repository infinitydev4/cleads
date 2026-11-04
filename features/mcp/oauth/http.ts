import type { CurrentUser } from "@/lib/auth/guard"
import { rateLimit } from "@/lib/rate-limit"
import { clientIp } from "@/lib/request-ip"
import { appOrigin } from "../names"
import { approveAuthorization, checkAuthorizationRequest, connectRefusal, denyAuthorization, readParams } from "./authorize"
import { authenticateClient, registerClient } from "./clients"
import { exchangeCode, refreshConnection, revokePresented } from "./grants"
import { OAUTH_PATHS, authorizationServerMetadata, protectedResourceMetadata } from "./metadata"

/**
 * The OAuth endpoints as plain `Request → Response` handlers (E29 lot 2): the Next routes only pass requests in, and the
 * tests call them directly. Discovery, registration, token and revocation answer any origin (no cookie is read there);
 * the consent decision answers the CRM's own pages only.
 */

const MAX_BODY = 20_000

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version",
  "access-control-max-age": "86400",
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", pragma: "no-cache", ...CORS, ...headers } })

const preflight = () => new Response(null, { status: 204, headers: CORS })
const notAllowed = (allow: string) => new Response(null, { status: 405, headers: { allow, ...CORS } })

/** RFC 9728: where the MCP server's tokens come from. */
export function handleResourceMetadata(request: Request): Response {
  if (request.method === "OPTIONS") return preflight()
  if (request.method !== "GET" && request.method !== "HEAD") return notAllowed("GET")
  return json(200, protectedResourceMetadata(), { "cache-control": "public, max-age=300" })
}

/** RFC 8414: the authorization server's endpoints and abilities. */
export function handleServerMetadata(request: Request): Response {
  if (request.method === "OPTIONS") return preflight()
  if (request.method !== "GET" && request.method !== "HEAD") return notAllowed("GET")
  return json(200, authorizationServerMetadata(), { "cache-control": "public, max-age=300" })
}

/** RFC 7591: a client without a metadata document registers here (JSON). */
export async function handleRegister(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return preflight()
  if (request.method !== "POST") return notAllowed("POST")
  const text = await request.text()
  let body: unknown
  try {
    body = text.length <= MAX_BODY ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (!body || typeof body !== "object") return json(400, { error: "invalid_client_metadata", error_description: "Un objet JSON est attendu (RFC 7591)." })
  const out = await registerClient(body, clientIp(request.headers))
  return json(out.status, out.body, out.status === 429 ? { "retry-after": "3600" } : {})
}

/** The token endpoint's body: form-encoded (RFC 6749), JSON accepted too. Null when unreadable or too long. */
async function readForm(request: Request): Promise<URLSearchParams | null> {
  const text = await request.text()
  if (text.length > MAX_BODY) return null
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) return new URLSearchParams(text)
  try {
    const value: unknown = JSON.parse(text)
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    return new URLSearchParams(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
  } catch {
    return null
  }
}

/** The client, authenticated as it registered, or the error to answer (401 for invalid_client, RFC 6749 §5.2). */
async function callingClient(request: Request, form: URLSearchParams) {
  const auth = await authenticateClient(request.headers, form)
  if (!("error" in auth)) return auth
  return { response: json(auth.error === "invalid_client" ? 401 : 400, { error: auth.error, error_description: auth.description }, auth.basic ? { "www-authenticate": 'Basic realm="Cleads"' } : {}) }
}

/** RFC 6749 §3.2: codes and refresh tokens become access tokens. */
export async function handleToken(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return preflight()
  if (request.method !== "POST") return notAllowed("POST")
  const form = await readForm(request)
  if (!form) return json(400, { error: "invalid_request", error_description: "Corps illisible : application/x-www-form-urlencoded est attendu." })
  const auth = await callingClient(request, form)
  if ("response" in auth) return auth.response
  if (!(await rateLimit("oauth-token", `${clientIp(request.headers) ?? ""}|${auth.client.clientId}`, 60, 60))) {
    return json(429, { error: "invalid_request", error_description: "Trop de requêtes : réessayez dans une minute." }, { "retry-after": "60" })
  }
  const grant = form.get("grant_type")
  const out =
    grant === "authorization_code"
      ? await exchangeCode(auth.client, form)
      : grant === "refresh_token"
        ? await refreshConnection(auth.client, form)
        : { error: "unsupported_grant_type", error_description: "grant_type : authorization_code ou refresh_token." }
  return "access_token" in out ? json(200, out) : json(400, out)
}

/** RFC 7009: the client gives a token back. Always 200, known or not. */
export async function handleRevoke(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return preflight()
  if (request.method !== "POST") return notAllowed("POST")
  const form = await readForm(request)
  if (!form) return json(400, { error: "invalid_request", error_description: "Corps illisible." })
  const auth = await callingClient(request, form)
  if ("response" in auth) return auth.response
  if (!(await rateLimit("oauth-revoke", clientIp(request.headers), 60, 60))) return json(429, { error: "invalid_request", error_description: "Trop de requêtes." }, { "retry-after": "60" })
  await revokePresented(auth.client, form.get("token"))
  return new Response(null, { status: 200, headers: { "cache-control": "no-store", ...CORS } })
}

/** The member who answers the consent screen, as the CRM's session sees them. */
export interface ConsentSession {
  actor: CurrentUser | null
  temporaryPassword: boolean
}

const seeOther = (location: string) => new Response(null, { status: 303, headers: { location, "cache-control": "no-store" } })
const refused = (status: number, message: string) => new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } })

/**
 * The consent form's answer (`POST /api/oauth/authorize`). Only from the CRM's own page (its Origin), by the signed-in
 * member, every parameter checked again: « Autoriser » sends a code back, « Refuser » an access_denied.
 */
export async function handleDecision(request: Request, session: ConsentSession): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } })
  if (request.headers.get("origin") !== appOrigin()) return refused(403, "Requête refusée : elle ne vient pas de Cleads.")
  const text = await request.text()
  if (text.length > MAX_BODY) return refused(413, "Requête trop longue.")
  const form = new URLSearchParams(text)
  const params = readParams(form)
  const page = `${appOrigin()}${OAUTH_PATHS.authorize}?${new URLSearchParams(params as Record<string, string>)}`
  if (!session.actor) return seeOther(`${appOrigin()}/auth/login?callbackUrl=${encodeURIComponent(page.slice(appOrigin().length))}`)
  if (session.temporaryPassword) return seeOther(`${appOrigin()}/auth/change-password`)
  if (!(await rateLimit("oauth-authorize", session.actor.id, 30, 600))) return refused(429, "Trop de tentatives : réessayez dans quelques minutes.")
  const check = await checkAuthorizationRequest(params, session.actor)
  // The page says what is wrong; a callback that cannot be trusted gets nothing.
  if (check.kind === "problem") return seeOther(page)
  if (check.kind === "redirect") return seeOther(check.url)
  if (form.get("decision") !== "allow") return seeOther(denyAuthorization(check.request))
  if (await connectRefusal(session.actor)) return seeOther(page)
  return seeOther(await approveAuthorization(session.actor, check.request, { readOnly: form.get("access") !== "write" }, clientIp(request.headers)))
}
