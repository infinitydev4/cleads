import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import { ExtractorClient, ExtractorError, extractorConfig } from "@/lib/extractor/client"
import { businessToImportRow, bestEmail, externalIdOf } from "@/lib/extractor/mapping"
import { signWebhook, verifyWebhook, WEBHOOK_TOLERANCE_S } from "@/lib/extractor/webhook"
import { summariseHealth, webhookUrl } from "@/features/search/service"
import type { ExtractorBusiness } from "@/lib/extractor/schemas"

const KEY = "super-secret-extractor-key-1234567890"
const cfg = { url: "https://extractor.example.test", apiKey: KEY }
const fail = async (p: Promise<unknown>) => (await p.then(() => null, (e: unknown) => e)) as ExtractorError
const respond = (status: number, body: unknown) => async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status })

describe("extractor client", () => {
  it("reads its configuration from the server environment only", () => {
    expect(extractorConfig({ EXTRACTOR_URL: "https://x.test/", EXTRACTOR_API_KEY: " k " })).toEqual({ url: "https://x.test", apiKey: "k" })
    expect(extractorConfig({ EXTRACTOR_URL: "https://x.test" })).toBeNull()
    expect(extractorConfig({})).toBeNull()
  })

  it("sends the key as a bearer token and the idempotency key on job creation", async () => {
    let seen: { url: string; init: RequestInit } | undefined
    const client = new ExtractorClient(cfg, async (url, init) => {
      seen = { url: String(url), init: init! }
      return new Response(JSON.stringify({ job: { id: "job_1", status: "queued", counters: {} } }), { status: 202 })
    })
    const r = await client.createJob({ query: "plombier", location: "Lyon, France" }, "crm-search-abc")
    expect(r.job.id).toBe("job_1")
    const h = seen!.init.headers as Record<string, string>
    expect(h.Authorization).toBe(`Bearer ${KEY}`)
    expect(h["Idempotency-Key"]).toBe("crm-search-abc")
    expect(seen!.url).toBe("https://extractor.example.test/v1/jobs")
  })

  it.each([
    [401, "unauthorized"], [403, "unauthorized"], [404, "not_found"], [422, "invalid"], [400, "invalid"], [500, "unavailable"], [503, "unavailable"],
  ])("maps HTTP %i to %s", async (status, kind) => {
    const client = new ExtractorClient(cfg, respond(status, { error: { code: "x", message: "message de l’extractor" } }))
    await expect(client.getJob("job_1")).rejects.toMatchObject({ kind, status })
  })

  it("passes on what the extractor says about an invalid request, and never the key", async () => {
    const client = new ExtractorClient(cfg, respond(422, { error: { code: "invalid_spec", message: "one of location, bbox or center+radius_m is required" } }))
    await expect(client.createJob({ location: "" }, "k")).rejects.toThrow("one of location")
    for (const status of [401, 404, 500]) {
      const e = await fail(new ExtractorClient(cfg, respond(status, "garbage")).getJob("j"))
      expect(e.message).not.toContain(KEY)
    }
  })

  it("tells an unreachable extractor from a rejected request, and marks only the first retriable", async () => {
    const down = new ExtractorClient(cfg, async () => { throw new TypeError("fetch failed: connect ECONNREFUSED") })
    const e = await fail(down.health())
    expect(e).toMatchObject({ kind: "unreachable" })
    expect(e.retriable).toBe(true)
    expect(e.message).not.toContain("ECONNREFUSED")
    expect((await fail(new ExtractorClient(cfg, respond(401, {})).health())).retriable).toBe(false)
  })

  it("refuses a response that does not have the expected shape", async () => {
    await expect(new ExtractorClient(cfg, respond(200, { job: { id: "x", status: "weird" } })).getJob("x")).rejects.toMatchObject({ kind: "bad_response" })
    await expect(new ExtractorClient(cfg, respond(200, "<html>proxy error</html>")).getJob("x")).rejects.toMatchObject({ kind: "bad_response" })
  })

  it("ignores fields it does not know", async () => {
    const body = { job: { id: "j", status: "running", counters: { unique: 3, brand_new_counter: 9 }, surprise: true }, extra: 1 }
    expect((await new ExtractorClient(cfg, respond(200, body)).getJob("j")).counters.unique).toBe(3)
  })

  it("builds the results query with the filters", async () => {
    let url = ""
    const client = new ExtractorClient(cfg, async (u) => { url = String(u); return new Response(JSON.stringify({ items: [], has_more: false }), { status: 200 }) })
    await client.businesses("job 1", { cursor: "40", limit: 500, useful: true, has_email: true, min_completeness: 60 })
    expect(url).toBe("https://extractor.example.test/v1/jobs/job%201/businesses?cursor=40&limit=500&useful=true&has_email=true&min_completeness=60")
  })
})

const biz = (over: Partial<ExtractorBusiness> = {}): ExtractorBusiness => ({ id: 7, dedup_key: "pid:ChIJabc", name: "Dupont Plomberie", ...over })

describe("extractor result to CRM row", () => {
  it("keeps a stable identity across searches", () => {
    expect(externalIdOf(biz())).toBe("ext:pid:ChIJabc")
    expect(externalIdOf({ id: 7 })).toBe("ext:id:7")
  })

  it("maps what a prospect needs and keeps the rest aside", () => {
    const m = businessToImportRow(biz({ street: "12 rue A", address: "12 rue A, 69003 Lyon", postal_code: "69003", city: "Lyon", country: "FR", category: "Plombier", phone: "+33472000000", website: "https://dupont.fr", emails: ["contact@dupont.fr", "marie.durand@dupont.fr"], rating: 4.6, reviews_count: 88, completeness: 85, siret: "73282932000074", socials: { facebook: "https://facebook.com/dupont" } }))
    expect("row" in m && m.row).toMatchObject({
      name: "Dupont Plomberie", email: "marie.durand@dupont.fr", phone: "+33472000000", website: "https://dupont.fr", address: "12 rue A", city: "Lyon", postalCode: "69003",
      country: "FR", sector: "Plombier", siret: "73282932000074", externalId: "ext:pid:ChIJabc", rating: 4.6, reviewCount: 88, completeness: 85,
    })
    expect("row" in m && m.row.data).toMatchObject({ otherEmails: ["contact@dupont.fr"], socials: { facebook: "https://facebook.com/dupont" } })
  })

  it("never imports a business closed for good, but keeps a temporarily closed one", () => {
    expect(businessToImportRow(biz({ status: "CLOSED_PERMANENTLY" }))).toEqual({ skip: "closed" })
    expect("row" in businessToImportRow(biz({ status: "CLOSED_TEMPORARILY" }))).toBe(true)
  })

  it("prefers a personal address and tolerates junk", () => {
    expect(bestEmail(["info@x.fr", "paul.martin@x.fr"])).toBe("paul.martin@x.fr")
    expect(bestEmail(["pas-un-mail", "Info@X.fr"])).toBe("info@x.fr")
    expect(bestEmail([])).toBeUndefined()
    expect(bestEmail(undefined)).toBeUndefined()
  })
})

describe("webhook signature", () => {
  const secret = "wh-secret"
  const body = JSON.stringify({ event: "job.completed", job: { id: "job_1", status: "completed" } })
  const now = 1_800_000_000_000
  const ts = String(now / 1000)
  const good = { secret, timestamp: ts, signature: signWebhook(secret, ts, body), body, now }

  it("accepts what the extractor signs: sha256=HMAC(secret, timestamp + '.' + body)", () => {
    expect(verifyWebhook(good)).toEqual({ ok: true })
    // Independent computation (Node crypto, not our helper) of the documented formula.
    expect(good.signature).toBe("sha256=" + createHmac("sha256", secret).update(ts + "." + body).digest("hex"))
  })
  it("refuses a wrong secret, a tampered body and a missing signature", () => {
    expect(verifyWebhook({ ...good, secret: "other" })).toEqual({ ok: false, reason: "bad_signature" })
    expect(verifyWebhook({ ...good, body: body.replace("completed", "failed") })).toEqual({ ok: false, reason: "bad_signature" })
    expect(verifyWebhook({ ...good, signature: null })).toEqual({ ok: false, reason: "missing_headers" })
    expect(verifyWebhook({ ...good, signature: "sha256=" + "0".repeat(64) })).toEqual({ ok: false, reason: "bad_signature" })
    expect(verifyWebhook({ ...good, signature: "sha256=zz" })).toEqual({ ok: false, reason: "bad_signature" })
  })
  it("refuses a replay of an old capture, and anything when no secret is configured", () => {
    expect(verifyWebhook({ ...good, now: now + (WEBHOOK_TOLERANCE_S + 1) * 1000 })).toEqual({ ok: false, reason: "stale" })
    expect(verifyWebhook({ ...good, now: now - (WEBHOOK_TOLERANCE_S + 1) * 1000 })).toEqual({ ok: false, reason: "stale" })
    expect(verifyWebhook({ ...good, timestamp: "abc" })).toEqual({ ok: false, reason: "stale" })
    expect(verifyWebhook({ ...good, secret: undefined })).toEqual({ ok: false, reason: "missing_secret" })
  })
})

describe("webhook url and health summary", () => {
  it("only offers the extractor a callback it can reach and we can verify", () => {
    const secret = { EXTRACTOR_WEBHOOK_SECRET: "s" }
    expect(webhookUrl({ ...secret, NEXT_PUBLIC_APP_URL: "https://cleads.fr" })).toBe("https://cleads.fr/api/webhooks/extractor")
    expect(webhookUrl({ ...secret, NEXT_PUBLIC_APP_URL: "http://localhost:3000" })).toBeUndefined()
    expect(webhookUrl({ ...secret, NEXT_PUBLIC_APP_URL: "http://cleads.fr" })).toBeUndefined()
    expect(webhookUrl({ ...secret, NEXT_PUBLIC_APP_URL: "https://192.168.1.4" })).toBeUndefined()
    expect(webhookUrl({ ...secret, NEXT_PUBLIC_APP_URL: "https://x.test", EXTRACTOR_WEBHOOK_BASE_URL: "https://crm.cleads.fr" })).toBe("https://crm.cleads.fr/api/webhooks/extractor")
    expect(webhookUrl({ NEXT_PUBLIC_APP_URL: "https://cleads.fr" })).toBeUndefined()
  })
  it("names the sources that cannot be used", () => {
    const v = summariseHealth({ status: "degraded", summary: "google_maps_http: blocked\nosm: ok", sources: [{ name: "google_maps_http", verdict: "blocked" }, { name: "osm", verdict: "ok" }, { name: "sirene", verdict: "idle", circuit_open: true }] })
    expect(v).toMatchObject({ state: "degraded", blocked: ["google_maps_http", "sirene"], lines: ["google_maps_http: blocked", "osm: ok"] })
  })
})
