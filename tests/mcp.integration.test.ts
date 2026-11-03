// E29 the CRM's MCP server (lot 1). Needs a disposable PostgreSQL with the migrations applied (never your development
// database):
//   TEST_DATABASE_URL=postgresql://… npx vitest run tests/mcp.integration.test.ts
// The AI SDK's own MCP client talks to the route's handler through a local fetch: no network, no model.
import { createHash } from "node:crypto"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { resetDatabase } from "./helpers/reset-db"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

const ORIGIN = "https://crm.example.test"
const ENDPOINT = `${ORIGIN}/api/mcp`

suite("The CRM's MCP server (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let server: typeof import("@/features/mcp/server")
  let tokens: typeof import("@/features/mcp/tokens")
  let access: typeof import("@/features/mcp/policy")
  let protocol: typeof import("@/features/mcp/protocol")
  let approvals: typeof import("@/features/ai/approvals")
  let definitions: typeof import("@/features/ai/definitions")
  let leads: typeof import("@/features/leads/service")
  let sequences: typeof import("@/features/outreach/sequences")
  let mcp: typeof import("@ai-sdk/mcp")
  type U = import("@/lib/auth/guard").CurrentUser
  const u: Record<string, U> = {}
  const ws = "ws_default"
  let leadId = ""

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.NEXT_PUBLIC_APP_URL = ORIGIN
    prisma = (await import("@/lib/prisma")).prisma
    server = await import("@/features/mcp/server")
    tokens = await import("@/features/mcp/tokens")
    access = await import("@/features/mcp/policy")
    protocol = await import("@/features/mcp/protocol")
    approvals = await import("@/features/ai/approvals")
    definitions = await import("@/features/ai/definitions")
    leads = await import("@/features/leads/service")
    sequences = await import("@/features/outreach/sequences")
    mcp = await import("@ai-sdk/mcp")
  })

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  beforeEach(async () => {
    await resetDatabase(prisma)
    for (const [key, role] of [["owner", "OWNER"], ["manager", "MANAGER"], ["sdr", "SDR"], ["closer", "CLOSER"], ["viewer", "VIEWER"]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@mcp.test`, name: `${key[0].toUpperCase()}${key.slice(1)} Test`, role, workspaceId: ws } })
      u[key] = { id: x.id, workspaceId: ws, name: x.name!, email: x.email!, image: null, role }
    }
    const company = await prisma.company.create({ data: { workspaceId: ws, name: "Plomberie Martin (démo)", city: "Nantes" } })
    const contact = await prisma.contact.create({ data: { workspaceId: ws, companyId: company.id, name: "Jean Martin", email: "jean@plomberie-martin.test", emailKind: "NOMINATIVE" } })
    leadId = (await prisma.lead.create({ data: { workspaceId: ws, companyId: company.id, contactId: contact.id, ownerId: u.sdr.id, status: "NEW", source: "EXTRACTOR" } })).id
  })

  const open = () => access.updateMcpAccess(u.owner, { enabled: true })
  const tokenFor = async (user: U, readOnly = false) => (await tokens.createToken(user, { name: `Jeton de ${user.name}`, readOnly, days: 30 })).secret

  /** The AI SDK's client, modern (server/discover) or legacy (initialize), sending its requests to the route's handler. */
  const client = (secret: string, era: "modern" | "legacy" = "modern") =>
    mcp.experimental_createMCPClient({
      transport: { type: "http", url: ENDPOINT, headers: { Authorization: `Bearer ${secret}` }, fetch: (input: RequestInfo | URL, init?: RequestInit) => server.handleMcp(new Request(input, init)) },
      protocolVersionDiscovery: era === "modern",
      clientName: "Claude Code",
    })

  /** A raw modern request, its headers mirrored from the body unless told otherwise. */
  const raw = (secret: string | null, method: string, params: Record<string, unknown> = {}, headers: Record<string, string | null> = {}, version = "2026-07-28") => {
    const h: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": version, "mcp-method": method }
    if (typeof params.name === "string") h["mcp-name"] = params.name
    if (secret) h.authorization = `Bearer ${secret}`
    for (const [k, v] of Object.entries(headers)) if (v === null) delete h[k.toLowerCase()]
    else h[k.toLowerCase()] = v
    const body = { jsonrpc: "2.0", id: 1, method, params: { ...params, _meta: { [protocol.META_VERSION]: version, [protocol.META_CLIENT]: { name: "claude-code", title: "Claude Code", version: "2.1" }, "io.modelcontextprotocol/clientCapabilities": {} } } }
    return server.handleMcp(new Request(ENDPOINT, { method: "POST", headers: h, body: JSON.stringify(body) }))
  }
  /** The first text block of a tool's result (the client's type also allows the 2024 `toolResult` form). */
  const text = (r: unknown) => (r as { content?: { type: string; text?: string }[] }).content?.[0]?.text ?? ""

  it("stays closed until the owner opens it, and closes every token when switched off", async () => {
    await expect(tokens.createToken(u.sdr, { name: "Claude Code" })).rejects.toThrow(/coupé/)
    await open()
    const secret = await tokenFor(u.sdr)
    expect((await raw(secret, "ping")).status).toBe(200)
    await access.updateMcpAccess(u.owner, { enabled: false })
    const closed = await raw(secret, "ping")
    expect(closed.status).toBe(403)
    expect(((await closed.json()) as { error: { message: string } }).error.message).toMatch(/coupé/)
    const journal = await prisma.auditLog.findMany({ where: { action: { startsWith: "mcp." } }, orderBy: { createdAt: "asc" }, select: { action: true } })
    expect(journal.map((j) => j.action)).toEqual(["mcp.enabled", "mcp.token_created", "mcp.disabled"])
    // Only the owner opens it, and a viewer has no token.
    await expect(access.updateMcpAccess(u.manager, { enabled: true })).rejects.toThrow(/propriétaire/)
    await open()
    await expect(tokens.createToken(u.viewer, { name: "Lecture" })).rejects.toThrow(/rôle/)
  })

  it("refuses a request without a valid token, a GET, a foreign page, an expired or revoked token and an inactive member", async () => {
    await open()
    const secret = await tokenFor(u.sdr)
    const none = await raw(null, "ping")
    expect(none.status).toBe(401)
    expect(none.headers.get("www-authenticate")).toMatch(/^Bearer/)
    expect((await raw("cleads_mcp_inconnu", "ping")).status).toBe(401)
    expect((await server.handleMcp(new Request(ENDPOINT, { method: "GET" }))).status).toBe(405)
    expect((await raw(secret, "ping", {}, { origin: "https://evil.test" })).status).toBe(403)
    expect((await raw(secret, "ping", {}, { origin: ORIGIN })).status).toBe(200)
    const row = await prisma.mcpToken.findFirstOrThrow({ where: { userId: u.sdr.id } })
    await prisma.mcpToken.update({ where: { id: row.id }, data: { expiresAt: new Date(Date.now() - 1_000) } })
    expect(((await (await raw(secret, "ping")).json()) as { error: { message: string } }).error.message).toMatch(/expiré/)
    await prisma.mcpToken.update({ where: { id: row.id }, data: { expiresAt: new Date(Date.now() + 86_400_000) } })
    await prisma.user.update({ where: { id: u.sdr.id }, data: { active: false } })
    expect((await raw(secret, "ping")).status).toBe(401)
    await prisma.user.update({ where: { id: u.sdr.id }, data: { active: true } })
    await tokens.revokeToken(u.sdr, row.id)
    expect(((await (await raw(secret, "ping")).json()) as { error: { message: string } }).error.message).toMatch(/révoqué/)
  })

  it("speaks the 2026-07-28 protocol to the AI SDK's client, and the 2025-11-25 one after initialize", async () => {
    await open()
    const secret = await tokenFor(u.sdr)
    const modern = await client(secret, "modern")
    // server/discover answered: the client stays in the modern era, without initialize.
    expect(modern.initializeResult.protocolVersion).toBe("2026-07-28")
    expect(modern.serverInfo).toMatchObject({ name: "cleads-crm" })
    expect(modern.instructions).toMatch(/pour Sdr Test \(SDR\)/)
    const listed = (await modern.listTools()).tools.map((t) => t.name)
    expect(listed).toEqual(expect.arrayContaining(["search_leads", "add_note", "set_lead_status", "start_search", "get_action_status"]))
    const found = await modern.callTool({ name: "search_leads", arguments: { query: "Martin" } })
    expect(found.isError).toBeFalsy()
    expect(text(found)).toContain("Plomberie Martin (démo)")
    await modern.close()
    expect((await prisma.mcpToken.findFirstOrThrow({ where: { userId: u.sdr.id } })).lastClient).toBe("Claude Code")

    const legacy = await client(secret, "legacy")
    expect(legacy.initializeResult.protocolVersion).toBe("2025-11-25")
    expect((await legacy.listTools()).tools.map((t) => t.name)).toEqual(listed)
    const today = await legacy.callTool({ name: "get_today", arguments: {} })
    expect(today.isError).toBeFalsy()
    await legacy.close()
  })

  it("checks the mirrored headers, the version, the method and the tool's name", async () => {
    await open()
    const secret = await tokenFor(u.owner)
    const body = async (r: Response) => (await r.json()) as { error?: { code: number; data?: { supported?: string[] } }; result?: { isError?: boolean } }
    let r = await raw(secret, "tools/list", {}, { "mcp-method": null })
    expect([r.status, (await body(r)).error?.code]).toEqual([400, -32020])
    r = await raw(secret, "tools/call", { name: "search_leads", arguments: {} }, { "mcp-name": "add_note" })
    expect([r.status, (await body(r)).error?.code]).toEqual([400, -32020])
    r = await raw(secret, "tools/list", {}, {}, "2027-01-01")
    const unsupported = await body(r)
    expect([r.status, unsupported.error?.code]).toEqual([400, -32022])
    expect(unsupported.error?.data?.supported).toEqual(expect.arrayContaining(["2026-07-28", "2025-11-25"]))
    r = await raw(secret, "resources/list")
    expect([r.status, (await body(r)).error?.code]).toEqual([404, -32601])
    r = await raw(secret, "tools/call", { name: "delete_everything", arguments: {} })
    expect((await body(r)).error?.code).toBe(-32602)
    r = await raw(secret, "tools/call", { name: "add_note", arguments: { leadId } })
    expect((await body(r)).result?.isError).toBe(true)
    r = await server.handleMcp(new Request(ENDPOINT, { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: "[]" }))
    expect(r.status).toBe(400)
  })

  it("offers each role what it may do, and a read-only token reads only", async () => {
    await open()
    const names = async (secret: string) => {
      const c = await client(secret)
      const list = (await c.listTools()).tools.map((t) => t.name)
      await c.close()
      return list
    }
    const closer = await names(await tokenFor(u.closer))
    expect(closer).not.toContain("start_search")
    expect(closer).toContain("add_note")
    expect(await names(await tokenFor(u.sdr))).toContain("start_search")
    const reader = await tokenFor(u.sdr, true)
    const read = await names(reader)
    expect(read).toContain("search_leads")
    expect(read).not.toContain("add_note")
    const c = await client(reader)
    const refused = await c.callTool({ name: "add_note", arguments: { leadId, text: "Rappeler lundi" } })
    expect(refused.isError).toBe(true)
    expect(text(refused)).toMatch(/lecture seule/)
    await c.close()
    expect(await prisma.activity.count({ where: { leadId, kind: "NOTE" } })).toBe(0)
  })

  it("narrows the MCP clients only, through their own row of the matrix", async () => {
    await open()
    await access.updateMcpAccess(u.owner, { actionPolicy: { prospecting: "off" } })
    await expect(access.updateMcpAccess(u.owner, { actionPolicy: { records: "auto" } })).rejects.toThrow(/sans clic/)
    const c = await client(await tokenFor(u.sdr))
    expect((await c.listTools()).tools.map((t) => t.name)).not.toContain("start_search")
    const refused = await c.callTool({ name: "start_search", arguments: { activity: "plombier", location: "Nantes, France" } })
    expect(text(refused)).toMatch(/coupée pour les clients mcp/)
    await c.close()
    expect((await definitions.effectiveAgent(ws, "copilot")).policy.prospecting).toBe("confirm")
    const changed = await prisma.auditLog.findFirstOrThrow({ where: { action: "mcp.policy_changed" } })
    expect(changed.metadata).toMatchObject({ rights: { before: null, after: { prospecting: "off" } } })
  })

  it("writes a note at once, in the member's name, via the client", async () => {
    await open()
    const c = await client(await tokenFor(u.sdr))
    const done = await c.callTool({ name: "add_note", arguments: { leadId, text: "Rappeler lundi pour le devis" } })
    expect(done.isError).toBeFalsy()
    await c.close()
    const note = await prisma.activity.findFirstOrThrow({ where: { leadId, kind: "NOTE" }, include: { actor: { select: { name: true, email: true } } } })
    expect(note.actorId).toBe(u.sdr.id)
    expect(note.data).toMatchObject({ via: { agentId: "mcp", client: "Claude Code" } })
    expect(leads.toActivity(note as never).via).toBe("via Claude Code (MCP)")
    expect(await prisma.mcpCall.findMany({ select: { tool: true, outcome: true, client: true } })).toEqual([{ tool: "add_note", outcome: "DONE", client: "Claude Code" }])
  })

  it("puts a status change in « À valider », even with the copilot switched off, and runs it once approved", async () => {
    await open()
    await definitions.updateAgentDefinition(u.owner, "copilot", { enabled: false })
    const c = await client(await tokenFor(u.sdr))
    const asked = await c.callTool({ name: "set_lead_status", arguments: { leadIds: [leadId], status: "QUALIFIED" } })
    expect(asked.isError).toBeFalsy()
    const pending = JSON.parse(text(asked)) as { pending: boolean; approvalId: string; summary: string; link: string }
    expect(pending).toMatchObject({ pending: true, link: `${ORIGIN}/app/agents?tab=approvals` })
    expect(pending.summary).toMatch(/Qualifié.*Plomberie Martin/)
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe("NEW")
    expect(await prisma.notification.findFirst({ where: { userId: u.sdr.id }, select: { title: true } })).toEqual({ title: "Claude Code attend votre validation" })
    const [view] = await approvals.listApprovals(u.sdr)
    expect(view).toMatchObject({ id: pending.approvalId, agentLabel: "Claude Code (MCP)", canDecide: true })
    expect(text(await c.callTool({ name: "get_action_status", arguments: { approvalId: pending.approvalId } }))).toMatch(/en attente de validation/)

    await approvals.decideApproval(u.sdr, pending.approvalId, { approve: true })
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe("QUALIFIED")
    const run = await prisma.agentRun.findFirstOrThrow({ where: { approvals: { some: { id: pending.approvalId } } } })
    expect(run.status).toBe("SUCCEEDED")
    expect(text(await c.callTool({ name: "get_action_status", arguments: { approvalId: pending.approvalId } }))).toMatch(/validée et faite/)
    await expect(approvals.decideApproval(u.sdr, pending.approvalId, { approve: true })).rejects.toThrow(/déjà été traitée/)
    // The change is journaled as the member's, through the client: in the audit log and in the fiche's history.
    const changed = await prisma.auditLog.findFirstOrThrow({ where: { action: "lead.bulk_update" }, select: { actorId: true, metadata: true } })
    expect(changed.actorId).toBe(u.sdr.id)
    expect(changed.metadata).toMatchObject({ via: { agentId: "mcp", client: "Claude Code", runId: run.id } })
    const history = await prisma.activity.findFirstOrThrow({ where: { leadId, kind: "STATUS_CHANGE" } })
    expect(history.data).toMatchObject({ to: "QUALIFIED", via: { agentId: "mcp", client: "Claude Code" } })
    expect((await prisma.mcpCall.findFirstOrThrow({ where: { tool: "set_lead_status" } })).outcome).toBe("PENDING")
    await c.close()
  })

  it("does nothing when the person refuses", async () => {
    await open()
    const c = await client(await tokenFor(u.sdr))
    const pending = JSON.parse(text(await c.callTool({ name: "set_lead_status", arguments: { leadIds: [leadId], status: "DISQUALIFIED" } }))) as { approvalId: string }
    await approvals.decideApproval(u.manager, pending.approvalId, { approve: false, note: "Pas encore" })
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe("NEW")
    expect(text(await c.callTool({ name: "get_action_status", arguments: { approvalId: pending.approvalId } }))).toMatch(/refusée.*Pas encore/)
    await c.close()
  })

  it("makes what contacts a prospect wait for its own click, with its recipients", async () => {
    await open()
    await prisma.mailbox.create({ data: { workspaceId: ws, ownerId: u.sdr.id, address: "sdr@trycleads.test", displayName: "Sdr Test", smtpHost: "smtp.trycleads.test", smtpPort: 465, smtpSecure: true, username: "sdr@trycleads.test", secret: "sealed", dailyCap: 30, warmupStartedAt: new Date(Date.now() - 60 * 86_400_000) } })
    const seq = await sequences.createSequence(u.sdr, { name: "Relance plombiers", steps: [{ delayDays: 0, subject: "Une question", body: "Bonjour {{prenom|Madame, Monsieur}}." }] })
    const c = await client(await tokenFor(u.sdr))
    const tool = (await c.listTools()).tools.find((t) => t.name === "enroll_in_sequence")
    expect(tool?.description).toMatch(/Contacte un prospect/)
    const pending = JSON.parse(text(await c.callTool({ name: "enroll_in_sequence", arguments: { sequenceId: seq.id, leadIds: [leadId] } }))) as { pending: boolean; summary: string }
    expect(pending.pending).toBe(true)
    expect(pending.summary).toMatch(/Relance plombiers.*Plomberie Martin.*sdr@trycleads\.test/)
    expect(await prisma.sequenceEnrollment.count()).toBe(0)
    await c.close()
  })

  it("refuses what a revoked token left waiting, and stops the token at once", async () => {
    await open()
    const secret = await tokenFor(u.sdr)
    const c = await client(secret)
    const pending = JSON.parse(text(await c.callTool({ name: "set_lead_status", arguments: { leadIds: [leadId], status: "QUALIFIED" } }))) as { approvalId: string }
    await c.close()
    const row = await prisma.mcpToken.findFirstOrThrow({ where: { userId: u.sdr.id } })
    await tokens.revokeToken(u.owner, row.id)
    expect(await prisma.agentApproval.findUniqueOrThrow({ where: { id: pending.approvalId }, select: { status: true, note: true } })).toEqual({ status: "REJECTED", note: "Jeton MCP révoqué" })
    expect((await prisma.agentRun.findFirstOrThrow({ where: { approvals: { some: { id: pending.approvalId } } } })).status).toBe("CANCELLED")
    await expect(approvals.decideApproval(u.sdr, pending.approvalId, { approve: true })).rejects.toThrow(/déjà été traitée/)
    expect((await raw(secret, "ping")).status).toBe(401)
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe("NEW")
  })

  it("lets the owner see and revoke the team's tokens, and nobody else's", async () => {
    await open()
    await tokenFor(u.sdr)
    await tokenFor(u.closer)
    const team = await tokens.listTokens(u.owner, { team: true })
    expect(team.map((t) => t.owner?.name).sort()).toEqual(["Closer Test", "Sdr Test"])
    expect((await tokens.listTokens(u.sdr, { team: true })).map((t) => t.name)).toEqual(["Jeton de Sdr Test"])
    const sdrToken = team.find((t) => t.owner?.id === u.sdr.id)!
    await expect(tokens.revokeToken(u.closer, sdrToken.id)).rejects.toThrow(/introuvable/)
    await expect(tokens.tokenCalls(u.closer, sdrToken.id)).rejects.toThrow(/introuvable/)
    expect((await tokens.revokeToken(u.owner, sdrToken.id)).status).toBe("revoked")
  })

  it("answers 429 past 120 requests a minute for one token", async () => {
    await open()
    const secret = await tokenFor(u.sdr)
    const row = await prisma.mcpToken.findFirstOrThrow({ where: { userId: u.sdr.id } })
    const key = `mcp:${createHash("sha256").update(row.id).digest("hex").slice(0, 24)}`
    await prisma.rateLimitHit.createMany({ data: Array.from({ length: server.RATE_LIMIT.requests }, () => ({ key })) })
    const r = await raw(secret, "ping")
    expect(r.status).toBe(429)
    expect(r.headers.get("retry-after")).toBe("60")
  })
})
