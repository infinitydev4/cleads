/**
 * Where an authorization code may go (D41): back to an application on the member's own computer (a loopback address on
 * any port, or an installed app's link such as cursor://), or to the exact callback of a service Cleads knows. Never to
 * another web site, even if the member clicks « Autoriser »: a trapped link cannot take a code away. Other tools keep
 * the personal token. No imports: the consent page and the settings list read it too.
 */

export type KnownAppId = "claude" | "claude-code" | "chatgpt" | "vscode" | "cursor"

const KNOWN_NAMES: Record<KnownAppId, string> = {
  claude: "Claude",
  "claude-code": "Claude Code",
  chatgpt: "ChatGPT",
  vscode: "VS Code",
  cursor: "Cursor",
}

/** The hosted services' callbacks, matched exactly (ChatGPT's per-connection form by its prefix). */
const SERVICE_CALLBACKS: { app: KnownAppId; match: (u: URL) => boolean }[] = [
  { app: "claude", match: (u) => (u.host === "claude.ai" || u.host === "claude.com") && u.pathname === "/api/mcp/auth_callback" },
  { app: "chatgpt", match: (u) => u.host === "chatgpt.com" && (u.pathname === "/connector_platform_oauth_redirect" || /^\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(u.pathname)) },
  { app: "vscode", match: (u) => (u.host === "vscode.dev" || u.host === "insiders.vscode.dev") && u.pathname === "/redirect" },
]

/** Claude Code's own Client ID Metadata Document (it declares loopback callbacks only). */
export const CLAUDE_CODE_CLIENT_ID = "https://claude.ai/oauth/claude-code-client-metadata"

const APP_SCHEMES: Record<string, KnownAppId> = { cursor: "cursor", vscode: "vscode", "vscode-insiders": "vscode" }

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])

/** Schemes a web page can reach or that open something else than an installed application. */
const BLOCKED_SCHEMES = new Set([
  "javascript", "data", "file", "blob", "about", "vbscript", "intent", "ftp", "ws", "wss", "mailto", "tel", "sms",
  "chrome", "chrome-extension", "moz-extension", "safari-extension", "edge", "view-source", "filesystem", "content", "jar",
])

export type RedirectKind = "local" | "app" | "service"

export type RedirectCheck = { ok: true; kind: RedirectKind; app: KnownAppId | null; label: string } | { ok: false; reason: string }

const scheme = (u: URL) => u.protocol.slice(0, -1).toLowerCase()

/** Whether Cleads may send a code to this address (D41), and what it is, for the consent screen. */
export function checkRedirectUri(raw: string): RedirectCheck {
  if (!raw || raw.length > 2000 || raw.includes("#")) return { ok: false, reason: "Adresse de retour invalide." }
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return { ok: false, reason: "Adresse de retour invalide." }
  }
  if (u.username || u.password) return { ok: false, reason: "Adresse de retour invalide : elle ne doit pas porter d’identifiants." }
  const s = scheme(u)
  if (s === "http" || s === "https") {
    if (LOOPBACK_HOSTS.has(u.hostname)) return { ok: true, kind: "local", app: null, label: `une application de cet ordinateur (${u.host})` }
    const service = s === "https" ? SERVICE_CALLBACKS.find((c) => c.match(u)) : undefined
    if (service) return { ok: true, kind: "service", app: service.app, label: u.host }
    return { ok: false, reason: "Cleads n’envoie un accès qu’à Claude, ChatGPT, VS Code ou à une application de cet ordinateur. Pour un autre outil, utilisez un jeton personnel." }
  }
  if (BLOCKED_SCHEMES.has(s) || s.startsWith("web+")) return { ok: false, reason: "Adresse de retour refusée." }
  const app = APP_SCHEMES[s] ?? null
  return { ok: true, kind: "app", app, label: app ? `l’application ${KNOWN_NAMES[app]} (${s}://)` : `une application de cet ordinateur (${s}://)` }
}

/**
 * Whether a requested redirect_uri is a registered one: exactly, or for a loopback address on any port (RFC 8252 §7.3;
 * Claude Code declares http://localhost/callback and binds a new port each time).
 */
export function redirectMatches(registered: string, requested: string): boolean {
  if (registered === requested) return true
  try {
    const a = new URL(registered)
    const b = new URL(requested)
    return a.protocol === "http:" && b.protocol === "http:" && LOOPBACK_HOSTS.has(a.hostname) && a.hostname === b.hostname && a.pathname === b.pathname && a.search === b.search
  } catch {
    return false
  }
}

export interface AppIdentity {
  /** Known to Cleads, or as the application names itself. */
  name: string
  verified: boolean
  /** Where its code goes back, as the consent screen says it: « claude.ai », « une application de cet ordinateur (…) ». */
  destination: string
  kind: RedirectKind
}

/** The client's own name, cleaned for display: no control characters, 60 characters at most. */
export function declaredName(name: string | null | undefined): string {
  const clean = (name ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60)
  return clean || "Application MCP"
}

/**
 * Which application holds a code or a connection. A known service's callback or Claude Code's document names it for
 * sure; otherwise it is the name the application gives itself, on the member's own computer.
 */
export function appOf(client: { kind: "CIMD" | "DCR"; clientId: string; name: string }, redirectUri: string | null | undefined): AppIdentity {
  const check = redirectUri ? checkRedirectUri(redirectUri) : null
  const where = check?.ok ? check : null
  const known: KnownAppId | null = client.kind === "CIMD" && client.clientId === CLAUDE_CODE_CLIENT_ID ? "claude-code" : where?.kind === "service" ? where.app : null
  return {
    name: known ? KNOWN_NAMES[known] : declaredName(client.name),
    verified: !!known,
    destination: where?.label ?? "une adresse inconnue",
    kind: where?.kind ?? "local",
  }
}
