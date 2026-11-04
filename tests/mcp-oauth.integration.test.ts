// E29 lot 2, OAuth for the CRM's MCP server. Needs a disposable PostgreSQL with the migrations applied (never your
// development database):
//   TEST_DATABASE_URL=postgresql://… npx vitest run tests/mcp-oauth.integration.test.ts
// The AI SDK's own OAuth client (`auth`, `authProvider`) discovers, registers, exchanges and refreshes against the real
// handlers through a local fetch; the member's click on the consent screen is the form the page posts. No network: the
// applications' metadata documents come from a fake one.
import { createHash, randomBytes } from "node:crypto"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import type { OAuthAuthorizationServerInformation, OAuthClientInformation, OAuthClientMetadata, OAuthClientProvider, OAuthTokens } from "@ai-sdk/mcp"
import { resetDatabase } from "./helpers/reset-db"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

const ORIGIN = "https://crm.example.test"
const ENDPOINT = `${ORIGIN}/api/mcp`
const CLAUDE_CODE = "https://claude.ai/oauth/claude-code-client-metadata"
const CLAUDE = "https://claude.ai/oauth/mcp-oauth-client-metadata"

/** What an application keeps between the steps of its connection, in memory. */
class Provider implements OAuthClientProvider {
  info: OAuthClientInformation | undefined
  saved: OAuthTokens | undefined
  authorizationUrl: URL | null = null
  private verifier = ""
  private server: OAuthAuthorizationServerInformation | undefined
  private kept: string | undefined
  private registered = false
  constructor(
    readonly redirectUrl: string,
    readonly clientMetadata: OAuthClientMetadata,
    clientId?: string
  ) {
    if (clientId) this.info = { client_id: clientId }
  }
  tokens() {
    return this.saved
  }
  saveTokens(tokens: OAuthTokens) {
    this.saved = tokens
  }
  redirectToAuthorization(authorizationUrl: URL) {
    this.authorizationUrl = authorizationUrl
  }
  saveCodeVerifier(verifier: string) {
    this.verifier = verifier
  }
  codeVerifier() {
    return this.verifier
  }
  clientInformation() {
    return this.info
  }
  saveClientInformation(info: OAuthClientInformation) {
    this.info = info
    this.registered = true
  }
  isClientInformationDynamicallyRegistered() {
    return this.registered
  }
  authorizationServerInformation() {
    return this.server
  }
  saveAuthorizationServerInformation(info: OAuthAuthorizationServerInformation) {
    this.server = info
  }
  state() {
    return randomBytes(8).toString("hex")
  }
  saveState(state: string) {
    this.kept = state
  }
  storedState() {
    return this.kept
  }
}

suite("OAuth for the CRM's MCP server (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let server: typeof import("@/features/mcp/server")
  let http: typeof import("@/features/mcp/oauth/http")
  let clients: typeof import("@/features/mcp/oauth/clients")
  let authorize: typeof import("@/features/mcp/oauth/authorize")
  let grants: typeof import("@/features/mcp/oauth/grants")
  let tokens: typeof import("@/features/mcp/tokens")
  let access: typeof import("@/features/mcp/policy")
  let approvals: typeof import("@/features/ai/approvals")
  let mcp: typeof import("@ai-sdk/mcp")
  type U = import("@/lib/auth/guard").CurrentUser
  const u: Record<string, U> = {}
  const ws = "ws_default"
  let leadId = ""
  let realNetwork: typeof clients.cimdNetwork.fetch
  let realLookup: typeof clients.cimdNetwork.lookup
  const documents = new Map<string, unknown>()

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.NEXT_PUBLIC_APP_URL = ORIGIN
    prisma = (await import("@/lib/prisma")).prisma
    server = await import("@/features/mcp/server")
    http = await import("@/features/mcp/oauth/http")
    clients = await import("@/features/mcp/oauth/clients")
    authorize = await import("@/features/mcp/oauth/authorize")
    grants = await import("@/features/mcp/oauth/grants")
    tokens = await import("@/features/mcp/tokens")
    access = await import("@/features/mcp/policy")
    approvals = await import("@/features/ai/approvals")
    mcp = await import("@ai-sdk/mcp")
    realNetwork = clients.cimdNetwork.fetch
    realLookup = clients.cimdNetwork.lookup
    // The applications' documents, as their hosts would serve them.
    clients.cimdNetwork.lookup = async () => ["160.79.104.10"]
    clients.cimdNetwork.fetch = async (target: string) => (documents.has(target) ? new Response(JSON.stringify(documents.get(target)), { status: 200, headers: { "content-type": "application/json" } }) : new Response("", { status: 404 }))
  })

  afterAll(async () => {
    clients.cimdNetwork.fetch = realNetwork
    clients.cimdNetwork.lookup = realLookup
    await prisma?.$disconnect()
  })

  beforeEach(async () => {
    await resetDatabase(prisma)
    documents.clear()
    documents.set(CLAUDE_CODE, { client_id: CLAUDE_CODE, client_name: "Claude Code", redirect_uris: ["http://localhost/callback", "http://127.0.0.1/callback"], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" })
    documents.set(CLAUDE, { client_id: CLAUDE, client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback", "https://claude.com/api/mcp/auth_callback"], token_endpoint_auth_method: "none" })
    for (const [key, role] of [["owner", "OWNER"], ["sdr", "SDR"], ["viewer", "VIEWER"]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@oauth.test`, name: `${key[0].toUpperCase()}${key.slice(1)} Test`, role, workspaceId: ws } })
      u[key] = { id: x.id, workspaceId: ws, name: x.name!, email: x.email!, image: null, role }
    }
    const company = await prisma.company.create({ data: { workspaceId: ws, name: "Plomberie Martin (démo)", city: "Nantes" } })
    leadId = (await prisma.lead.create({ data: { workspaceId: ws, companyId: company.id, ownerId: u.sdr.id, status: "NEW", source: "EXTRACTOR" } })).id
    await access.updateMcpAccess(u.owner, { enabled: true })
  })

  /** Every request an application sends, to the handler that answers it in production. */
  const route = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init)
    const path = new URL(request.url).pathname
    if (path === "/api/mcp") return server.handleMcp(request)
    if (path === "/.well-known/oauth-protected-resource/api/mcp" || path === "/.well-known/oauth-protected-resource") return http.handleResourceMetadata(request)
    if (path === "/.well-known/oauth-authorization-server") return http.handleServerMetadata(request)
    if (path === "/api/oauth/register") return http.handleRegister(request)
    if (path === "/api/oauth/token") return http.handleToken(request)
    if (path === "/api/oauth/revoke") return http.handleRevoke(request)
    return new Response("Not found", { status: 404 })
  }

  const cursor = () =>
    new Provider("http://127.0.0.1:43123/callback", { client_name: "Cursor", redirect_uris: ["http://127.0.0.1:43123/callback"], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" })
  const claudeCode = (port = 51234) => new Provider(`http://localhost:${port}/callback`, { client_name: "Claude Code", redirect_uris: [`http://localhost:${port}/callback`] }, CLAUDE_CODE)
  const claude = () => new Provider("https://claude.ai/api/mcp/auth_callback", { client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }, CLAUDE)

  /** The consent screen's form, as the page posts it. */
  const decide = (params: URLSearchParams | Record<string, string>, member: U | null, choice: { decision?: "allow" | "deny"; access?: "read" | "write" } = {}, origin = ORIGIN) => {
    const form = new URLSearchParams(params)
    form.set("decision", choice.decision ?? "allow")
    form.set("access", choice.access ?? "write")
    return http.handleDecision(new Request(`${ORIGIN}/api/oauth/authorize`, { method: "POST", headers: { origin, "content-type": "application/x-www-form-urlencoded" }, body: form }), { actor: member, temporaryPassword: false })
  }

  /** The whole connection as an application lives it: discovery, registration or document, the member's click, tokens. */
  const connect = async (provider: Provider, member: U, choice: { access?: "read" | "write" } = {}) => {
    expect(await mcp.auth(provider, { serverUrl: ENDPOINT, fetchFn: route })).toBe("REDIRECT")
    const answer = await decide(provider.authorizationUrl!.searchParams, member, choice)
    expect(answer.status).toBe(303)
    const back = new URL(answer.headers.get("location")!)
    expect(back.searchParams.get("iss")).toBe(ORIGIN)
    const code = back.searchParams.get("code")
    expect(code).toBeTruthy()
    expect(await mcp.auth(provider, { serverUrl: ENDPOINT, authorizationCode: code!, callbackState: back.searchParams.get("state") ?? undefined, callbackIssuer: ORIGIN, fetchFn: route })).toBe("AUTHORIZED")
    return provider.saved!
  }

  const mcpClient = (provider: Provider, clientName = "Cursor") => mcp.experimental_createMCPClient({ transport: { type: "http", url: ENDPOINT, authProvider: provider, fetch: route }, clientName })
  const text = (r: unknown) => (r as { content?: { type: string; text?: string }[] }).content?.[0]?.text ?? ""

  /** A raw call to the MCP endpoint with a bearer, modern era. */
  const ping = (bearer: string) =>
    server.handleMcp(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json", "mcp-protocol-version": "2026-07-28", "mcp-method": "ping" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "test", version: "1" } } } }),
      })
    )

  /** A connection made by hand (a registered public client, our own PKCE pair), for the token endpoint's own checks. */
  const pkce = () => {
    const verifier = randomBytes(32).toString("base64url")
    return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") }
  }
  const register = async (redirect = "http://127.0.0.1:9000/cb", extra: Record<string, unknown> = {}) => {
    const r = await http.handleRegister(new Request(`${ORIGIN}/api/oauth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "Outil local", redirect_uris: [redirect], ...extra }) }))
    return { status: r.status, body: (await r.json()) as Record<string, string> }
  }
  const askCode = async (clientId: string, member: U, opts: { redirect?: string; access?: "read" | "write" } = {}) => {
    const p = pkce()
    const redirect = opts.redirect ?? "http://127.0.0.1:9000/cb"
    const answer = await decide({ response_type: "code", client_id: clientId, redirect_uri: redirect, code_challenge: p.challenge, code_challenge_method: "S256", state: "s1", resource: ENDPOINT, scope: "crm:read crm:write" }, member, { access: opts.access })
    const back = new URL(answer.headers.get("location")!)
    return { code: back.searchParams.get("code")!, verifier: p.verifier, redirect }
  }
  const token = async (form: Record<string, string>) => {
    const r = await http.handleToken(new Request(`${ORIGIN}/api/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form) }))
    return { status: r.status, body: (await r.json()) as Record<string, string> }
  }
  const handConnection = async (member: U, accessLevel: "read" | "write" = "write") => {
    const client = (await register()).body.client_id
    const { code, verifier, redirect } = await askCode(client, member, { access: accessLevel })
    const out = await token({ grant_type: "authorization_code", client_id: client, code, code_verifier: verifier, redirect_uri: redirect, resource: ENDPOINT })
    expect(out.status).toBe(200)
    return { client, access_token: out.body.access_token, refresh_token: out.body.refresh_token }
  }

  it("serves its discovery documents to any origin", async () => {
    const prm = await route(`${ORIGIN}/.well-known/oauth-protected-resource/api/mcp`)
    expect(prm.headers.get("access-control-allow-origin")).toBe("*")
    expect(await prm.json()).toMatchObject({ resource: ENDPOINT, authorization_servers: [ORIGIN] })
    const as = (await (await route(`${ORIGIN}/.well-known/oauth-authorization-server`)).json()) as Record<string, unknown>
    expect(as).toMatchObject({ issuer: ORIGIN, client_id_metadata_document_supported: true, code_challenge_methods_supported: ["S256"] })
    expect((await route(`${ORIGIN}/api/oauth/token`, { method: "OPTIONS" })).status).toBe(204)
    const challenge = (await ping("nothing")).headers.get("www-authenticate")
    expect(challenge).toBe(`Bearer error="invalid_token", resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/mcp", scope="crm:read crm:write"`)
  })

  it("connects an application by registration: 401, discovery, consent in Cleads, tokens, then the CRM's tools", async () => {
    const app = cursor()
    // The application knows nothing yet: its first request is refused, and the refusal says where to sign in.
    await expect(mcpClient(app)).rejects.toThrow()
    expect(app.authorizationUrl?.origin).toBe(ORIGIN)
    expect(app.authorizationUrl?.pathname).toBe("/auth/authorize")
    expect(Object.fromEntries(app.authorizationUrl!.searchParams)).toMatchObject({ response_type: "code", code_challenge_method: "S256", resource: ENDPOINT, scope: "crm:read crm:write" })
    expect(await prisma.mcpOAuthClient.findFirst({ select: { kind: true, name: true, tokenAuthMethod: true } })).toEqual({ kind: "DCR", name: "Cursor", tokenAuthMethod: "none" })

    const back = new URL((await decide(app.authorizationUrl!.searchParams, u.sdr)).headers.get("location")!)
    expect(await mcp.auth(app, { serverUrl: ENDPOINT, authorizationCode: back.searchParams.get("code")!, callbackState: back.searchParams.get("state")!, callbackIssuer: back.searchParams.get("iss")!, fetchFn: route })).toBe("AUTHORIZED")
    expect(app.saved).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "crm:read crm:write" })
    expect(app.saved?.access_token).toMatch(/^cleads_oat_/)
    expect(app.saved?.refresh_token).toMatch(/^cleads_ort_/)

    const c = await mcpClient(app)
    expect(c.instructions).toMatch(/pour Sdr Test \(SDR\)/)
    expect((await c.listTools()).tools.map((t) => t.name)).toEqual(expect.arrayContaining(["search_leads", "add_note", "set_lead_status"]))
    const done = await c.callTool({ name: "add_note", arguments: { leadId, text: "Rappeler lundi" } })
    expect(done.isError).toBeFalsy()
    await c.close()
    const note = await prisma.activity.findFirstOrThrow({ where: { leadId, kind: "NOTE" } })
    expect(note.actorId).toBe(u.sdr.id)
    expect(note.data).toMatchObject({ via: { agentId: "mcp", client: "Cursor" } })

    const [view] = await tokens.listTokens(u.sdr)
    expect(view).toMatchObject({ kind: "connection", name: "Cursor", hint: "", readOnly: false, status: "active", app: { verified: false, kind: "local", destination: "une application de cet ordinateur (127.0.0.1:43123)" } })
    expect(await prisma.auditLog.findFirst({ where: { action: "mcp.oauth_authorized" }, select: { actorId: true, metadata: true } })).toMatchObject({ actorId: u.sdr.id, metadata: { app: "Cursor", readOnly: false } })
    // Nothing secret is kept in clear.
    const stored = JSON.stringify(await prisma.mcpToken.findMany()) + JSON.stringify(await prisma.mcpAccessToken.findMany()) + JSON.stringify(await prisma.mcpOAuthCode.findMany())
    expect(stored).not.toContain(app.saved!.access_token)
    expect(stored).not.toContain(app.saved!.refresh_token!)
    expect(stored).not.toContain(back.searchParams.get("code")!)
  })

  it("connects Claude Code by its metadata document, on whatever port, and reads only when the member says so", async () => {
    const app = claudeCode(61001)
    const saved = await connect(app, u.sdr, { access: "read" })
    expect(saved.scope).toBe("crm:read")
    const row = await prisma.mcpOAuthClient.findUniqueOrThrow({ where: { clientId: CLAUDE_CODE } })
    expect(row).toMatchObject({ kind: "CIMD", name: "Claude Code", tokenAuthMethod: "none" })
    const c = await mcpClient(app, "claude-code")
    const listed = (await c.listTools()).tools.map((t) => t.name)
    expect(listed).toContain("search_leads")
    expect(listed).not.toContain("add_note")
    expect(c.instructions).toMatch(/cet accès est en lecture seule/)
    await c.close()
    const [view] = await tokens.listTokens(u.sdr)
    expect(view).toMatchObject({ name: "Claude Code", readOnly: true, app: { verified: true } })
    // A second session binds another port: the same document, no new registration.
    await connect(claudeCode(61002), u.sdr)
    expect(await prisma.mcpOAuthClient.count()).toBe(1)
  })

  it("shows Claude as Claude, sends its code to claude.ai, and offers only what was asked", async () => {
    const app = claude()
    expect(await mcp.auth(app, { serverUrl: ENDPOINT, fetchFn: route })).toBe("REDIRECT")
    const params = authorize.readParams(app.authorizationUrl!.searchParams)
    const check = await authorize.checkAuthorizationRequest(params, u.sdr)
    expect(check).toMatchObject({ kind: "ok", request: { app: { name: "Claude", verified: true, destination: "claude.ai", kind: "service" }, canWrite: true } })
    const readOnly = await authorize.checkAuthorizationRequest({ ...params, scope: "crm:read" }, u.sdr)
    expect(readOnly).toMatchObject({ kind: "ok", request: { canWrite: false } })
    // Asked for reading only, the access stays reading only whatever the form says.
    const back = new URL((await decide({ ...params, scope: "crm:read" }, u.sdr, { access: "write" })).headers.get("location")!)
    expect(back.origin + back.pathname).toBe("https://claude.ai/api/mcp/auth_callback")
    expect(await prisma.mcpOAuthCode.findFirstOrThrow({ select: { readOnly: true } })).toEqual({ readOnly: true })
  })

  it("refuses what D41 forbids, and shows rather than sends what it cannot trust", async () => {
    expect(await register("https://evil.example/callback")).toMatchObject({ status: 400, body: { error: "invalid_redirect_uri" } })
    expect(await register("http://192.168.1.20/cb")).toMatchObject({ status: 400, body: { error: "invalid_redirect_uri" } })
    expect((await register("cursor://anysphere.cursor-mcp/oauth/callback")).status).toBe(201)
    const secretClient = await register("http://localhost/cb", { token_endpoint_auth_method: "client_secret_post" })
    expect(secretClient.body.client_secret).toMatch(/^cleads_ocs_/)

    documents.set("https://tool.example/client.json", { client_id: "https://tool.example/client.json", client_name: "Claude", redirect_uris: ["https://tool.example/cb"] })
    const p = pkce()
    const base = { response_type: "code", code_challenge: p.challenge, code_challenge_method: "S256", resource: ENDPOINT }
    const lure = await authorize.checkAuthorizationRequest({ ...base, client_id: "https://tool.example/client.json", redirect_uri: "https://tool.example/cb" }, u.sdr)
    expect(lure).toMatchObject({ kind: "problem", title: "Application non admise" })
    const unknown = await authorize.checkAuthorizationRequest({ ...base, client_id: "cleads-nope", redirect_uri: "http://localhost/cb" }, u.sdr)
    expect(unknown).toMatchObject({ kind: "problem", title: "Application non reconnue" })
    const local = (await register()).body.client_id
    const elsewhere = await authorize.checkAuthorizationRequest({ ...base, client_id: local, redirect_uri: "http://127.0.0.1:9000/other" }, u.sdr)
    expect(elsewhere).toMatchObject({ kind: "problem", title: "Adresse de retour inconnue" })
    // The other mistakes go back to the application, with the issuer.
    const plain = await authorize.checkAuthorizationRequest({ ...base, client_id: local, redirect_uri: "http://127.0.0.1:9000/cb", code_challenge_method: "plain" }, u.sdr)
    expect(plain.kind === "redirect" && new URL(plain.url).searchParams.get("error")).toBe("invalid_request")
    const other = await authorize.checkAuthorizationRequest({ ...base, client_id: local, redirect_uri: "http://127.0.0.1:9000/cb", resource: "https://other.example/mcp" }, u.sdr)
    expect(other.kind === "redirect" && new URL(other.url).searchParams.get("error")).toBe("invalid_target")

    // The decision comes from the CRM's own page, by a signed-in member.
    const form = { ...base, client_id: local, redirect_uri: "http://127.0.0.1:9000/cb", state: "s" }
    expect((await decide(form, u.sdr, {}, "https://evil.example")).status).toBe(403)
    const anonymous = await decide(form, null)
    expect(anonymous.headers.get("location")).toMatch(new RegExp(`^${ORIGIN}/auth/login\\?callbackUrl=%2Fauth%2Fauthorize%3F`))
    const denied = new URL((await decide(form, u.sdr, { decision: "deny" })).headers.get("location")!)
    expect(Object.fromEntries(denied.searchParams)).toMatchObject({ error: "access_denied", state: "s", iss: ORIGIN })
    // A role without AI, or MCP switched off: back to the page, which says why.
    expect((await decide(form, u.viewer)).headers.get("location")).toMatch(/\/auth\/authorize\?/)
    expect(await authorize.connectRefusal(u.viewer)).toMatch(/rôle/)
    await access.updateMcpAccess(u.owner, { enabled: false })
    expect(await authorize.connectRefusal(u.sdr)).toMatch(/coupé/)
    expect(await prisma.mcpOAuthCode.count()).toBe(0)
  })

  it("gives a code once, to its client, with its verifier, its callback and its resource, for five minutes", async () => {
    const client = (await register()).body.client_id
    const other = (await register()).body.client_id
    let a = await askCode(client, u.sdr)
    expect(await token({ grant_type: "authorization_code", client_id: client, code: a.code, code_verifier: pkce().verifier, redirect_uri: a.redirect })).toMatchObject({ status: 400, body: { error: "invalid_grant" } })
    a = await askCode(client, u.sdr)
    expect(await token({ grant_type: "authorization_code", client_id: other, code: a.code, code_verifier: a.verifier, redirect_uri: a.redirect })).toMatchObject({ status: 400, body: { error: "invalid_grant" } })
    expect(await token({ grant_type: "authorization_code", client_id: client, code: a.code, code_verifier: a.verifier, redirect_uri: "http://127.0.0.1:9001/cb" })).toMatchObject({ status: 400, body: { error: "invalid_grant" } })
    a = await askCode(client, u.sdr)
    expect(await token({ grant_type: "authorization_code", client_id: client, code: a.code, code_verifier: a.verifier, resource: "https://other.example/mcp" })).toMatchObject({ status: 400, body: { error: "invalid_target" } })
    a = await askCode(client, u.sdr)
    await prisma.mcpOAuthCode.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })
    expect(await token({ grant_type: "authorization_code", client_id: client, code: a.code, code_verifier: a.verifier })).toMatchObject({ status: 400, body: { error: "invalid_grant" } })

    // Presented twice: the second time closes what the first one opened.
    a = await askCode(client, u.sdr)
    const first = await token({ grant_type: "authorization_code", client_id: client, code: a.code, code_verifier: a.verifier, redirect_uri: a.redirect })
    expect(first.status).toBe(200)
    expect((await ping(first.body.access_token)).status).toBe(200)
    expect((await token({ grant_type: "authorization_code", client_id: client, code: a.code, code_verifier: a.verifier, redirect_uri: a.redirect })).body.error).toBe("invalid_grant")
    expect((await ping(first.body.access_token)).status).toBe(401)
    expect(await token({ grant_type: "password", client_id: client })).toMatchObject({ status: 400, body: { error: "unsupported_grant_type" } })
    expect(await token({ grant_type: "authorization_code", client_id: "cleads-unknown", code: "x", code_verifier: a.verifier })).toMatchObject({ status: 401, body: { error: "invalid_client" } })
  })

  it("authenticates a confidential client by its secret, Basic or in the body", async () => {
    const registered = (await register("http://localhost/cb", { token_endpoint_auth_method: "client_secret_basic" })).body
    const a = await askCode(registered.client_id, u.sdr, { redirect: "http://localhost:7000/cb" })
    const basic = (id: string, secret: string) => `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`
    const ask = (authorization: string) =>
      http.handleToken(new Request(`${ORIGIN}/api/oauth/token`, { method: "POST", headers: { authorization, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code: a.code, code_verifier: a.verifier, redirect_uri: a.redirect }) }))
    const wrong = await ask(basic(registered.client_id, "cleads_ocs_wrong"))
    expect(wrong.status).toBe(401)
    expect(wrong.headers.get("www-authenticate")).toMatch(/^Basic/)
    expect((await ask(basic(registered.client_id, registered.client_secret))).status).toBe(200)
  })

  it("turns the refresh token at each use, keeps the access tokens given, and closes a connection whose old token comes back", async () => {
    const c = await handConnection(u.sdr)
    const next = await token({ grant_type: "refresh_token", client_id: c.client, refresh_token: c.refresh_token, resource: ENDPOINT })
    expect(next.status).toBe(200)
    expect(next.body.refresh_token).not.toBe(c.refresh_token)
    // A call already under way with the previous access token still passes until its hour ends.
    expect((await ping(c.access_token)).status).toBe(200)
    expect((await ping(next.body.access_token)).status).toBe(200)
    // The same client twice at once: the late one is refused, nothing more.
    expect((await token({ grant_type: "refresh_token", client_id: c.client, refresh_token: c.refresh_token })).body.error).toBe("invalid_grant")
    expect((await ping(next.body.access_token)).status).toBe(200)
    // Long after, the old token means someone else holds it: the connection is closed.
    await prisma.mcpToken.updateMany({ data: { rotatedAt: new Date(Date.now() - 60_000) } })
    expect((await token({ grant_type: "refresh_token", client_id: c.client, refresh_token: c.refresh_token })).body.error).toBe("invalid_grant")
    expect((await ping(next.body.access_token)).status).toBe(401)
    expect((await token({ grant_type: "refresh_token", client_id: c.client, refresh_token: next.body.refresh_token })).body.error).toBe("invalid_grant")
    expect(await prisma.auditLog.count({ where: { action: "mcp.oauth_refresh_reused" } })).toBe(1)
    // A refresh token never opens the MCP server, and another client cannot use one.
    const d = await handConnection(u.sdr)
    expect((await ping(d.refresh_token)).status).toBe(401)
    expect((await token({ grant_type: "refresh_token", client_id: c.client, refresh_token: d.refresh_token })).body.error).toBe("invalid_grant")
  })

  it("renews an expired access token by itself, through the AI SDK's client, and goes on", async () => {
    const app = cursor()
    await connect(app, u.sdr)
    const before = app.saved!.refresh_token
    await prisma.mcpAccessToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })
    const expired = await ping(app.saved!.access_token)
    expect(expired.status).toBe(401)
    expect(expired.headers.get("www-authenticate")).toMatch(/error="invalid_token"/)
    const c = await mcpClient(app)
    expect((await c.listTools()).tools.length).toBeGreaterThan(5)
    await c.close()
    expect(app.saved!.refresh_token).not.toBe(before)
    const row = await prisma.mcpToken.findFirstOrThrow({ where: { oauthClientId: { not: null } } })
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + 89 * 86_400_000)
  })

  it("closes a connection from Réglages or from the application, and refuses what it left waiting", async () => {
    const app = cursor()
    await connect(app, u.sdr)
    const c = await mcpClient(app)
    const pending = JSON.parse(text(await c.callTool({ name: "set_lead_status", arguments: { leadIds: [leadId], status: "QUALIFIED" } }))) as { approvalId: string }
    const [view] = await approvals.listApprovals(u.sdr)
    expect(view).toMatchObject({ id: pending.approvalId, agentLabel: "Cursor (MCP)" })
    await c.close()
    const row = await prisma.mcpToken.findFirstOrThrow({ where: { oauthClientId: { not: null } } })
    expect((await tokens.revokeToken(u.owner, row.id)).status).toBe("revoked")
    expect(await prisma.agentApproval.findUniqueOrThrow({ where: { id: pending.approvalId }, select: { status: true, note: true } })).toEqual({ status: "REJECTED", note: "Connexion MCP fermée" })
    expect((await ping(app.saved!.access_token)).status).toBe(401)
    expect((await token({ grant_type: "refresh_token", client_id: app.info!.client_id, refresh_token: app.saved!.refresh_token! })).body.error).toBe("invalid_grant")
    await expect(tokens.revokeToken(u.sdr, row.id)).rejects.toThrow(/déjà fermée/)

    // RFC 7009: the application gives its token back.
    const d = await handConnection(u.sdr)
    const r = await http.handleRevoke(new Request(`${ORIGIN}/api/oauth/revoke`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: d.client, token: d.refresh_token }) }))
    expect(r.status).toBe(200)
    expect((await ping(d.access_token)).status).toBe(401)
  })

  it("stops at use when MCP is switched off, and refuses to renew for a deactivated member", async () => {
    const c = await handConnection(u.sdr)
    await access.updateMcpAccess(u.owner, { enabled: false })
    expect((await ping(c.access_token)).status).toBe(403)
    // Switched off, not erased: the connection still renews, and works again once MCP is back.
    const next = await token({ grant_type: "refresh_token", client_id: c.client, refresh_token: c.refresh_token })
    expect(next.status).toBe(200)
    await access.updateMcpAccess(u.owner, { enabled: true })
    expect((await ping(next.body.access_token)).status).toBe(200)
    await prisma.user.update({ where: { id: u.sdr.id }, data: { active: false } })
    expect((await ping(next.body.access_token)).status).toBe(401)
    expect((await token({ grant_type: "refresh_token", client_id: c.client, refresh_token: next.body.refresh_token })).body.error).toBe("invalid_grant")
  })

  it("keeps ten connections a member, closing the least used for an eleventh, and says so before the click", async () => {
    const opened: string[] = []
    for (let i = 0; i < 10; i++) opened.push((await handConnection(u.sdr)).access_token)
    // The first one served lately; the second was never used since.
    await prisma.mcpToken.updateMany({ data: { lastUsedAt: new Date() } })
    const rows = await prisma.mcpToken.findMany({ orderBy: { createdAt: "asc" }, select: { id: true } })
    await prisma.mcpToken.update({ where: { id: rows[1].id }, data: { lastUsedAt: null } })
    expect((await grants.connectionToClose(u.sdr.id))?.id).toBe(rows[1].id)
    await handConnection(u.sdr)
    expect((await ping(opened[1])).status).toBe(401)
    expect((await ping(opened[0])).status).toBe(200)
    expect(await prisma.mcpToken.count({ where: { revokedAt: null } })).toBe(10)
    // Personal tokens count apart.
    expect((await tokens.createToken(u.sdr, { name: "Script" })).secret).toMatch(/^cleads_mcp_/)
  })
})
