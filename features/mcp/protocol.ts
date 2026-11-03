/**
 * The Model Context Protocol on the wire (E29, docs/crm-v1/AGENTS-IA.md §9): JSON-RPC messages, protocol versions and
 * the Streamable HTTP binding's checks. Pure: no database, no Next.
 *
 * The server serves both eras (MCP 2026-07-28, « Versioning: Backward Compatibility »):
 *  - modern (2026-07-28): no session and no handshake; every request carries its version and client in `_meta`, mirrored
 *    in the `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` headers, which must match the body;
 *  - legacy (2025-11-25, 2025-06-18, 2025-03-26): an `initialize` request first, then plain requests with the
 *    `MCP-Protocol-Version` header. Sessions are optional there; this server keeps none.
 */

export const MODERN_VERSION = "2026-07-28"
export const LEGACY_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"] as const
export const SUPPORTED_VERSIONS: readonly string[] = [MODERN_VERSION, ...LEGACY_VERSIONS]
/** A legacy request without the header comes from a client older than 2025-06-18. */
export const HEADERLESS_VERSION = "2025-03-26"

export const META_VERSION = "io.modelcontextprotocol/protocolVersion"
export const META_CLIENT = "io.modelcontextprotocol/clientInfo"
export const META_SERVER = "io.modelcontextprotocol/serverInfo"

export const ERRORS = {
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
  /** Implementation-defined: access refused, too many requests. The HTTP status says which. */
  SERVER: -32000,
  HEADER_MISMATCH: -32020,
  UNSUPPORTED_VERSION: -32022,
} as const

export type RequestId = string | number

export interface Message {
  jsonrpc: "2.0"
  /** Absent for a notification. */
  id?: RequestId
  method: string
  params?: Record<string, unknown>
}

export interface ErrorObject {
  code: number
  message: string
  data?: unknown
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)

/** One JSON-RPC request or notification; a batch, a response or anything else is refused. */
export function parseMessage(text: string): { message: Message } | { error: ErrorObject } {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { error: { code: ERRORS.PARSE, message: "JSON invalide." } }
  }
  if (Array.isArray(value)) return { error: { code: ERRORS.INVALID_REQUEST, message: "Un seul message JSON-RPC par requête." } }
  if (!isRecord(value) || value.jsonrpc !== "2.0" || typeof value.method !== "string" || !value.method) return { error: { code: ERRORS.INVALID_REQUEST, message: "Requête JSON-RPC 2.0 attendue." } }
  if ("id" in value && typeof value.id !== "string" && typeof value.id !== "number") return { error: { code: ERRORS.INVALID_REQUEST, message: "Identifiant de requête invalide." } }
  if (value.params !== undefined && !isRecord(value.params)) return { error: { code: ERRORS.INVALID_REQUEST, message: "Les paramètres doivent être un objet." } }
  return { message: value as unknown as Message }
}

export const metaOf = (m: Message): Record<string, unknown> | null => (isRecord(m.params?._meta) ? m.params._meta : null)

/** The version a modern request declares in its `_meta`; null for a legacy request. */
export function declaredVersion(m: Message): string | null {
  const v = metaOf(m)?.[META_VERSION]
  return typeof v === "string" ? v : null
}

/** The client's name: from `_meta` (modern) or from `initialize` (legacy). */
export function clientInfoName(m: Message): string | null {
  const info = m.method === "initialize" ? m.params?.clientInfo : metaOf(m)?.[META_CLIENT]
  return isRecord(info) && typeof info.name === "string" ? (typeof info.title === "string" && info.title ? info.title : info.name) : null
}

/** The version a legacy `initialize` gets: the one it asks for when known, else the latest legacy one. */
export function negotiateLegacy(requested: unknown): string {
  return typeof requested === "string" && (LEGACY_VERSIONS as readonly string[]).includes(requested) ? requested : LEGACY_VERSIONS[0]
}

const SENTINEL = /^=\?base64\?([A-Za-z0-9+/]*={0,2})\?=$/
const PLAIN = /^[\x20-\x7e\t]*$/

/** A header value as the body holds it: plain ASCII, or the `=?base64?…?=` form for anything else. Null when invalid. */
export function decodeHeader(value: string): string | null {
  const encoded = SENTINEL.exec(value)
  if (encoded) return Buffer.from(encoded[1], "base64").toString("utf8")
  return PLAIN.test(value) ? value : null
}

/** Methods whose `Mcp-Name` header mirrors a body field. */
const NAMED: Record<string, "name" | "uri"> = { "tools/call": "name", "prompts/get": "name", "resources/read": "uri" }

/**
 * The modern binding's checks: the mirrored headers are present and say what the body says. Returns what is wrong, or
 * null. Header names are case-insensitive (`Headers` handles it); values are compared as they are.
 */
export function headerMismatch(m: Message, headers: Headers, version: string): string | null {
  const v = headers.get("mcp-protocol-version")
  if (!v) return "En-tête MCP-Protocol-Version manquant."
  if (v !== version) return `En-tête MCP-Protocol-Version (${v}) différent du _meta de la requête (${version}).`
  const method = headers.get("mcp-method")
  if (!method) return "En-tête Mcp-Method manquant."
  if (method !== m.method) return `En-tête Mcp-Method (${method}) différent de la méthode de la requête (${m.method}).`
  const field = NAMED[m.method]
  if (!field) return null
  const raw = headers.get("mcp-name")
  if (raw === null) return "En-tête Mcp-Name manquant."
  const name = decodeHeader(raw)
  if (name === null) return "En-tête Mcp-Name invalide : une valeur hors ASCII s'encode en =?base64?…?=."
  if (name !== m.params?.[field]) return "En-tête Mcp-Name différent du nom de la requête."
  return null
}

export const success = (id: RequestId, result: Record<string, unknown>, modern: boolean) => ({ jsonrpc: "2.0" as const, id, result: modern ? { resultType: "complete", ...result } : result })

/** An error answer; without an id when the request's could not be read. */
export const failure = (id: RequestId | undefined, error: ErrorObject) => ({ jsonrpc: "2.0" as const, ...(id === undefined ? {} : { id }), error })
