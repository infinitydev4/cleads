// Batches for the closers (9 November 2026): a batch read from the search, filed in its campaign and given to a closer;
// the closers' overview; taking fiches back or deleting them; « sans site » that sees through Facebook links.
// Needs a disposable PostgreSQL with the migrations applied (never your development database):
//   TEST_DATABASE_URL=postgresql://… npx vitest run tests/lots.integration.test.ts
// The Extractor is a fake: nothing leaves the machine.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { resetDatabase } from "./helpers/reset-db"

const BUSINESSES = [
  { id: 1, dedup_key: "k1", name: "Élec Avec Site", city: "Nantes", phone: "0240000001", website: "https://elec-avec-site.example", rating: 4.9, reviews_count: 200 },
  { id: 2, dedup_key: "k2", name: "ABC Élec", city: "Nantes", phone: "0240000002", website: "https://www.facebook.com/abc.elec", rating: 4.6, reviews_count: 31 },
  { id: 3, dedup_key: "k3", name: "Électricité Martin", city: "Rezé", phone: "0240000003", rating: 4.8, reviews_count: 64 },
  { id: 4, dedup_key: "k4", name: "Sans Téléphone", city: "Nantes", rating: 5, reviews_count: 90 },
]

vi.mock("@/lib/extractor/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/extractor/client")>()),
  getExtractorClient: () => ({ businesses: async () => ({ items: BUSINESSES, has_more: false, next_cursor: null }) }),
}))
vi.mock("@/lib/ai/realtime", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/ai/realtime")>()), publishNotifications: vi.fn(async () => {}) }))

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

suite("batches for the closers (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let lots: typeof import("@/features/lots/service")
  let leads: typeof import("@/features/leads/service")
  let schemas: typeof import("@/features/leads/schemas")
  type U = import("@/lib/auth/guard").CurrentUser
  const u: Record<string, U> = {}
  const ws = "ws_default"
  let searchId = ""
  let campaignId = ""

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    prisma = (await import("@/lib/prisma")).prisma
    lots = await import("@/features/lots/service")
    leads = await import("@/features/leads/service")
    schemas = await import("@/features/leads/schemas")
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })
  beforeEach(async () => {
    await resetDatabase(prisma)
    for (const [key, role] of [["owner", "OWNER"], ["manager", "MANAGER"], ["closer", "CLOSER"], ["sdr", "SDR"]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@lots.test`, name: `${key} Test`, role, workspaceId: ws } })
      u[key] = { id: x.id, workspaceId: ws, name: `${key} Test`, email: x.email!, image: null, role }
    }
    campaignId = (await prisma.campaign.create({ data: { workspaceId: ws, name: "Électriciens à Nantes sans site web", ownerId: u.manager.id } })).id
    searchId = (await prisma.extractionSearch.create({ data: { workspaceId: ws, label: "électricien · Nantes", spec: {}, status: "COMPLETED", extractorJobId: "job-1", campaignId } })).id
  })

  it("previews the batch: real sites and missing phones set aside, a Facebook page kept", async () => {
    const p = await lots.lotPreview(u.manager, searchId, { count: 10, noSite: true })
    expect(p).toMatchObject({ found: 4, withSite: 1, noPhone: 1 })
    expect(p.kept.map((c) => [c.name, c.site])).toEqual([["Électricité Martin", "none"], ["ABC Élec", "social"]])
    await expect(lots.lotPreview(u.sdr, searchId, { count: 10, noSite: true })).rejects.toMatchObject({ code: "forbidden" })
  })

  it("files the chosen businesses in the campaign and gives them to the closer, never to someone else", async () => {
    await expect(lots.sendLot(u.manager, searchId, { ids: [2, 3], closerId: u.sdr.id })).rejects.toMatchObject({ code: "invalid" })
    expect(await lots.sendLot(u.manager, searchId, { ids: [2, 3], closerId: u.closer.id })).toMatchObject({ sent: 2, created: 2 })
    const sent = await prisma.lead.findMany({ where: { workspaceId: ws }, include: { company: true } })
    expect(sent.map((l) => [l.company!.name, l.ownerId, l.campaignId]).sort()).toEqual([["ABC Élec", u.closer.id, campaignId], ["Électricité Martin", u.closer.id, campaignId]])
    // The closer sees them in « sans site », the Facebook page included.
    const mine = await leads.listLeads(u.closer, schemas.parseLeadFilters({ focus: "nosite" }))
    expect(mine.rows.map((r) => [r.name, r.site]).sort()).toEqual([["ABC Élec", "social"], ["Électricité Martin", "none"]])
    const [overview] = await lots.closersOverview(u.manager)
    expect(overview).toMatchObject({ id: u.closer.id, leads: 2, calledThisWeek: 0, qualified: 0, meetings: 0 })
    expect((await lots.closerLeads(u.manager, u.closer.id)).map((r) => r.name).sort()).toEqual(["ABC Élec", "Électricité Martin"])
  })

  it("takes fiches back to the pool with their history, and lets only the owner delete for good", async () => {
    await lots.sendLot(u.manager, searchId, { ids: [2, 3], closerId: u.closer.id })
    const [a, b] = await prisma.lead.findMany({ where: { workspaceId: ws }, orderBy: { createdAt: "asc" } })
    await leads.bulkUpdate(u.manager, { ids: [a.id], action: { type: "assign", ownerId: null } })
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: a.id } })).ownerId).toBeNull()
    await expect(lots.deleteLeads(u.manager, [b.id])).rejects.toMatchObject({ code: "forbidden" })
    expect(await lots.deleteLeads(u.owner, [b.id])).toEqual({ deleted: 1 })
    expect(await prisma.lead.count({ where: { id: b.id } })).toBe(0)
  })
})
