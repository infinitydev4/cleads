// Measures the list on 10 000 fiches. Opt in (it loads data): PERF=1 TEST_DATABASE_URL=... npx vitest run tests/leads.perf.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { resetDatabase } from "./helpers/reset-db"

const url = process.env.TEST_DATABASE_URL
const suite = url && process.env.PERF ? describe : describe.skip
const N = 10_000

suite(`leads list on ${N} fiches (database)`, () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let svc: typeof import("@/features/leads/service")
  let schemas: typeof import("@/features/leads/schemas")
  let sdr: import("@/lib/auth/guard").CurrentUser
  let manager: import("@/lib/auth/guard").CurrentUser
  const ws = "ws_default"
  const timings: Record<string, number> = {}

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    prisma = (await import("@/lib/prisma")).prisma
    svc = await import("@/features/leads/service")
    schemas = await import("@/features/leads/schemas")
    await resetDatabase(prisma)
    const [a, b] = await Promise.all([
      prisma.user.create({ data: { email: "sdr@perf.test", name: "SDR", role: "SDR", workspaceId: ws } }),
      prisma.user.create({ data: { email: "mgr@perf.test", name: "Manager", role: "MANAGER", workspaceId: ws } }),
    ])
    sdr = { id: a.id, workspaceId: ws, name: "SDR", email: a.email!, image: null, role: "SDR" }
    manager = { id: b.id, workspaceId: ws, name: "Manager", email: b.email!, image: null, role: "MANAGER" }
    // Realistic spread: 8 sectors, 40 cities, 5 statuses, a quarter without an owner, 30 % with an email.
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Company" (id, "workspaceId", name, city, sector, domain, email, phone, "nameKey", "updatedAt")
      SELECT 'pc'||g, '${ws}', 'Entreprise '||g||' '||(ARRAY['Plomberie','Boulangerie','Garage','Cabinet','Atelier'])[1+g%5],
             'Ville'||(g%40), (ARRAY['plombier','boulanger','garagiste','comptable','coiffeur','restaurant','électricien','agent'])[1+g%8],
             'e'||g||'.example.test', CASE WHEN g%10<3 THEN 'c'||g||'@e'||g||'.example.test' END, '+3399000'||lpad(g::text,5,'0'),
             'entreprise '||g||'|ville'||(g%40), now()
      FROM generate_series(1, ${N}) g`)
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Lead" (id, "workspaceId", "companyId", "ownerId", status, score, tags, "updatedAt", "createdAt")
      SELECT 'pl'||g, '${ws}', 'pc'||g, CASE WHEN g%4=0 THEN NULL WHEN g%4=1 THEN '${a.id}' ELSE '${b.id}' END,
             (ARRAY['NEW','NEW','CONTACTED','REPLIED','QUALIFIED'])[1+g%5]::"LeadStatus", g%101,
             CASE WHEN g%50=0 THEN ARRAY['vip'] ELSE ARRAY[]::text[] END, now(), now() - (g||' minutes')::interval
      FROM generate_series(1, ${N}) g`)
    await prisma.$executeRawUnsafe(`ANALYZE "Company"`)
    await prisma.$executeRawUnsafe(`ANALYZE "Lead"`)
  }, 120_000)

  afterAll(async () => {
    process.stderr.write(`\nTIMINGS_MS ${JSON.stringify(timings)}\n`)
    await prisma.$disconnect()
  })

  const time = async (label: string, fn: () => Promise<{ total: number }>) => {
    await fn() // warm the connection and the plan
    const start = performance.now()
    const r = await fn()
    timings[label] = Math.round(performance.now() - start)
    return r
  }
  const f = (over: object = {}) => ({ ...schemas.parseLeadFilters({}), ...over }) as import("@/features/leads/schemas").LeadFilters

  it("opens the default list fast", async () => {
    const r = await time("manager default (score)", () => svc.listLeads(manager, f()))
    expect(r.total).toBe(N)
    expect(timings["manager default (score)"]).toBeLessThan(500)
  })
  it("scopes an SDR to their fiches and the pool", async () => {
    const r = await time("sdr default", () => svc.listLeads(sdr, f()))
    expect(r.total).toBe(5000) // pool (25 %) + own (25 %)
    expect(timings["sdr default"]).toBeLessThan(500)
  })
  it("sorts by name, searches, filters and pages deep", async () => {
    await time("sort by name", () => svc.listLeads(manager, f({ sort: "name", dir: "asc" })))
    await time("text search", () => svc.listLeads(manager, f({ q: "plomberie" })))
    await time("status + owner + score", () => svc.listLeads(manager, f({ status: ["NEW"], owner: "none", minScore: 70 })))
    await time("tag", () => svc.listLeads(manager, f({ tag: "vip" })))
    await time("has email", () => svc.listLeads(manager, f({ hasEmail: true })))
    await time("page 200 of 50", () => svc.listLeads(manager, f({ page: 200 })))
    for (const [label, ms] of Object.entries(timings)) expect(ms, label).toBeLessThan(1000)
  })
  it("never repeats or skips a fiche across pages", async () => {
    const seen = new Set<string>()
    for (const page of [1, 2, 3, 100, 200]) for (const row of (await svc.listLeads(manager, f({ page, pageSize: 50 }))).rows) seen.add(row.id)
    expect(seen.size).toBe(250)
  })
})
