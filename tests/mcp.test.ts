// E29 the CRM's MCP server: the protocol on the wire, the catalogue as MCP lists it, the tokens' secrets and what the
// journal says. No database.
import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  ERRORS,
  LEGACY_VERSIONS,
  META_CLIENT,
  META_VERSION,
  MODERN_VERSION,
  clientInfoName,
  declaredVersion,
  decodeHeader,
  failure,
  headerMismatch,
  negotiateLegacy,
  parseMessage,
  success,
  type Message,
} from "@/features/mcp/protocol"
import { MCP_TOOLS, READ_ONLY_FAMILIES, describeTool, forClient, offeredTools, refusalOf, toolByName } from "@/features/mcp/tools"
import { MCP_CLIENTS } from "@/features/mcp/policy"
import { appOrigin } from "@/features/mcp/status"
import { TOKEN_PREFIX, newSecret } from "@/features/mcp/tokens"
import { MCP_ACTION, clientName, clientOfInput } from "@/features/mcp/names"
import { effectivePolicy } from "@/features/ai/actions/policy"
import { AGENTS, agentLabel, viaAgent } from "@/features/ai/agents"
import { approvalOf, type AnyToolDef, type ToolContext } from "@/features/ai/tools"

const policy = effectivePolicy(MCP_CLIENTS, null)
const ctx: ToolContext = { run: { id: "", workspaceId: "ws", agentId: "copilot", requester: null, userKey: "u", leadId: null, client: "Claude Code" }, policy }
const message = (text: string) => {
  const out = parseMessage(text)
  if ("error" in out) throw new Error(out.error.message)
  return out.message
}
const call = (name: string, extra: Record<string, unknown> = {}): Message => ({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: {}, _meta: { [META_VERSION]: MODERN_VERSION }, ...extra } })

describe("JSON-RPC messages", () => {
  it("reads one request or notification, and refuses batches, responses and malformed ones", () => {
    expect(message('{"jsonrpc":"2.0","id":7,"method":"tools/list"}')).toMatchObject({ id: 7, method: "tools/list" })
    expect(message('{"jsonrpc":"2.0","method":"notifications/initialized"}').id).toBeUndefined()
    const error = (text: string) => ("error" in parseMessage(text) ? (parseMessage(text) as { error: { code: number } }).error.code : null)
    expect(error("pas du json")).toBe(ERRORS.PARSE)
    expect(error('[{"jsonrpc":"2.0","id":1,"method":"ping"}]')).toBe(ERRORS.INVALID_REQUEST)
    expect(error('{"jsonrpc":"1.0","id":1,"method":"ping"}')).toBe(ERRORS.INVALID_REQUEST)
    expect(error('{"jsonrpc":"2.0","id":1,"result":{}}')).toBe(ERRORS.INVALID_REQUEST)
    expect(error('{"jsonrpc":"2.0","id":{"a":1},"method":"ping"}')).toBe(ERRORS.INVALID_REQUEST)
    expect(error('{"jsonrpc":"2.0","id":1,"method":"ping","params":[1]}')).toBe(ERRORS.INVALID_REQUEST)
  })

  it("answers with resultType in the modern era only, and leaves out an id it could not read", () => {
    expect(success(1, { tools: [] }, true)).toEqual({ jsonrpc: "2.0", id: 1, result: { resultType: "complete", tools: [] } })
    expect(success(1, { tools: [] }, false)).toEqual({ jsonrpc: "2.0", id: 1, result: { tools: [] } })
    expect(failure(undefined, { code: ERRORS.PARSE, message: "JSON invalide." })).toEqual({ jsonrpc: "2.0", error: { code: ERRORS.PARSE, message: "JSON invalide." } })
  })
})

describe("Protocol versions", () => {
  it("tells the eras apart and names the client", () => {
    const modern: Message = { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: { [META_VERSION]: MODERN_VERSION, [META_CLIENT]: { name: "claude-code", title: "Claude Code", version: "2.1" } } } }
    expect(declaredVersion(modern)).toBe(MODERN_VERSION)
    expect(clientInfoName(modern)).toBe("Claude Code")
    const init: Message = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", clientInfo: { name: "cursor-vscode", version: "1.0" } } }
    expect(declaredVersion(init)).toBeNull()
    expect(clientInfoName(init)).toBe("cursor-vscode")
  })

  it("gives a legacy client the version it asks for when known, else the latest legacy one", () => {
    for (const v of LEGACY_VERSIONS) expect(negotiateLegacy(v)).toBe(v)
    expect(negotiateLegacy("2024-11-05")).toBe("2025-11-25")
    expect(negotiateLegacy(MODERN_VERSION)).toBe("2025-11-25")
    expect(negotiateLegacy(undefined)).toBe("2025-11-25")
  })
})

describe("Mirrored headers (2026-07-28)", () => {
  const headers = (h: Record<string, string>) => new Headers(h)
  const ok = { "MCP-Protocol-Version": MODERN_VERSION, "Mcp-Method": "tools/call", "Mcp-Name": "search_leads" }

  it("decodes the base64 form and refuses raw non-ASCII", () => {
    expect(decodeHeader("search_leads")).toBe("search_leads")
    expect(decodeHeader("=?base64?SGVsbG8sIOS4lueVjA==?=")).toBe("Hello, 世界")
    expect(decodeHeader("Révision")).toBeNull()
  })

  it("accepts headers that say what the body says, whatever their case", () => {
    expect(headerMismatch(call("search_leads"), headers(ok), MODERN_VERSION)).toBeNull()
    expect(headerMismatch(call("search_leads"), headers({ "mcp-protocol-version": MODERN_VERSION, "MCP-METHOD": "tools/call", "mcp-name": "=?base64?c2VhcmNoX2xlYWRz?=" }), MODERN_VERSION)).toBeNull()
    expect(headerMismatch({ jsonrpc: "2.0", id: 1, method: "tools/list" }, headers({ "MCP-Protocol-Version": MODERN_VERSION, "Mcp-Method": "tools/list" }), MODERN_VERSION)).toBeNull()
  })

  it("refuses a missing or different header", () => {
    expect(headerMismatch(call("search_leads"), headers({ "Mcp-Method": "tools/call", "Mcp-Name": "search_leads" }), MODERN_VERSION)).toMatch(/MCP-Protocol-Version manquant/)
    expect(headerMismatch(call("search_leads"), headers({ ...ok, "MCP-Protocol-Version": "2025-11-25" }), MODERN_VERSION)).toMatch(/différent du _meta/)
    expect(headerMismatch(call("search_leads"), headers({ ...ok, "Mcp-Method": "tools/list" }), MODERN_VERSION)).toMatch(/Mcp-Method/)
    expect(headerMismatch(call("search_leads"), headers({ "MCP-Protocol-Version": MODERN_VERSION, "Mcp-Method": "tools/call" }), MODERN_VERSION)).toMatch(/Mcp-Name manquant/)
    expect(headerMismatch(call("search_leads"), headers({ ...ok, "Mcp-Name": "add_note" }), MODERN_VERSION)).toMatch(/Mcp-Name différent/)
  })
})

describe("The catalogue as MCP lists it", () => {
  it("publishes every action but the copilot's skills, plus two reads to follow what was asked", () => {
    const names = MCP_TOOLS.map((d) => d.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).not.toContain("read_skill")
    expect(names).toEqual(expect.arrayContaining(["search_leads", "add_note", "set_lead_status", "start_search", "enroll_in_sequence", "propose_mission", "get_action_status", "get_run_status"]))
    // MCP names: letters, digits, _ - . and 128 characters at most.
    for (const n of names) expect(n).toMatch(/^[A-Za-z0-9_.-]{1,128}$/)
  })

  it("gives each tool an object schema, its words and what its validation means here", async () => {
    for (const def of MCP_TOOLS) {
      const t = await describeTool(def, ctx)
      expect(t.inputSchema.type, def.name).toBe("object")
      expect(t.description.trim().length, def.name).toBeGreaterThan(20)
      expect(t.annotations.destructiveHint).toBe(false)
    }
    const add = await describeTool(toolByName("add_note")!, ctx)
    expect(add.description).not.toMatch(/À valider|propre clic/)
    expect((await describeTool(toolByName("set_lead_status")!, ctx)).description).toMatch(/Attend la validation de la personne dans Cleads/)
    expect((await describeTool(toolByName("enroll_in_sequence")!, ctx)).description).toMatch(/Contacte un prospect : attend toujours son propre clic/)
    expect((await describeTool(toolByName("search_leads")!, ctx)).annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false })
    expect((await describeTool(toolByName("start_search")!, ctx)).annotations).toMatchObject({ readOnlyHint: false, openWorldHint: true })
  })

  it("starts from the copilot's levels: what contacts a prospect always waits for its own click", () => {
    expect(MCP_CLIENTS.families).toEqual(AGENTS.copilot.families)
    expect(approvalOf(toolByName("enroll_in_sequence")!, ctx)).toBe("explicit")
    expect(approvalOf(toolByName("set_lead_status")!, ctx)).toBe("confirm")
    expect(approvalOf(toolByName("add_note")!, ctx)).toBe("auto")
    // The owner may make a family wait for a click; it never skips one.
    expect(approvalOf(toolByName("add_note")!, { ...ctx, policy: { ...policy, notes: "confirm" } })).toBe("confirm")
  })

  it("offers each token what the member's role, the MCP clients' row and the token allow", () => {
    const names = (reach: Parameters<typeof offeredTools>[0]) => offeredTools(reach).map((d) => d.name)
    expect(names({ role: "OWNER", readOnly: false, policy })).toEqual(MCP_TOOLS.map((d) => d.name))
    const closer = names({ role: "CLOSER", readOnly: false, policy })
    expect(closer).not.toContain("start_search")
    expect(closer).toContain("add_note")
    const reader = offeredTools({ role: "OWNER", readOnly: true, policy })
    expect(reader.every((d) => d.family && READ_ONLY_FAMILIES.has(d.family))).toBe(true)
    expect(reader.map((d) => d.name)).toEqual(expect.arrayContaining(["search_leads", "open_page", "get_action_status"]))
    const cut = { ...policy, prospecting: "off" as const }
    expect(names({ role: "OWNER", readOnly: false, policy: cut })).not.toContain("start_search")
    expect(refusalOf(toolByName("start_search")!, { role: "OWNER", readOnly: false, policy: cut })).toMatch(/coupée pour les clients mcp/)
    expect(refusalOf(toolByName("start_search")!, { role: "CLOSER", readOnly: false, policy })).toMatch(/droit que le rôle/)
    expect(refusalOf(toolByName("add_note")!, { role: "OWNER", readOnly: true, policy })).toMatch(/lecture seule/)
  })
})

describe("Outputs for an outside client", () => {
  it("makes the CRM's links absolute and speaks of no card", () => {
    const def = toolByName("open_page")!
    expect(forClient(def, { open: "/app/leads/l1", label: "Plomberie Martin" })).toEqual({ open: `${appOrigin()}/app/leads/l1`, label: "Plomberie Martin" })
    expect(forClient(def, { open: "https://ailleurs.test/app", text: "/apprendre" })).toEqual({ open: "https://ailleurs.test/app", text: "/apprendre" })
    const run = forClient(def, { started: true, runId: "r1", note: "la carte se met à jour" }) as { note: string }
    expect(run.note).toMatch(/get_run_status/)
    expect(run.note).not.toMatch(/carte/)
    const mission = forClient(def, { proposed: true, missionId: "m1", note: "sur sa carte" }) as { note: string; open: string }
    expect(mission.note).toMatch(/Agents IA › Missions/)
    expect(mission.open).toBe(`${appOrigin()}/app/agents?tab=missions`)
  })

  it("gives what the copilot's model reads, not the whole output", () => {
    const def = { ...toolByName("tag_leads")!, forModel: (o: { leadIds: string[] }) => ({ tagged: o.leadIds.length }) } as AnyToolDef
    expect(forClient(def, { leadIds: ["a", "b"] })).toEqual({ tagged: 2 })
  })
})

describe("Tokens and the journal", () => {
  it("makes a 256-bit secret with a recognisable prefix, and keeps only its hash", () => {
    const { secret, hash, hint } = newSecret()
    expect(secret.startsWith(TOKEN_PREFIX)).toBe(true)
    expect(secret).toHaveLength(TOKEN_PREFIX.length + 43)
    expect(hint).toBe(secret.slice(TOKEN_PREFIX.length, TOKEN_PREFIX.length + 6))
    expect(hash).toBe(createHash("sha256").update(secret).digest("hex"))
    expect(newSecret().secret).not.toBe(secret)
  })

  it("names the MCP client in the journal, as it calls itself and kept printable", () => {
    expect(viaAgent("copilot")).toBe("via le Copilote")
    expect(viaAgent("mcp", "Claude Code")).toBe("via Claude Code (MCP)")
    expect(viaAgent("mcp")).toBe("via un client MCP")
    expect(agentLabel("mcp")).toBe("Clients MCP")
    expect(clientName("<b>Cursor</b>")).toBe("bCursor/b")
    expect(clientName("  ")).toBe("Client MCP")
    expect(clientName(undefined)).toBe("Client MCP")
    expect(clientOfInput({ kind: MCP_ACTION, client: "Claude Code", tokenId: "t" })).toBe("Claude Code")
    expect(clientOfInput({ kind: "mission_action" })).toBeNull()
  })
})
