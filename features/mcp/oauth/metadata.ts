import { appOrigin } from "../names"

/**
 * E29 lot 2 (D44): Cleads is the authorization server of its own MCP server. What a client discovers first, without a
 * token: where the protected resource is and who issues its tokens (RFC 9728), the authorization server's endpoints and
 * abilities (RFC 8414), and the 401 challenge that starts it all. Claude, ChatGPT and Claude Code read exactly these.
 */

export const SCOPE_READ = "crm:read"
export const SCOPE_WRITE = "crm:write"
export const SCOPES = [SCOPE_READ, SCOPE_WRITE] as const

/** How a client may prove itself at the token endpoint. `none` (public client with PKCE) is the one CIMD clients use. */
export const CLIENT_AUTH_METHODS = ["none", "client_secret_basic", "client_secret_post"] as const
export type ClientAuthMethod = (typeof CLIENT_AUTH_METHODS)[number]

export const OAUTH_PATHS = {
  authorize: "/auth/authorize",
  token: "/api/oauth/token",
  register: "/api/oauth/register",
  revoke: "/api/oauth/revoke",
} as const

/** The issuer: the site's own origin, compared character for character by the clients (RFC 9207). */
export const issuer = () => appOrigin()
/** The MCP server's canonical URI (RFC 8707): what the user types in Claude, what tokens are bound to. */
export const mcpResource = () => `${appOrigin()}/api/mcp`
export const resourceMetadataUrl = () => `${appOrigin()}/.well-known/oauth-protected-resource/api/mcp`

export function protectedResourceMetadata() {
  return {
    resource: mcpResource(),
    authorization_servers: [issuer()],
    scopes_supported: [...SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "Cleads CRM",
  }
}

export function authorizationServerMetadata() {
  const origin = appOrigin()
  return {
    issuer: issuer(),
    authorization_endpoint: `${origin}${OAUTH_PATHS.authorize}`,
    token_endpoint: `${origin}${OAUTH_PATHS.token}`,
    registration_endpoint: `${origin}${OAUTH_PATHS.register}`,
    revocation_endpoint: `${origin}${OAUTH_PATHS.revoke}`,
    scopes_supported: [...SCOPES],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: [...CLIENT_AUTH_METHODS],
    revocation_endpoint_auth_methods_supported: [...CLIENT_AUTH_METHODS],
    code_challenge_methods_supported: ["S256"],
    // With "none" above, Claude and ChatGPT send their client_id URL instead of registering (CIMD).
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  }
}

/**
 * The challenge of a 401 at the MCP endpoint (RFC 6750, RFC 9728 §5.1): where the client finds the authorization server,
 * and the scopes to ask for, so that the member can choose on the consent screen. `invalid_token` only when a token was
 * presented. Header values stay ASCII: no description here.
 */
export function bearerChallenge(error?: "invalid_token"): string {
  return `Bearer ${[error && `error="${error}"`, `resource_metadata="${resourceMetadataUrl()}"`, `scope="${SCOPES.join(" ")}"`].filter(Boolean).join(", ")}`
}

/**
 * Whether a `resource` a client names is this MCP server (RFC 8707): scheme and host in any case, a trailing slash
 * tolerated. The bare origin is accepted too, as the less specific name of the same server.
 */
export function isOurResource(value: string): boolean {
  try {
    const u = new URL(value)
    const ours = new URL(mcpResource())
    if (u.hash || u.search || u.username || u.password || u.protocol !== ours.protocol || u.host !== ours.host) return false
    const path = u.pathname.replace(/\/+$/, "")
    return path === ours.pathname || path === ""
  } catch {
    return false
  }
}

/**
 * What a client asks for. Reading always comes with the access; writing only if asked, or when no scope of ours is named
 * at all (the member then chooses). Other scopes (offline_access, openid…) are ignored.
 */
export function requestedAccess(scope: string | null | undefined): { write: boolean } {
  const asked = new Set((scope ?? "").split(/\s+/).filter(Boolean))
  return { write: asked.has(SCOPE_WRITE) || !SCOPES.some((s) => asked.has(s)) }
}

export const grantedScope = (readOnly: boolean) => (readOnly ? SCOPE_READ : `${SCOPE_READ} ${SCOPE_WRITE}`)
