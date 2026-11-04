// E29 lot 2, OAuth for the CRM's MCP server: what clients discover, where a code may go (D41), PKCE, the resource a
// token is bound to, the Client ID Metadata Documents Cleads accepts. No database.
import { describe, expect, it } from "vitest"
import { appOrigin } from "@/features/mcp/names"
import {
  SCOPES,
  authorizationServerMetadata,
  bearerChallenge,
  grantedScope,
  isOurResource,
  mcpResource,
  protectedResourceMetadata,
  requestedAccess,
  resourceMetadataUrl,
} from "@/features/mcp/oauth/metadata"
import { CLAUDE_CODE_CLIENT_ID, appOf, checkRedirectUri, declaredName, redirectMatches } from "@/features/mcp/oauth/redirects"
import { checkDocumentUrl, isPublicAddress, parseClientDocument } from "@/features/mcp/oauth/clients"
import { pkceMatches } from "@/features/mcp/oauth/grants"
import { backTo, readParams } from "@/features/mcp/oauth/authorize"

const origin = appOrigin()

describe("Discovery (RFC 9728, RFC 8414)", () => {
  it("names the MCP server as the resource and Cleads as its authorization server", () => {
    expect(protectedResourceMetadata()).toEqual({
      resource: `${origin}/api/mcp`,
      authorization_servers: [origin],
      scopes_supported: ["crm:read", "crm:write"],
      bearer_methods_supported: ["header"],
      resource_name: "Cleads CRM",
    })
    expect(resourceMetadataUrl()).toBe(`${origin}/.well-known/oauth-protected-resource/api/mcp`)
  })

  it("advertises what Claude and ChatGPT check before they use their metadata document", () => {
    const m = authorizationServerMetadata()
    expect(m.issuer).toBe(origin)
    expect(m.authorization_endpoint).toBe(`${origin}/auth/authorize`)
    expect(m.token_endpoint).toBe(`${origin}/api/oauth/token`)
    expect(m.registration_endpoint).toBe(`${origin}/api/oauth/register`)
    expect(m.code_challenge_methods_supported).toEqual(["S256"])
    // CIMD is used only with both: the flag, and "none" at the token endpoint.
    expect(m.client_id_metadata_document_supported).toBe(true)
    expect(m.token_endpoint_auth_methods_supported).toContain("none")
    expect(m.authorization_response_iss_parameter_supported).toBe(true)
    expect(m.grant_types_supported).toEqual(["authorization_code", "refresh_token"])
    expect(m.scopes_supported).not.toContain("offline_access")
  })

  it("points a 401 at the metadata, with the scopes to ask for, and says invalid_token only for a presented token", () => {
    expect(bearerChallenge()).toBe(`Bearer resource_metadata="${resourceMetadataUrl()}", scope="crm:read crm:write"`)
    expect(bearerChallenge("invalid_token")).toBe(`Bearer error="invalid_token", resource_metadata="${resourceMetadataUrl()}", scope="crm:read crm:write"`)
    // HTTP header values stay ASCII.
    expect(/^[\x20-\x7e]*$/.test(bearerChallenge("invalid_token"))).toBe(true)
  })
})

describe("The resource a token is bound to (RFC 8707)", () => {
  it("accepts the MCP server's address in any case, with or without a trailing slash, or the bare origin", () => {
    const upper = mcpResource().replace(/^https?:\/\/[^/]+/, (m) => m.toUpperCase())
    for (const value of [mcpResource(), `${mcpResource()}/`, upper, origin]) expect(isOurResource(value)).toBe(true)
  })

  it("refuses another path, another host, a fragment or a query", () => {
    for (const value of [`${origin}/api/other`, "https://evil.example/api/mcp", `${mcpResource()}#x`, `${mcpResource()}?a=1`, "not a url"]) expect(isOurResource(value)).toBe(false)
  })
})

describe("Scopes", () => {
  it("offers writing when asked or when no scope of ours is named", () => {
    expect(requestedAccess("crm:read")).toEqual({ write: false })
    expect(requestedAccess("crm:read crm:write")).toEqual({ write: true })
    expect(requestedAccess("crm:write offline_access")).toEqual({ write: true })
    expect(requestedAccess(undefined)).toEqual({ write: true })
    expect(requestedAccess("openid profile")).toEqual({ write: true })
    expect(grantedScope(true)).toBe("crm:read")
    expect(grantedScope(false)).toBe(SCOPES.join(" "))
  })
})

describe("Where a code may go (D41)", () => {
  const ok = (uri: string) => checkRedirectUri(uri).ok

  it("accepts the known services' exact callbacks", () => {
    for (const uri of [
      "https://claude.ai/api/mcp/auth_callback",
      "https://claude.com/api/mcp/auth_callback",
      "https://chatgpt.com/connector_platform_oauth_redirect",
      "https://chatgpt.com/connector/oauth/abc_123-XYZ",
      "https://vscode.dev/redirect",
      "https://insiders.vscode.dev/redirect",
    ]) {
      expect(checkRedirectUri(uri)).toMatchObject({ ok: true, kind: "service" })
    }
  })

  it("accepts an application of the member's computer: loopback on any port, or an installed app's link", () => {
    expect(checkRedirectUri("http://localhost:3118/callback")).toMatchObject({ ok: true, kind: "local" })
    expect(checkRedirectUri("http://127.0.0.1/callback")).toMatchObject({ ok: true, kind: "local" })
    expect(checkRedirectUri("http://[::1]:8080/cb")).toMatchObject({ ok: true, kind: "local" })
    expect(checkRedirectUri("cursor://anysphere.cursor-mcp/oauth/callback")).toMatchObject({ ok: true, kind: "app", app: "cursor" })
    expect(checkRedirectUri("vscode://vscode.github-authentication/did-authenticate")).toMatchObject({ ok: true, kind: "app", app: "vscode" })
  })

  it("refuses any other site, plain http, credentials, fragments and the schemes a page can reach", () => {
    for (const uri of [
      "https://evil.example/callback",
      "https://claude.ai.evil.example/api/mcp/auth_callback",
      "https://claude.ai/api/mcp/other",
      "https://chatgpt.com/connector/oauth/../x",
      "http://claude.ai/api/mcp/auth_callback",
      "http://192.168.1.10/callback",
      "http://user:pass@localhost/callback",
      "http://localhost/callback#x",
      "javascript:alert(1)",
      "data:text/html,hi",
      "file:///etc/passwd",
      "intent://x#Intent;end",
      "web+cleads://x",
      "blob:https://claude.ai/x",
      "",
      "not a url",
    ]) {
      expect(ok(uri), uri).toBe(false)
    }
  })

  it("matches a loopback callback on any port, everything else exactly", () => {
    expect(redirectMatches("http://localhost/callback", "http://localhost:53682/callback")).toBe(true)
    expect(redirectMatches("http://127.0.0.1/callback", "http://127.0.0.1:3000/callback")).toBe(true)
    expect(redirectMatches("http://localhost/callback", "http://127.0.0.1:3000/callback")).toBe(false)
    expect(redirectMatches("http://localhost/callback", "http://localhost:3000/other")).toBe(false)
    expect(redirectMatches("https://claude.ai/api/mcp/auth_callback", "https://claude.ai/api/mcp/auth_callback")).toBe(true)
    expect(redirectMatches("https://claude.ai/api/mcp/auth_callback", "https://claude.ai:444/api/mcp/auth_callback")).toBe(false)
    expect(redirectMatches("cursor://anysphere.cursor-mcp/oauth/callback", "cursor://anysphere.cursor-mcp/oauth/callback2")).toBe(false)
  })

  it("names an application for sure only by a known callback or Claude Code's document", () => {
    const dcr = (name: string) => ({ kind: "DCR" as const, clientId: "cleads-x", name })
    expect(appOf(dcr("Claude"), "https://claude.ai/api/mcp/auth_callback")).toEqual({ name: "Claude", verified: true, destination: "claude.ai", kind: "service" })
    expect(appOf(dcr("ChatGPT impostor"), "https://chatgpt.com/connector_platform_oauth_redirect")).toMatchObject({ name: "ChatGPT", verified: true })
    expect(appOf({ kind: "CIMD", clientId: CLAUDE_CODE_CLIENT_ID, name: "Claude Code" }, "http://localhost:3118/callback")).toMatchObject({ name: "Claude Code", verified: true, kind: "local" })
    // A local application names itself: shown as declared, never verified.
    expect(appOf(dcr("Claude"), "http://localhost:3000/callback")).toMatchObject({ name: "Claude", verified: false, kind: "local", destination: "une application de cet ordinateur (localhost:3000)" })
    expect(appOf(dcr("Cursor"), "cursor://anysphere.cursor-mcp/oauth/callback")).toMatchObject({ name: "Cursor", verified: false, destination: "l’application Cursor (cursor://)" })
    expect(declaredName("  Mon\u0000outil  ")).toBe("Mon outil")
    expect(declaredName("")).toBe("Application MCP")
  })
})

describe("PKCE (RFC 7636)", () => {
  it("checks the verifier against its S256 challenge, with the RFC's own example", () => {
    expect(pkceMatches("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")).toBe(true)
    expect(pkceMatches("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXK", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")).toBe(false)
    // Too short to be a verifier (43 characters at least).
    expect(pkceMatches("short", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")).toBe(false)
  })
})

describe("Client ID Metadata Documents", () => {
  const url = "https://claude.ai/oauth/claude-code-client-metadata"

  it("reads only https documents on a domain, with a path, on the standard port", () => {
    expect(checkDocumentUrl(url)).toBeInstanceOf(URL)
    for (const bad of ["http://claude.ai/x", "https://claude.ai", "https://claude.ai/", "https://1.2.3.4/x", "https://[::1]/x", "https://claude.ai:8443/x", "https://u:p@claude.ai/x", "https://claude.ai/x#f", "https://localhost/x"]) {
      expect(typeof checkDocumentUrl(bad), bad).toBe("string")
    }
  })

  it("fetches from public addresses only", () => {
    expect(isPublicAddress("160.79.104.10")).toBe(true)
    expect(isPublicAddress("2606:4700::1111")).toBe(true)
    for (const address of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "224.0.0.1", "nonsense"]) {
      expect(isPublicAddress(address), address).toBe(false)
    }
  })

  it("accepts a document that names itself and can be a public client", () => {
    const claudeCode = JSON.stringify({ client_id: url, client_name: "Claude Code", redirect_uris: ["http://localhost/callback", "http://127.0.0.1/callback"], token_endpoint_auth_method: "none" })
    expect(parseClientDocument(url, claudeCode)).toEqual({ name: "Claude Code", redirectUris: ["http://localhost/callback", "http://127.0.0.1/callback"] })
    // ChatGPT prefers private_key_jwt but lists "none" too: it then picks "none" with Cleads.
    const chatgpt = JSON.stringify({ client_id: url, client_name: "ChatGPT", redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"], token_endpoint_auth_method: "private_key_jwt", token_endpoint_auth_methods_supported: ["none", "private_key_jwt"] })
    expect(parseClientDocument(url, chatgpt)).toMatchObject({ name: "ChatGPT" })
  })

  it("refuses a document for another address, without callbacks, unreadable, or that cannot be public", () => {
    expect(parseClientDocument(url, JSON.stringify({ client_id: "https://evil.example/doc", redirect_uris: ["http://localhost/cb"] }))).toHaveProperty("error")
    expect(parseClientDocument(url, JSON.stringify({ client_id: url, redirect_uris: [] }))).toHaveProperty("error")
    expect(parseClientDocument(url, "<html>")).toHaveProperty("error")
    expect(parseClientDocument(url, JSON.stringify({ client_id: url, redirect_uris: ["http://localhost/cb"], token_endpoint_auth_method: "private_key_jwt" }))).toHaveProperty("error")
  })
})

describe("The authorization request and its answer", () => {
  it("keeps the known parameters only, first value first", () => {
    expect(readParams({ client_id: ["a", "b"], state: "s", extra: "x", scope: "" })).toEqual({ client_id: "a", state: "s" })
    expect(readParams(new URLSearchParams("response_type=code&code_challenge=c&foo=bar"))).toEqual({ response_type: "code", code_challenge: "c" })
  })

  it("answers at the client's callback with the issuer (RFC 9207), custom schemes included", () => {
    const answer = new URL(backTo("http://localhost:3000/callback?x=1", { code: "abc", state: "st", error: null }))
    expect(Object.fromEntries(answer.searchParams)).toEqual({ x: "1", code: "abc", state: "st", iss: origin })
    expect(backTo("cursor://anysphere.cursor-mcp/oauth/callback", { error: "access_denied" })).toBe(`cursor://anysphere.cursor-mcp/oauth/callback?error=access_denied&iss=${encodeURIComponent(origin)}`)
  })
})
