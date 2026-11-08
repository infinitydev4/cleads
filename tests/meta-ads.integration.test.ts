// E30 lot 3: Meta's Ad Library read by the worker — which fiches, how each is tied to its page, the signal ADS_RUNNING
// and its owners' notice, a read asked from the fiche, Meta's limits and the token's notices, and the offers' proof.
// Needs a disposable PostgreSQL with the migrations applied (never your development database):
//   TEST_DATABASE_URL=postgresql://… npx vitest run tests/meta-ads.integration.test.ts
// Meta's API is a fake: nothing leaves the machine, and the token is a made-up string.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { resetDatabase } from "./helpers/reset-db"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

const TOKEN = "EAAintegrationTOKENnotreal"
const DAY = 86_400_000
const now = new Date("2026-11-05T10:00:00Z")

const raw = (id: string, page: string, name: string, o: { start?: string; captions?: string[] } = {}) => ({
  id,
  page_id: page,
  page_name: name,
  ad_delivery_start_time: `${o.start ?? "2026-10-03"}T07:00:00+0000`,
  publisher_platforms: ["facebook", "instagram"],
  ad_creative_link_captions: o.captions ?? [],
  ad_creative_link_titles: [`Offre ${id}`],
})

/** What Meta publishes: by page number, and what a name search finds (with a homonym). */
const BY_PAGE: Record<string, ReturnType<typeof raw>[]> = {
  "111000111": [raw("a1", "111000111", "Garage Martin", { start: "2026-09-01" }), raw("a2", "111000111", "Garage Martin")],
  "222000222": [raw("b1", "222000222", "Plomberie Roche Villeurbanne", { captions: ["PLOMBERIE-ROCHE.EXAMPLE"] })],
}
const BY_NAME: Record<string, ReturnType<typeof raw>[]> = {
  "Plomberie Roche": [...BY_PAGE["222000222"], raw("h1", "333000333", "Plomberie Rocher")],
  "Boulangerie Dupain": [],
  "Atelier Lumen": [],
}

suite("Meta's Ad Library (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let engine: typeof import("@/features/signals/engine")
  let ads: typeof import("@/features/signals/ads")
  let svc: typeof import("@/features/signals/service")
  let evidence: typeof import("@/features/research/evidence")
  let catalog: typeof import("@/features/ai/catalog")
  let queue: typeof import("@/features/ai/queue")
  type U = import("@/lib/auth/guard").CurrentUser
  const u: Record<string, U> = {}
  const ws = "ws_default"

  let expiresInDays = 50
  let failWith: { status: number; body: unknown } | null = null
  let calls: { url: string; auth: string | null }[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const at = new URL(String(input))
    calls.push({ url: at.toString(), auth: new Headers(init?.headers).get("authorization") })
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
    if (at.pathname.endsWith("/debug_token")) return json({ data: { is_valid: true, expires_at: Math.round((now.getTime() + expiresInDays * DAY) / 1000) } })
    if (failWith) return json(failWith.body, failWith.status)
    const pages = at.searchParams.get("search_page_ids")
    const data = pages ? pages.slice(1, -1).split(",").flatMap((p) => BY_PAGE[p] ?? []) : (BY_NAME[at.searchParams.get("search_terms") ?? ""] ?? [])
    return json({ data })
  }) as typeof fetch
  const meta = () => ({ token: TOKEN, fetchImpl, gapMs: 0 })

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    prisma = (await import("@/lib/prisma")).prisma
    engine = await import("@/features/signals/engine")
    ads = await import("@/features/signals/ads")
    svc = await import("@/features/signals/service")
    evidence = await import("@/features/research/evidence")
    catalog = await import("@/features/ai/catalog")
    queue = await import("@/features/ai/queue")
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })
  beforeEach(async () => {
    await resetDatabase(prisma)
    ads.resetAdsState()
    expiresInDays = 50
    failWith = null
    calls = []
    for (const [key, role] of [["owner", "OWNER"], ["sdr", "SDR"], ["viewer", "VIEWER"]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@ads.test`, name: `${key} Test`, role, workspaceId: ws } })
      u[key] = { id: x.id, workspaceId: ws, name: `${key} Test`, email: x.email!, image: null, role }
    }
  })

  /** A fiche of a campaign; the registry already read, so only the ads are left to do. */
  async function fiche(name: string, o: { status?: "ACTIVE" | "DRAFT"; domain?: string; facebook?: string; disqualified?: boolean } = {}) {
    const campaign = await prisma.campaign.create({ data: { workspaceId: ws, name: `Campagne ${name}`, ownerId: u.sdr.id, status: o.status ?? "ACTIVE" } })
    const company = await prisma.company.create({
      data: { workspaceId: ws, name, domain: o.domain ?? null, identityCheckedAt: new Date(), data: o.facebook ? { socials: { facebook: o.facebook } } : {} },
    })
    const lead = await prisma.lead.create({ data: { workspaceId: ws, companyId: company.id, ownerId: u.sdr.id, campaignId: campaign.id, status: o.disqualified ? "DISQUALIFIED" : "NEW" } })
    return { companyId: company.id, leadId: lead.id }
  }
  const adsOfCompany = async (id: string) => ads.adsOf((await prisma.company.findUniqueOrThrow({ where: { id }, select: { data: true } })).data)
  const archive = () => calls.filter((c) => c.url.includes("/ads_archive"))

  it("reads the active campaigns' fiches, ties each to its page, raises ADS_RUNNING and tells the owner", async () => {
    const garage = await fiche("Garage Martin", { facebook: "https://www.facebook.com/profile.php?id=111000111" })
    const plumber = await fiche("Plomberie Roche", { domain: "plomberie-roche.example" })
    const bakery = await fiche("Boulangerie Dupain")
    await fiche("Atelier Lumen", { status: "DRAFT" })
    await fiche("Café du Port", { disqualified: true })

    const work = await engine.claimSignalWork("w1", now, { meta: meta() })
    expect(work?.kind).toBe("ads")
    const ids = work?.kind === "ads" ? work.ids : []
    expect([...ids].sort()).toEqual([garage.companyId, plumber.companyId, bakery.companyId].sort())
    expect(await ads.runAdsBatch(ids, meta(), now)).toEqual({ read: 3, running: 2, signals: 2, error: null })

    expect(await adsOfCompany(garage.companyId)).toMatchObject({ pageId: "111000111", how: "page", active: 2, since: "2026-09-01", platforms: ["FACEBOOK", "INSTAGRAM"] })
    // Found by its name, kept for the domain its ads show; the homonym « Plomberie Rocher » is not taken.
    expect(await adsOfCompany(plumber.companyId)).toMatchObject({ pageId: "222000222", pageName: "Plomberie Roche Villeurbanne", how: "domain", active: 1, domains: ["plomberie-roche.example"] })
    expect(await adsOfCompany(bakery.companyId)).toMatchObject({ pageId: null, active: 0 })

    const signals = await prisma.companySignal.findMany({ where: { kind: "ADS_RUNNING" }, orderBy: { externalKey: "asc" } })
    expect(signals.map((s) => [s.companyId, s.externalKey])).toEqual([
      [garage.companyId, "meta-ads:111000111:2026-11"],
      [plumber.companyId, "meta-ads:222000222:2026-11"],
    ])
    expect(signals[0]).toMatchObject({
      source: "Bibliothèque publicitaire Meta",
      sourceUrl: "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=FR&view_all_page_id=111000111",
      summary: "2 publicités en cours sur Facebook et Instagram, la plus ancienne depuis le 1 septembre 2026.",
      expiresAt: new Date(now.getTime() + 30 * DAY),
    })
    const notes = await prisma.notification.findMany({ where: { userId: u.sdr.id }, orderBy: { title: "asc" } })
    expect(notes.map((n) => n.title)).toEqual(["Publicités Meta : Garage Martin", "Publicités Meta : Plomberie Roche"])

    // The token rode in the header of every call; no search ever had it in its address.
    expect(calls.every((c) => c.auth === `Bearer ${TOKEN}`)).toBe(true)
    expect(archive().every((c) => !c.url.includes(TOKEN))).toBe(true)
    // Read: the known page by its number, the two others by their name.
    expect(archive().map((c) => new URL(c.url).searchParams.get("search_page_ids") ?? new URL(c.url).searchParams.get("search_terms")).sort()).toEqual(["Boulangerie Dupain", "Plomberie Roche", "[111000111]"])
    // Nothing more this week.
    expect(await ads.claimAdsBatch(10, new Date(now.getTime() + 3600_000))).toEqual([])
  })

  it("reads them again a week later by their page numbers, renews the month's signal, and opens a new one next month", async () => {
    const garage = await fiche("Garage Martin", { facebook: "https://www.facebook.com/profile.php?id=111000111" })
    const plumber = await fiche("Plomberie Roche", { domain: "plomberie-roche.example" })
    await ads.adsReady(meta(), now)
    await ads.runAdsBatch(await ads.claimAdsBatch(10, now), meta(), now)
    const notes = await prisma.notification.count()

    const week = new Date(now.getTime() + 8 * DAY)
    const ids = await ads.claimAdsBatch(10, week)
    expect([...ids].sort()).toEqual([garage.companyId, plumber.companyId].sort())
    calls = []
    expect(await ads.runAdsBatch(ids, meta(), week)).toMatchObject({ read: 2, running: 2, signals: 0 })
    // One call for both, by number.
    expect(archive()).toHaveLength(1)
    expect(new Set(new URL(archive()[0].url).searchParams.get("search_page_ids")!.slice(1, -1).split(","))).toEqual(new Set(["111000111", "222000222"]))
    const renewed = await prisma.companySignal.findMany({ where: { kind: "ADS_RUNNING" } })
    expect(renewed).toHaveLength(2)
    for (const s of renewed) expect(s).toMatchObject({ occurredAt: new Date("2026-11-13T00:00:00Z"), expiresAt: new Date(week.getTime() + 30 * DAY) })

    const december = new Date("2026-12-02T10:00:00Z")
    await ads.runAdsBatch(await ads.claimAdsBatch(10, december), meta(), december)
    expect(await prisma.companySignal.count({ where: { kind: "ADS_RUNNING" } })).toBe(4)
    // Still the same advertisers: no news for the owners.
    expect(await prisma.notification.count()).toBe(notes)
  })

  it("reads a fiche asked from its card first, even outside a campaign, and refuses while Meta cannot be read", async () => {
    const lumen = await fiche("Atelier Lumen", { status: "DRAFT" })
    const beat = (state: string) => queue.workerBeat({ id: "w1", version: "test", host: null, startedAt: now, running: 0, meta: { state, expiresAt: "2026-12-20T10:00:00.000Z", checkedAt: now.toISOString() } })
    expect((await svc.registryView(u.sdr, lumen.leadId)).ads).toMatchObject({ meta: null, checkedAt: null, requested: false })
    await expect(svc.requestAdsCheck(u.sdr, lumen.leadId)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("pas branchée") })
    for (const [state, says] of [["missing", "pas branchée"], ["invalid", "renouveler"], ["identity", "facebook.com/ID"]] as const) {
      await beat(state)
      await expect(svc.requestAdsCheck(u.sdr, lumen.leadId)).rejects.toMatchObject({ status: 409, message: expect.stringContaining(says) })
    }
    await beat("expiring")
    expect((await svc.registryView(u.sdr, lumen.leadId)).ads).toMatchObject({ meta: "expiring", tokenExpiresAt: "2026-12-20T10:00:00.000Z" })
    await expect(svc.requestAdsCheck(u.viewer, lumen.leadId)).rejects.toMatchObject({ status: 403 })
    await svc.requestAdsCheck(u.sdr, lumen.leadId)
    expect((await svc.registryView(u.sdr, lumen.leadId)).ads.requested).toBe(true)

    // Out of any active campaign, yet taken at once; then cleared.
    const later = new Date(Date.now() + 60_000)
    expect(await ads.claimAdsBatch(10, later)).toEqual([lumen.companyId])
    await ads.runAdsBatch([lumen.companyId], meta(), later)
    const view = await svc.registryView(u.sdr, lumen.leadId)
    expect(view.ads).toMatchObject({ requested: false, checkedAt: later.toISOString(), active: 0, page: null })
    expect(await ads.claimAdsBatch(10, new Date(later.getTime() + 60_000))).toEqual([])
  })

  it("stops an hour on Meta's rate limit and gives the batch back", async () => {
    const garage = await fiche("Garage Martin", { facebook: "https://www.facebook.com/profile.php?id=111000111" })
    expect(await ads.adsReady(meta(), now)).toBe(true)
    const ids = await ads.claimAdsBatch(10, now)
    failWith = { status: 400, body: { error: { code: 613, message: "Calls to this api have exceeded the rate limit." } } }
    expect(await ads.runAdsBatch(ids, meta(), now)).toMatchObject({ read: 0, error: expect.stringContaining("Limite de Meta") })
    expect((await prisma.company.findUniqueOrThrow({ where: { id: garage.companyId } })).adsCheckedAt).toBeNull()
    expect(await ads.adsReady(meta(), new Date(now.getTime() + 30 * 60_000))).toBe(false)
    failWith = null
    expect(await ads.adsReady(meta(), new Date(now.getTime() + 61 * 60_000))).toBe(true)
    expect(await ads.claimAdsBatch(10, new Date(now.getTime() + 61 * 60_000))).toEqual([garage.companyId])
  })

  it("tells the owners once of a token to renew, refused, or an identity to confirm, and never reads without a token", async () => {
    await fiche("Garage Martin", { facebook: "https://www.facebook.com/profile.php?id=111000111" })
    const owners = () => prisma.notification.findMany({ where: { userId: u.owner.id }, orderBy: { createdAt: "asc" }, select: { title: true } })

    expect(await ads.adsReady({ token: "", fetchImpl }, now)).toBe(false)
    expect(await engine.claimSignalWork("w1", now, { meta: { token: "", fetchImpl } })).toBeNull()
    expect(calls).toEqual([])

    ads.resetAdsState()
    expiresInDays = 5
    expect(await ads.adsReady(meta(), now)).toBe(true)
    expect((await owners()).map((n) => n.title)).toEqual([expect.stringMatching(/^Jeton Meta à renouveler avant le \d+ novembre 2026$/)])
    // Checked again six hours later: the same notice is not sent twice.
    expect(await ads.adsReady(meta(), new Date(now.getTime() + 7 * 3600_000))).toBe(true)
    expect(await owners()).toHaveLength(1)

    failWith = { status: 400, body: { error: { code: 190, message: `Error validating access token: ${TOKEN}` } } }
    const report = await ads.runAdsBatch(await ads.claimAdsBatch(10, now), meta(), now)
    expect(report.error).not.toContain(TOKEN)
    expect(ads.adsTokenState()).toMatchObject({ state: "invalid" })
    expect(await ads.adsReady(meta(), new Date(now.getTime() + 8 * 3600_000))).toBe(true)
    failWith = { status: 400, body: { error: { code: 10, message: "Application does not have permission for this action" } } }
    await ads.runAdsBatch(await ads.claimAdsBatch(10, new Date(now.getTime() + 8 * 3600_000)), meta(), now)
    expect((await owners()).map((n) => n.title)).toEqual([expect.stringMatching(/^Jeton Meta à renouveler/), "Jeton Meta expiré ou refusé", "Meta : identité à confirmer"])
    // Six hours on, the identity is still to confirm and the token still expiring: nothing is told twice.
    expect(await ads.adsReady(meta(), new Date(now.getTime() + 15 * 3600_000))).toBe(true)
    await ads.runAdsBatch(await ads.claimAdsBatch(10, new Date(now.getTime() + 15 * 3600_000)), meta(), now)
    expect(await owners()).toHaveLength(3)
    expect((await prisma.signalSweep.findUniqueOrThrow({ where: { workspaceId: ws } })).metaNotice).toMatch(/^expiring:2026-11-\d{2}:([0-9a-f]{8}) invalid:\1 identity:\1$/)

    // The worker's heartbeat says the state, never the token.
    const state = ads.adsTokenState()!
    await queue.workerBeat({ id: "w1", version: "test", host: null, startedAt: now, running: 0, meta: { state: state.state, expiresAt: state.expiresAt, checkedAt: state.checkedAt } })
    const stored = JSON.stringify((await prisma.aiWorker.findUniqueOrThrow({ where: { id: "w1" } })).meta)
    expect(stored).toContain('"state":"identity"')
    expect(stored).not.toContain(TOKEN)
  })

  it("is the offers' proof of a budget, and catalogue 4 adds the signal to an existing workspace's offers", async () => {
    const garage = await fiche("Garage Martin", { facebook: "https://www.facebook.com/profile.php?id=111000111" })
    await ads.adsReady(meta(), now)
    await ads.runAdsBatch(await ads.claimAdsBatch(10, now), meta(), now)
    const extra = await evidence.researchEvidence(garage.companyId, now)
    expect(extra.signals).toEqual([{ key: "ads_running", evidence: ["R1"] }])
    expect(extra.evidence[0]).toMatchObject({ id: "R1", kind: "source", label: "Bibliothèque publicitaire Meta, relue le 5 novembre 2026", url: expect.stringContaining("view_all_page_id=111000111") })
    // A month after the last read, the sighting is no proof any more.
    expect((await evidence.researchEvidence(garage.companyId, new Date(now.getTime() + 31 * DAY))).signals).toEqual([])

    await catalog.ensureAgentCatalog(ws)
    await prisma.aiSetting.update({ where: { workspaceId: ws }, data: { catalogVersion: 3 } })
    for (const slug of ["landing-conversion", "meta-ads"]) {
      const offer = await prisma.offer.findFirstOrThrow({ where: { workspaceId: ws, slug } })
      await prisma.offer.update({ where: { id: offer.id }, data: { signals: offer.signals.filter((s) => s !== "ads_running") } })
    }
    await catalog.ensureAgentCatalog(ws)
    expect((await prisma.aiSetting.findUniqueOrThrow({ where: { workspaceId: ws } })).catalogVersion).toBe(4)
    for (const slug of ["landing-conversion", "meta-ads"]) expect((await prisma.offer.findFirstOrThrow({ where: { workspaceId: ws, slug } })).signals).toContain("ads_running")
  })
})
