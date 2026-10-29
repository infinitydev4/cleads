// Contract and end-to-end tests against a REAL Cleads Extractor (the mock source, in-memory store) and a disposable database.
//   TEST_DATABASE_URL=postgresql://... [EXTRACTOR_BIN=/path/to/cleads-extractor] npx vitest run tests/extractor.integration.test.ts
// Skipped when the extractor binary or the database is not available.
import { spawn, type ChildProcess } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { resetDatabase } from "./helpers/reset-db"
import { signWebhook } from "@/lib/extractor/webhook"

const url = process.env.TEST_DATABASE_URL
const bin = process.env.EXTRACTOR_BIN ?? path.resolve(__dirname, "../../cleads-extractor/bin/cleads-extractor")
const suite = url && existsSync(bin) ? describe : describe.skip

const PORT = 18000 + Math.floor(Math.random() * 1000)
const KEY = "crm-contract-test-key-0123456789"
const SECRET = "wh-secret-contract-test"
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

suite("extractor contract and CRM end to end", () => {
  let proc: ChildProcess
  let prisma: typeof import("@/lib/prisma").prisma
  let client: import("@/lib/extractor/client").ExtractorClient
  let svc: typeof import("@/features/search/service")
  let clientMod: typeof import("@/lib/extractor/client")
  let user: import("@/lib/auth/guard").CurrentUser
  const ws = "ws_default"

  async function waitFor<T>(fn: () => Promise<T | false>, label: string, ms = 30_000) {
    const end = Date.now() + ms
    while (Date.now() < end) {
      const r = await fn()
      if (r) return r
      await sleep(300)
    }
    throw new Error(`timeout waiting for ${label}`)
  }

  beforeAll(async () => {
    proc = spawn(bin, [], {
      env: { ...process.env, APP_ENV: "development", PORT: String(PORT), API_KEYS: `crm:${KEY},admin:admin-contract-test-key-0123456789`, WEBHOOK_SECRET: SECRET, ENABLE_MOCK_SOURCE: "true", ENABLE_GMAPS_SCRAPING: "false", ENABLE_OSM: "false", ENABLE_SIRENE: "false", ENRICH_ENABLED: "false", GEOCODER: "none", LOG_LEVEL: "error", DATABASE_URL: "" },
      stdio: "ignore",
    })
    await waitFor(async () => fetch(`http://127.0.0.1:${PORT}/readyz`).then((r) => r.ok).catch(() => false), "extractor readiness")

    process.env.DATABASE_URL = url
    process.env.EXTRACTOR_URL = `http://127.0.0.1:${PORT}`
    process.env.EXTRACTOR_API_KEY = KEY
    process.env.EXTRACTOR_WEBHOOK_SECRET = SECRET
    prisma = (await import("@/lib/prisma")).prisma
    clientMod = await import("@/lib/extractor/client")
    client = clientMod.getExtractorClient()
    svc = await import("@/features/search/service")
  }, 60_000)

  afterAll(async () => {
    proc?.kill()
    await prisma?.$disconnect()
  })

  beforeEach(async () => {
    await resetDatabase(prisma)
    const u = await prisma.user.create({ data: { email: "sdr@search.test", name: "SDR", role: "SDR", workspaceId: ws } })
    user = { id: u.id, workspaceId: ws, name: "SDR", email: u.email!, image: null, role: "SDR" }
    svc.resetHealthCache()
  })

  const spec = { query: "plombier", center: { lat: 45.76, lng: 4.84 }, radius_m: 3000, sources: ["mock"], max_results: 20 }
  const finished = async (id: string) => waitFor(async () => { const j = await client.getJob(id); return ["completed", "failed", "cancelled"].includes(j.status) ? j : false }, "job end")

  describe("contract", () => {
    it("answers the calls the CRM makes, in the shape it relies on", async () => {
      expect((await client.sectors()).some((s) => s.key === "plumber")).toBe(true)
      const { job } = await client.createJob(spec, `contract-${Date.now()}`)
      expect(job.id).toMatch(/^job_/)
      const done = await finished(job.id)
      expect(done.status).toBe("completed")
      expect(done.counters.unique).toBeGreaterThan(0)
      const page = await client.businesses(job.id, { limit: 5, useful: true })
      expect(page.items.length).toBeGreaterThan(0)
      for (const b of page.items) {
        expect(b.name).toBeTruthy()
        expect(b.dedup_key).toBeTruthy() // the CRM identity of a business
      }
      const health = await client.health()
      expect(health.status).toBe("ok")
      expect(health.sources.map((s) => s.name)).toContain("mock")
      expect((await client.jobErrors(job.id)).summary).toBeDefined()
    })

    it("replays a job creation instead of starting a second one", async () => {
      const key = `idem-${Date.now()}`
      const a = await client.createJob(spec, key)
      const b = await client.createJob(spec, key)
      expect(b.job.id).toBe(a.job.id)
    })

    it("pages through results with a cursor, no repeats", async () => {
      const { job } = await client.createJob({ ...spec, max_results: 40 }, `page-${Date.now()}`)
      await finished(job.id)
      const seen = new Set<number>()
      let cursor: string | undefined
      for (let i = 0; i < 20; i++) {
        const page = await client.businesses(job.id, { cursor, limit: 7 })
        for (const b of page.items) {
          expect(seen.has(b.id)).toBe(false)
          seen.add(b.id)
        }
        if (!page.has_more) break
        cursor = page.next_cursor
      }
      expect(seen.size).toBeGreaterThan(7)
    })

    it("refuses a bad key, an unknown job and an invalid spec with the right kinds", async () => {
      const bad = new clientMod.ExtractorClient({ url: `http://127.0.0.1:${PORT}`, apiKey: "wrong-key-wrong-key-wrong-key-1" })
      await expect(bad.health()).rejects.toMatchObject({ kind: "unauthorized" })
      await expect(client.getJob("job_does_not_exist")).rejects.toMatchObject({ kind: "not_found" })
      await expect(client.createJob({ query: "x", location: "" }, `bad-${Date.now()}`)).rejects.toMatchObject({ kind: "invalid" })
    })
  })

  describe("from search to prospects", () => {
    const input = { activity: "plombier", location: "Lyon, France", enrich: false, maxResults: 20 }

    // The mock source has no geocoder: a client wrapper turns the place name into coordinates, nothing else changes.
    const withCoordinates = () => ({ createJob: (spec: import("@/lib/extractor/client").JobSpecInput, key: string) => client.createJob({ ...spec, location: undefined, center: { lat: 45.76, lng: 4.84 }, radius_m: 3000, sources: ["mock"] }, key) })

    it("starts a search, records it, and follows it to the end", async () => {
      const view = await svc.startSearch(user, input, "203.0.113.5", withCoordinates())
      expect(view).toMatchObject({ label: "plombier — Lyon, France", spec: { activity: "plombier", maxResults: 20 }, createdByName: "SDR" })
      const row = await prisma.extractionSearch.findUniqueOrThrow({ where: { id: view.id } })
      expect(row.extractorJobId).toMatch(/^job_/)
      expect(["QUEUED", "RUNNING", "COMPLETED"]).toContain(row.status)
      expect(await prisma.auditLog.count({ where: { action: "search.started", actorId: user.id } })).toBe(1)
      const final = await waitFor(async () => { const v = await svc.refreshSearch(user, view.id); return v.status === "COMPLETED" ? v : false }, "completion")
      expect(final.counters.unique).toBeGreaterThan(0)
      expect(final.active).toBe(false)
    })

    it("keeps a launch refused by the extractor visible, with its reason, instead of losing it", async () => {
      const refusing = { createJob: async () => { throw new clientMod.ExtractorError("invalid", "one of location, bbox or center+radius_m is required", 422, "invalid_spec") } }
      await expect(svc.startSearch(user, input, null, refusing)).rejects.toMatchObject({ kind: "invalid" })
      const failed = await prisma.extractionSearch.findFirstOrThrow()
      expect(failed).toMatchObject({ status: "FAILED", extractorJobId: null })
      expect(failed.error).toContain("location")
      expect(failed.finishedAt).not.toBeNull()
      // A refused launch does not count as a running search.
      expect(await prisma.extractionSearch.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } })).toBe(0)
    })

    it("shows a search the extractor accepted but could not run (a place it cannot locate)", async () => {
      const view = await svc.startSearch(user, input) // real client: the place name cannot be resolved without a geocoder
      const final = await waitFor(async () => { const v = await svc.refreshSearch(user, view.id); return v.active ? false : v }, "terminal state")
      expect(["FAILED", "COMPLETED"]).toContain(final.status)
      if (final.status === "COMPLETED") expect(final.counters.unique).toBe(0)
      else expect(final.error).toBeTruthy()
    })

    it("does not start a second search when the same one is retried", async () => {
      const first = await svc.startSearch(user, input, null, withCoordinates())
      const row = await prisma.extractionSearch.findUniqueOrThrow({ where: { id: first.id } })
      const replay = await client.createJob({ query: "plombier", center: { lat: 45.76, lng: 4.84 }, radius_m: 3000, sources: ["mock"], max_results: 20, language: "fr", enrich: false }, `crm-search-${first.id}`)
      expect(replay.job.id).toBe(row.extractorJobId)
    })

    it("imports a finished job once, and importing it again adds nothing", async () => {
      const { job } = await client.createJob(spec, `import-${Date.now()}`)
      await finished(job.id)
      const row = await prisma.extractionSearch.create({ data: { workspaceId: ws, createdById: user.id, extractorJobId: job.id, label: "plombier — Lyon", spec: input, status: "COMPLETED" } })

      const preview = await svc.importSearch(user, row.id, { commit: false, useful: true, hasEmail: false, minCompleteness: 0 })
      expect(preview.committed).toBe(false)
      expect(preview.summary.created).toBeGreaterThan(0)
      expect(await prisma.lead.count()).toBe(0)

      const done = await svc.importSearch(user, row.id, { commit: true, useful: true, hasEmail: false, minCompleteness: 0 })
      expect(done.summary.created).toBe(preview.summary.created)
      const leads = await prisma.lead.findMany({ include: { company: true } })
      expect(leads.length).toBe(done.summary.created)
      expect(leads.every((l) => l.source === "EXTRACTOR" && l.company?.externalId?.startsWith("ext:"))).toBe(true)
      expect(leads.some((l) => l.company?.rating != null && l.company?.completeness != null)).toBe(true)
      expect(await prisma.importBatch.count({ where: { extractorJobId: job.id, source: "EXTRACTOR" } })).toBe(1)
      expect((await prisma.extractionSearch.findUniqueOrThrow({ where: { id: row.id } })).importedCount).toBe(done.summary.created)

      const again = await svc.importSearch(user, row.id, { commit: true, useful: true, hasEmail: false, minCompleteness: 0 })
      expect(again.summary.created).toBe(0)
      expect(again.summary.existing).toBe(done.summary.created)
      expect(await prisma.lead.count()).toBe(leads.length)
    })

    it("a person cannot import without results, and filters narrow what is imported", async () => {
      const { job } = await client.createJob(spec, `filter-${Date.now()}`)
      await finished(job.id)
      const row = await prisma.extractionSearch.create({ data: { workspaceId: ws, createdById: user.id, extractorJobId: job.id, label: "x", spec: input, status: "COMPLETED" } })
      await expect(svc.importSearch(user, row.id, { commit: true, useful: true, hasEmail: true, minCompleteness: 100 })).rejects.toMatchObject({ code: "conflict" })
      const all = await svc.importSearch(user, row.id, { commit: false, useful: false, hasEmail: false, minCompleteness: 0 })
      const strict = await svc.importSearch(user, row.id, { commit: false, useful: true, hasEmail: false, minCompleteness: 70 })
      expect(strict.summary.created).toBeLessThanOrEqual(all.summary.created)
    })

    it("lists, follows and cancels", async () => {
      const { job } = await client.createJob({ ...spec, max_results: 20 }, `follow-${Date.now()}`)
      const row = await prisma.extractionSearch.create({ data: { workspaceId: ws, createdById: user.id, extractorJobId: job.id, label: "suivi", spec: input, status: "QUEUED" } })
      const final = await waitFor(async () => { const v = await svc.refreshSearch(user, row.id); return v.status === "COMPLETED" ? v : false }, "search completion")
      expect(final.counters.unique).toBeGreaterThan(0)
      expect(final.finishedAt).not.toBeNull()
      expect((await svc.listSearches(user)).map((s) => s.id)).toContain(row.id)
      await expect(svc.cancelSearch(user, row.id)).rejects.toMatchObject({ code: "conflict" })
      const results = await svc.searchResults(user, row.id, { useful: true, hasEmail: false, minCompleteness: 0, limit: 5 })
      expect(results.rows.length).toBeGreaterThan(0)
      expect(Object.keys(results.rows[0])).not.toContain("apiKey")
    })

    it("limits how many searches one person runs at once", async () => {
      for (let i = 0; i < svc.MAX_ACTIVE_SEARCHES_PER_USER; i++) await prisma.extractionSearch.create({ data: { workspaceId: ws, createdById: user.id, label: `en cours ${i}`, spec: input, status: "RUNNING", extractorJobId: `job_fake_${i}` } })
      await expect(svc.startSearch(user, input)).rejects.toMatchObject({ code: "conflict" })
    })
  })

  describe("completion webhook", () => {
    const send = (job: object, over: { secret?: string; ts?: string; event?: string } = {}) => {
      const body = JSON.stringify({ event: over.event ?? "job.completed", job })
      const ts = over.ts ?? String(Math.floor(Date.now() / 1000))
      return svc.handleExtractorWebhook(body, new Headers({ "x-cleads-timestamp": ts, "x-cleads-signature": signWebhook(over.secret ?? SECRET, ts, body) }))
    }
    const job = (id: string, status = "completed") => ({ id, status, counters: { unique: 12, crm_useful: 9 } })
    const mkSearch = () => prisma.extractionSearch.create({ data: { workspaceId: ws, createdById: user.id, extractorJobId: "job_wh_1", label: "plombier — Lyon", spec: {}, status: "RUNNING" } })

    it("finishes the search and notifies the person once, even when delivered twice", async () => {
      const s = await mkSearch()
      expect((await send(job("job_wh_1"))).status).toBe(200)
      expect((await send(job("job_wh_1"))).status).toBe(200)
      const row = await prisma.extractionSearch.findUniqueOrThrow({ where: { id: s.id } })
      expect(row).toMatchObject({ status: "COMPLETED" })
      expect(row.finishedAt).not.toBeNull()
      const notes = await prisma.notification.findMany({ where: { userId: user.id } })
      expect(notes).toHaveLength(1)
      expect(notes[0].message).toContain("12 entreprises")
    })

    it("rejects forged, stale or unsigned deliveries and leaves the search alone", async () => {
      const s = await mkSearch()
      expect((await send(job("job_wh_1"), { secret: "attacker" })).status).toBe(401)
      expect((await send(job("job_wh_1"), { ts: String(Math.floor(Date.now() / 1000) - 3600) })).status).toBe(401)
      expect((await svc.handleExtractorWebhook("{}", new Headers())).status).toBe(401)
      expect((await prisma.extractionSearch.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("RUNNING")
      expect(await prisma.notification.count()).toBe(0)
    })

    it("acknowledges jobs that are not ours and refuses malformed payloads", async () => {
      expect(await send(job("job_somebody_else"))).toMatchObject({ status: 200, body: { ignored: true } })
      const body = "not json"
      const ts = String(Math.floor(Date.now() / 1000))
      expect((await svc.handleExtractorWebhook(body, new Headers({ "x-cleads-timestamp": ts, "x-cleads-signature": signWebhook(SECRET, ts, body) }))).status).toBe(400)
    })

    it("records a failure with its reason in the notification", async () => {
      await mkSearch()
      await send({ ...job("job_wh_1", "failed"), error: "no source available" }, { event: "job.failed" })
      const row = await prisma.extractionSearch.findFirstOrThrow()
      expect(row).toMatchObject({ status: "FAILED", error: "no source available" })
      expect((await prisma.notification.findFirstOrThrow()).title).toBe("Recherche en échec")
    })
  })

  describe("health", () => {
    it("reports the extractor state and caches it briefly", async () => {
      const h = await svc.extractorHealth()
      expect(h.state).toBe("ok")
      expect(await svc.extractorHealth()).toBe(h)
    })
    it("says so when the extractor is not configured or unreachable, instead of failing", async () => {
      const saved = process.env.EXTRACTOR_URL
      process.env.EXTRACTOR_URL = "http://127.0.0.1:9"
      svc.resetHealthCache()
      expect((await svc.extractorHealth()).state).toBe("unreachable")
      delete process.env.EXTRACTOR_URL
      svc.resetHealthCache()
      expect((await svc.extractorHealth()).state).toBe("not_configured")
      process.env.EXTRACTOR_URL = saved
    })
  })
})
