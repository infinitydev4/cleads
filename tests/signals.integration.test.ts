// E30 lot 1: the campaign watches of the BODACC, the morning sweep, the registry identity and the exclusions. Needs a
// disposable PostgreSQL with the migrations applied (never your development database):
//   TEST_DATABASE_URL=postgresql://… npx vitest run tests/signals.integration.test.ts
// The BODACC and the annuaire are fakes (tests/helpers/registry-fixtures.ts): nothing leaves the machine.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { resetDatabase } from "./helpers/reset-db"
import { annuaireResult, fakeRegistry, rawNotice, siretOf } from "./helpers/registry-fixtures"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

const PLUMBER = { key: "plumber", label: "plombier", naf: ["43.22A"], keywords: ["plomberie", "chauffagiste"] }
const now = new Date("2026-11-05T07:00:00Z") // 8:00 in Paris

/** The zone's week: two good plumbers (a creation, a takeover), an objection, a restaurant, a closed one, one too new. */
const NOTICES = [
  rawNotice({ id: "N1", family: "creation", day: "2026-11-04", sirens: ["900000011"], person: { nom: "EXEMPLE", prenom: ["Camille", "Marie"], nomCommercial: "ATELIER LUMEN" }, activity: "Travaux de plomberie, chauffage", city: "Villeurbanne", postalCode: "69100", startedOn: "2026-11-01" }),
  rawNotice({ id: "N2", family: "creation", day: "2026-11-04", sirens: ["900000012"], person: { pm: "DISCRETE PLOMBERIE" }, activity: "Plomberie sanitaire" }),
  rawNotice({ id: "N3", family: "creation", day: "2026-11-03", sirens: ["900000013"], person: { pm: "LA BONNE TABLE" }, activity: "Restauration traditionnelle" }),
  rawNotice({ id: "N4", family: "vente", day: "2026-11-04", sirens: ["900000014", "900000015"], person: { pm: "NOUVEAU CHAUFFAGE" }, activity: "Chauffage, plomberie", seller: { pm: "ANCIEN CHAUFFAGE", siren: "900000015" } }),
  rawNotice({ id: "N5", family: "creation", day: "2026-11-04", sirens: ["900000016"], person: { pm: "PLOMBERIE FERMEE" }, activity: "Plomberie" }),
  rawNotice({ id: "N6", family: "creation", day: "2026-11-04", dept: "38", sirens: ["900000018"], person: { pm: "PLOMBERIE ISERE" }, activity: "Plomberie" }),
  rawNotice({ id: "N7", family: "creation", day: "2026-11-05", sirens: ["900000017"], person: { pm: "TOUTE NEUVE" }, activity: "Plomberie" }),
]
const COMPANIES = [
  annuaireResult({ siren: "900000011", name: "EXEMPLE CAMILLE", created: "2026-11-01", band: "NN", city: "Villeurbanne", postalCode: "69100", officers: [{ nom: "EXEMPLE", prenoms: "Camille Marie", qualite: "Entrepreneur individuel" }] }),
  annuaireResult({ siren: "900000012", name: "DISCRETE PLOMBERIE", opposition: true }),
  annuaireResult({ siren: "900000014", name: "NOUVEAU CHAUFFAGE", created: "2019-03-01", band: "02" }),
  annuaireResult({ siren: "900000016", name: "PLOMBERIE FERMEE", active: false }),
]

suite("registry watches and signals (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let watch: typeof import("@/features/signals/watch")
  let watchSvc: typeof import("@/features/signals/watch-service")
  let sweep: typeof import("@/features/signals/sweep")
  let svc: typeof import("@/features/signals/service")
  let identity: typeof import("@/features/enrichment/identity")
  let sequences: typeof import("@/features/outreach/sequences")
  let rules: typeof import("@/features/outreach/rules")
  let qualifier: typeof import("@/features/relevance/handler")
  type U = import("@/lib/auth/guard").CurrentUser
  const u: Record<string, U> = {}
  const ws = "ws_default"
  let net: ReturnType<typeof fakeRegistry>
  const deps = () => ({ bodacc: { fetchImpl: net.fetchImpl }, annuaire: { fetchImpl: net.fetchImpl }, gapMs: 0 })

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    prisma = (await import("@/lib/prisma")).prisma
    watch = await import("@/features/signals/watch")
    watchSvc = await import("@/features/signals/watch-service")
    sweep = await import("@/features/signals/sweep")
    svc = await import("@/features/signals/service")
    identity = await import("@/features/enrichment/identity")
    sequences = await import("@/features/outreach/sequences")
    rules = await import("@/features/outreach/rules")
    qualifier = await import("@/features/relevance/handler")
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })
  beforeEach(async () => {
    await resetDatabase(prisma)
    for (const [key, role] of [["owner", "OWNER"], ["manager", "MANAGER"], ["sdr", "SDR"], ["closer", "CLOSER"], ["viewer", "VIEWER"]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@registry.test`, name: key, role, workspaceId: ws } })
      u[key] = { id: x.id, workspaceId: ws, name: key, email: x.email!, image: null, role }
    }
    net = fakeRegistry(NOTICES, COMPANIES)
  })

  const campaign = (ownerId: string) => prisma.campaign.create({ data: { workspaceId: ws, name: `Plombiers ${Math.random().toString(36).slice(2, 7)}`, ownerId, status: "ACTIVE" } })
  const watchOf = (campaignId: string, ownerId: string) =>
    prisma.campaignWatch.create({ data: { workspaceId: ws, campaignId, ownerId, kinds: ["CREATED", "TAKEOVER"], departments: ["69"], sectors: [PLUMBER], active: true, nextRunAt: now } })
  const pass = async (id: string, at = now) => {
    await prisma.campaignWatch.update({ where: { id }, data: { nextRunAt: at } })
    expect(await watch.claimWatch("w1", at)).toBe(id)
    return watch.runWatch(id, "w1", deps(), at)
  }
  const lead = async (name: string, siren: string, ownerId: string | null, email?: string) => {
    const c = await prisma.company.create({ data: { workspaceId: ws, name, city: "Lyon", siren, siret: siretOf(siren) } })
    const k = email ? await prisma.contact.create({ data: { workspaceId: ws, companyId: c.id, name: "Contact", email } }) : null
    return prisma.lead.create({ data: { workspaceId: ws, companyId: c.id, contactId: k?.id ?? null, ownerId } })
  }

  describe("campaign watches", () => {
    it("imports the zone's new companies of its sectors, with their identity and signals, and tells the owner", async () => {
      const c = await campaign(u.sdr.id)
      const w = await watchOf(c.id, u.sdr.id)
      const r = (await pass(w.id))!
      expect(r).toMatchObject({ from: "2026-10-29", to: "2026-11-05", notices: 6, candidates: 5, created: 2, existing: 0, pending: 1, rejected: { sector: 1, closed: 1, withheld: 1, unknown: 0 }, byKind: { CREATED: 1, TAKEOVER: 1 } })
      expect(net.calls.annuaire.sort()).toEqual(["900000011", "900000012", "900000014", "900000016", "900000017"])

      const leads = await prisma.lead.findMany({ where: { campaignId: c.id }, include: { company: true } })
      expect(leads.map((l) => l.company!.name).sort()).toEqual(["ATELIER LUMEN", "NOUVEAU CHAUFFAGE"])
      const lumen = leads.find((l) => l.company!.name === "ATELIER LUMEN")!
      expect(lumen).toMatchObject({ source: "REGISTRY" })
      expect(lumen.company).toMatchObject({ source: "REGISTRY", siren: "900000011", siret: siretOf("900000011"), nafCode: "43.22A", headcountBand: "NN", sector: "plombier", city: "Villeurbanne", externalId: "siren:900000011" })
      expect(lumen.company!.foundedOn?.toISOString().slice(0, 10)).toBe("2026-11-01")
      expect((lumen.company!.data as { identity: { officers: unknown[] } }).identity.officers).toEqual([{ name: "Camille Exemple", role: "Entrepreneur Individuel" }])

      const signals = await prisma.companySignal.findMany({ orderBy: { kind: "asc" } })
      expect(signals.map((s) => [s.kind, s.externalKey, s.watchId])).toEqual([["CREATED", "bodacc:N1", w.id], ["TAKEOVER", "bodacc:N4", w.id]])
      expect(signals[0].summary).toContain("ATELIER LUMEN")

      expect(await prisma.importBatch.findFirst({ where: { source: "REGISTRY" } })).toMatchObject({ created: 2 })
      const note = await prisma.notification.findFirstOrThrow({ where: { userId: u.sdr.id } })
      expect(note.title).toBe("Veille : 2 nouvelles fiches")
      expect(note.message).toContain("rien n'est envoyé sans votre clic")

      const after = await prisma.campaignWatch.findUniqueOrThrow({ where: { id: w.id } })
      expect(after).toMatchObject({ lockedBy: null, active: true })
      expect(after.cursorDay?.toISOString().slice(0, 10)).toBe("2026-11-05")
      expect(after.nextRunAt?.toISOString()).toBe("2026-11-06T06:30:00.000Z")
      expect(await prisma.auditLog.count({ where: { action: "campaign.watch_run", entityId: w.id } })).toBe(1)
    })

    it("adds nothing when replayed, and looks up again only what it did not take", async () => {
      const c = await campaign(u.sdr.id)
      const w = await watchOf(c.id, u.sdr.id)
      await pass(w.id)
      net.calls.annuaire.length = 0
      const r = (await pass(w.id, new Date("2026-11-05T09:00:00Z")))!
      expect(r).toMatchObject({ from: "2026-11-03", created: 0, pending: 1 })
      expect(net.calls.annuaire.sort()).toEqual(["900000012", "900000016", "900000017"])
      expect(await prisma.lead.count({ where: { campaignId: c.id } })).toBe(2)
      expect(await prisma.companySignal.count()).toBe(2)
    })

    it("stops, and says so, when its owner may no longer import", async () => {
      const c = await campaign(u.sdr.id)
      const w = await watchOf(c.id, u.sdr.id)
      await prisma.user.update({ where: { id: u.sdr.id }, data: { role: "CLOSER" } })
      const r = (await pass(w.id))!
      expect(r.error).toContain("n'a plus les droits")
      expect(await prisma.campaignWatch.findUniqueOrThrow({ where: { id: w.id } })).toMatchObject({ active: false, nextRunAt: null, lockedBy: null })
      expect(await prisma.notification.count({ where: { userId: u.sdr.id, title: { startsWith: "Veille arrêtée" } } })).toBe(1)
      expect(net.calls.bodacc).toBe(0)
      expect(await prisma.lead.count()).toBe(0)
    })

    it("is saved by people who may import, previewed without writing, and reads back seven days when its zone changes", async () => {
      const c = await campaign(u.sdr.id)
      const input = { kinds: ["CREATED" as const], departments: ["69"], sectors: [], active: true }
      await expect(watchSvc.saveWatch(u.closer, c.id, input)).rejects.toMatchObject({ status: 403 })
      const v = await watchSvc.saveWatch(u.sdr, c.id, input)
      expect(v).toMatchObject({ active: true, kinds: ["CREATED"], departments: ["69"], owner: { id: u.sdr.id } })
      await prisma.campaignWatch.update({ where: { campaignId: c.id }, data: { cursorDay: new Date("2026-11-04T00:00:00Z") } })
      await watchSvc.saveWatch(u.sdr, c.id, input)
      expect((await prisma.campaignWatch.findUniqueOrThrow({ where: { campaignId: c.id } })).cursorDay).not.toBeNull()
      await watchSvc.saveWatch(u.manager, c.id, { ...input, departments: ["69", "38"] })
      const saved = await prisma.campaignWatch.findUniqueOrThrow({ where: { campaignId: c.id } })
      expect(saved).toMatchObject({ cursorDay: null, ownerId: u.manager.id })
      expect(await prisma.auditLog.count({ where: { action: "campaign.watch_saved", entityId: c.id } })).toBe(3)

      const p = await watchSvc.previewWatch(u.sdr, c.id, { ...input, departments: ["69", "38"] }, now, { bodacc: { fetchImpl: net.fetchImpl } })
      expect(p).toMatchObject({ from: "2026-10-29", to: "2026-11-05", total: 6, matching: 6, withoutActivity: 0, byKind: { CREATED: 6 } })
      expect(p.sample[0]).toMatchObject({ publishedOn: "2026-11-05", kind: "CREATED" })
      expect(net.calls.annuaire).toEqual([])
      expect(await prisma.lead.count()).toBe(0)
      await expect(watchSvc.previewWatch(u.viewer, c.id, input, now, { bodacc: { fetchImpl: net.fetchImpl } })).rejects.toMatchObject({ status: 403 })
    })
  })

  describe("the morning sweep", () => {
    const sweepNotices = [
      rawNotice({ id: "S1", family: "collective", day: "2026-11-04", dept: "75", sirens: ["900000021"], person: { pm: "BOULANGERIE EXEMPLE" }, judgment: { nature: "Jugement d'ouverture de redressement judiciaire", date: "2026-11-03" } }),
      rawNotice({ id: "S2", family: "modification", day: "2026-11-05", sirens: ["900000022"], person: { pm: "GARAGE EXEMPLE" }, change: "Modification de l'administration." }),
      rawNotice({ id: "S3", family: "radiation", day: "2026-11-05", sirens: ["999999999"], person: { pm: "INCONNUE" } }),
    ]

    it("puts signals on the fiches, sets the legal state, tells their owners, and blocks prospecting until a manager decides", async () => {
      net = fakeRegistry(sweepNotices, [])
      const bakery = await lead("Boulangerie Exemple", "900000021", u.sdr.id, "contact@boulangerie.example.test")
      await lead("Garage Exemple", "900000022", u.manager.id)
      await sweep.ensureSweeps(now)
      await prisma.signalSweep.update({ where: { workspaceId: ws }, data: { nextRunAt: now } })
      expect(await sweep.claimSweep("w1", now)).toBe(ws)
      const r = (await sweep.runSweep(ws, "w1", { bodacc: { fetchImpl: net.fetchImpl } }, now))!
      expect(r).toMatchObject({ from: "2026-11-04", to: "2026-11-05", notices: 3, signals: 2, byKind: { INSOLVENCY: 1, NEW_LEADER: 1 } })
      const company = await prisma.company.findFirstOrThrow({ where: { siren: "900000021" } })
      expect(company).toMatchObject({ legalState: "INSOLVENT" })
      expect(company.legalStateAt?.toISOString().slice(0, 10)).toBe("2026-11-03")
      expect(await prisma.notification.count({ where: { userId: u.sdr.id, title: "Nouveau signal sur une fiche" } })).toBe(1)
      expect(await prisma.notification.count({ where: { userId: u.manager.id } })).toBe(1)

      // Replayed: nothing twice.
      await prisma.signalSweep.update({ where: { workspaceId: ws }, data: { nextRunAt: now } })
      await sweep.claimSweep("w1", now)
      expect((await sweep.runSweep(ws, "w1", { bodacc: { fetchImpl: net.fetchImpl } }, now))!.signals).toBe(0)

      // A sequence refuses it; an SDR cannot lift the block, a manager can, and then it goes in.
      const box = await prisma.mailbox.create({ data: { workspaceId: ws, ownerId: u.sdr.id, address: "box@send.example.test", displayName: "Box", smtpHost: "smtp.example.test", smtpPort: 465, username: "box", secret: "v1.x.x.x", status: "ACTIVE" } })
      const seq = await prisma.sequence.create({ data: { workspaceId: ws, name: "Relance", status: "ACTIVE", steps: { create: [{ position: 1, delayDays: 0, subject: "Bonjour", body: "Bonjour" }] } } })
      const refused = await sequences.enrollLeads(u.sdr, seq.id, { leadIds: [bakery.id], mailboxId: box.id, confirmGeneric: true })
      expect(refused).toMatchObject({ enrolled: 0, skipped: [{ reason: rules.BLOCKER_LABELS.legal_state }] })
      await expect(svc.overrideLegalState(u.sdr, bakery.id)).rejects.toMatchObject({ status: 403 })
      await svc.overrideLegalState(u.manager, bakery.id)
      expect(await prisma.auditLog.count({ where: { action: "lead.legal_override", entityId: bakery.id } })).toBe(1)
      expect(await sequences.enrollLeads(u.sdr, seq.id, { leadIds: [bakery.id], mailboxId: box.id, confirmGeneric: true })).toMatchObject({ enrolled: 1 })
    })

    it("lets Jev's sort file a blocked company as no target, by rule, without a question", async () => {
      const c = await campaign(u.sdr.id)
      const blocked = await lead("En redressement", "900000031", u.sdr.id)
      await prisma.company.update({ where: { id: blocked.companyId! }, data: { legalState: "INSOLVENT", legalStateAt: now } })
      await prisma.lead.update({ where: { id: blocked.id }, data: { campaignId: c.id } })
      const run = await prisma.agentRun.create({ data: { workspaceId: ws, agentId: "qualifier", status: "RUNNING", requestedById: u.sdr.id, campaignId: c.id, capMicros: 0 } })
      const ctx = { id: run.id, workspaceId: ws, agentId: "qualifier" as const, requester: u.sdr, userKey: u.sdr.id, leadId: null }
      const never = () => {
        throw new Error("Jev ne doit pas être interrogé")
      }
      const out = await qualifier.runQualifier({ run: ctx, attempt: 1, input: { leadIds: [blocked.id], chain: 9 }, approved: [], signal: new AbortController().signal }, { decisionModel: never })
      expect(out.output.judged).toBe(1)
      expect(await prisma.leadRelevance.findFirstOrThrow({ where: { leadId: blocked.id } })).toMatchObject({ verdict: "NOT_RELEVANT", outcome: "AUTO", model: "règle" })
    })
  })

  describe("the fiche's registry", () => {
    it("adds a registry officer as a contact once, dismisses a signal, and respects who may write", async () => {
      const l = await lead("Atelier Exemple", "900000041", u.sdr.id)
      await prisma.company.update({ where: { id: l.companyId! }, data: { identityCheckedAt: now, data: { identity: { source: "Annuaire", url: "https://annuaire-entreprises.data.gouv.fr/entreprise/900000041", checkedAt: now.toISOString(), found: true, officers: [{ name: "Camille Exemple", role: "Gérante" }], category: "PME", labels: [], legalForm: "5499" } } } })
      const signal = await prisma.companySignal.create({ data: { workspaceId: ws, companyId: l.companyId!, kind: "NEW_LEADER", occurredAt: now, summary: "Changement dans la direction.", source: "BODACC", externalKey: "bodacc:X1", expiresAt: new Date(now.getTime() + 86_400_000) } })

      const view = await svc.registryView(u.sdr, l.id, now)
      expect(view.officers).toEqual([{ index: 0, name: "Camille Exemple", role: "Gérante", added: false }])
      expect(view.signals[0]).toMatchObject({ label: "Nouveau dirigeant", recent: true })
      await expect(svc.addOfficerContact(u.closer, l.id, 0)).rejects.toMatchObject({ status: 404 })
      const added = await svc.addOfficerContact(u.sdr, l.id, 0)
      expect(added.linked).toBe(true)
      expect(await prisma.contact.findUniqueOrThrow({ where: { id: added.contactId } })).toMatchObject({ role: "EXECUTIVE", source: "REGISTRY", jobTitle: "Gérante" })
      await expect(svc.addOfficerContact(u.sdr, l.id, 0)).rejects.toMatchObject({ status: 409 })
      await svc.dismissSignal(u.sdr, l.id, signal.id)
      expect((await svc.registryView(u.sdr, l.id, now)).signals[0]).toMatchObject({ recent: false, dismissed: true })
      const listed = await svc.recentSignals(u.sdr, {}, now)
      expect(listed).toEqual([])
    })

    it("looks up the companies in batches, and gives back what an interrupted pass left", async () => {
      net = fakeRegistry([], [annuaireResult({ siren: "900000051", name: "PREMIERE", created: "2024-02-01", band: "11" })])
      await prisma.company.create({ data: { workspaceId: ws, name: "Première", siren: "900000051" } })
      await prisma.company.create({ data: { workspaceId: ws, name: "Sans clé" } })
      await prisma.company.create({ data: { workspaceId: ws, name: "Belge", country: "BE", siren: "900000052" } })
      const ids = await identity.claimIdentityBatch(25, now)
      expect(ids).toHaveLength(1)
      expect(await identity.runIdentityBatch(ids, { fetchImpl: net.fetchImpl, gapMs: 0 })).toEqual({ checked: 1, found: 1 })
      expect(await prisma.company.findFirstOrThrow({ where: { siren: "900000051" } })).toMatchObject({ nafCode: "43.22A", headcountBand: "11" })
      expect(await identity.claimIdentityBatch(25, now)).toEqual([])

      await prisma.company.create({ data: { workspaceId: ws, name: "Seconde", siren: "900000053" } })
      const next = await identity.claimIdentityBatch(25, now)
      const stop = new AbortController()
      stop.abort()
      expect(await identity.runIdentityBatch(next, { fetchImpl: net.fetchImpl, gapMs: 0, signal: stop.signal })).toEqual({ checked: 0, found: 0 })
      expect((await prisma.company.findFirstOrThrow({ where: { siren: "900000053" } })).identityCheckedAt).toBeNull()
    })
  })
})
