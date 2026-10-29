// Needs a disposable PostgreSQL with the migrations applied (never your development database):
//   TEST_DATABASE_URL=postgresql://... npx vitest run tests/leads.integration.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { resetDatabase } from "./helpers/reset-db"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

suite("leads (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let svc: typeof import("@/features/leads/service")
  let imp: typeof import("@/features/leads/import")
  let dup: typeof import("@/features/leads/duplicates")
  let views: typeof import("@/features/leads/views")
  let schemas: typeof import("@/features/leads/schemas")

  type U = import("@/lib/auth/guard").CurrentUser
  const users: Record<string, U> = {}
  const ws = "ws_default"

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    prisma = (await import("@/lib/prisma")).prisma
    svc = await import("@/features/leads/service")
    imp = await import("@/features/leads/import")
    dup = await import("@/features/leads/duplicates")
    views = await import("@/features/leads/views")
    schemas = await import("@/features/leads/schemas")
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await resetDatabase(prisma)
    for (const [key, role] of [["owner", "OWNER"], ["manager", "MANAGER"], ["sdr", "SDR"], ["sdr2", "SDR"], ["closer", "CLOSER"], ["viewer", "VIEWER"]] as const) {
      const u = await prisma.user.create({ data: { email: `${key}@leads.test`, name: key, role, workspaceId: ws } })
      users[key] = { id: u.id, workspaceId: ws, name: key, email: u.email!, image: null, role }
    }
  })

  const filters = (over: Partial<import("@/features/leads/schemas").LeadFilters> = {}) => ({ ...schemas.parseLeadFilters({}), ...over })
  const mk = (actor: U, name: string, extra: object = {}) => svc.createLead(actor, { company: { name, city: "Lyon", ...extra } } as never)
  const rawLead = async (name: string, ownerId: string | null, extra: Record<string, unknown> = {}) => {
    const c = await prisma.company.create({ data: { workspaceId: ws, name, ...extra } })
    return prisma.lead.create({ data: { workspaceId: ws, companyId: c.id, ownerId, source: "MANUAL" } })
  }

  describe("who sees what", () => {
    it("scopes the list by role: pool for SDR, own plus linked for closers, all for viewers", async () => {
      const mine = await rawLead("A mine", users.sdr.id)
      const pool = await rawLead("B pool", null)
      const theirs = await rawLead("C theirs", users.sdr2.id)
      const linked = await rawLead("D linked", users.sdr2.id)
      const closerOwn = await rawLead("E closer own", users.closer.id)
      await prisma.deal.create({ data: { workspaceId: ws, leadId: linked.id, ownerId: users.closer.id } })
      const ids = async (u: U) => (await svc.listLeads(u, filters())).rows.map((r) => r.id).sort()

      expect(await ids(users.sdr)).toEqual([mine.id, pool.id].sort())
      expect(await ids(users.closer)).toEqual([closerOwn.id, linked.id].sort())
      expect(await ids(users.viewer)).toHaveLength(5)
      expect(await ids(users.manager)).toHaveLength(5)
      await expect(svc.getLead(users.sdr, theirs.id)).rejects.toMatchObject({ code: "not_found" })
      await expect(svc.getLead(users.closer, pool.id)).rejects.toMatchObject({ code: "not_found" })
    })

    it("a person cannot read another's fiche by changing the filters", async () => {
      await rawLead("Secret", users.sdr2.id)
      const all = await svc.listLeads(users.sdr, filters({ owner: users.sdr2.id }))
      expect(all.total).toBe(0)
    })

    it("filters, sorts and pages without gaps or repeats", async () => {
      for (let i = 0; i < 25; i++) {
        const c = await prisma.company.create({ data: { workspaceId: ws, name: `Entreprise ${String(i).padStart(2, "0")}`, city: i % 2 ? "Lyon" : "Nantes", sector: "plombier", email: i % 3 ? null : `x${i}@x${i}.fr` } })
        await prisma.lead.create({ data: { workspaceId: ws, companyId: c.id, score: i % 5 === 0 ? 50 : 10, status: i < 5 ? "CONTACTED" : "NEW", tags: i < 3 ? ["vip"] : [] } })
      }
      const seen = new Set<string>()
      for (let page = 1; page <= 3; page++) {
        const r = await svc.listLeads(users.manager, filters({ pageSize: 10, page, sort: "score" }))
        expect(r.total).toBe(25)
        for (const row of r.rows) {
          expect(seen.has(row.id)).toBe(false)
          seen.add(row.id)
        }
      }
      expect(seen.size).toBe(25)
      expect((await svc.listLeads(users.manager, filters({ q: "nantes" }))).total).toBe(13)
      expect((await svc.listLeads(users.manager, filters({ status: ["CONTACTED"] }))).total).toBe(5)
      expect((await svc.listLeads(users.manager, filters({ tag: "vip" }))).total).toBe(3)
      expect((await svc.listLeads(users.manager, filters({ hasEmail: true }))).total).toBe(9)
      expect((await svc.listLeads(users.manager, filters({ minScore: 50 }))).total).toBe(5)
      const byName = await svc.listLeads(users.manager, filters({ sort: "name", dir: "asc", pageSize: 3 }))
      expect(byName.rows.map((r) => r.name)).toEqual(["Entreprise 00", "Entreprise 01", "Entreprise 02"])
    })
  })

  describe("creating", () => {
    it("assigns SDRs their own fiche, scores it and records the creation", async () => {
      const { id } = await mk(users.sdr, "Dupont Plomberie", { email: "marie.durand@dupont.fr", phone: "01 23 45 67 89", website: "https://www.dupont.fr" })
      const lead = await svc.getLead(users.sdr, id)
      expect(lead.ownerId).toBe(users.sdr.id)
      expect(lead.score).toBeGreaterThan(0)
      expect(lead.company).toMatchObject({ domain: "dupont.fr", phone: "+33123456789" })
      expect(lead.activities.some((a) => a.body?.includes("créée"))).toBe(true)
      expect((await svc.getLead(users.manager, (await mk(users.manager, "Sans propriétaire")).id)).ownerId).toBeNull()
    })

    it("refuses duplicates and tells where the existing fiche is", async () => {
      const { id } = await mk(users.manager, "Dupont Plomberie", { phone: "0123456789", website: "https://dupont.fr" })
      await expect(mk(users.manager, "DUPONT PLOMBERIE SARL")).rejects.toMatchObject({ code: "duplicate", extra: { leadId: id, reason: "nameKey" } })
      await expect(mk(users.manager, "Autre nom", { city: "Paris", phone: "+33 1 23 45 67 89" })).rejects.toMatchObject({ code: "duplicate", extra: { reason: "phone" } })
      await expect(mk(users.manager, "Encore un", { city: "Paris", website: "http://www.dupont.fr/contact" })).rejects.toMatchObject({ code: "duplicate", extra: { reason: "domain" } })
    })

    it("explains a bad value instead of dropping it", async () => {
      await expect(mk(users.manager, "X Corp", { email: "pas-un-email" })).rejects.toMatchObject({ code: "invalid" })
      await expect(mk(users.manager, "X Corp", { phone: "123" })).rejects.toMatchObject({ code: "invalid" })
      await expect(mk(users.manager, "X Corp", { siret: "12345678901234" })).rejects.toMatchObject({ code: "invalid" })
    })

    it("a suppressed address is blocked from the start", async () => {
      await prisma.suppression.create({ data: { workspaceId: ws, email: "stop@x.fr", reason: "UNSUBSCRIBED" } })
      const { id } = await svc.createLead(users.sdr, { company: { name: "Bloquée", city: "Lyon" }, contact: { email: "stop@x.fr" } } as never)
      const lead = await svc.getLead(users.sdr, id)
      expect(lead.status).toBe("DO_NOT_CONTACT")
      expect(lead.contact?.doNotContact).toBe(true)
    })
  })

  describe("editing", () => {
    it("lets people edit their own and the pool, not a colleague's", async () => {
      const pool = await rawLead("Pool", null)
      const theirs = await rawLead("Theirs", users.sdr2.id)
      await svc.updateLead(users.sdr, pool.id, { company: { city: "Nice" } })
      expect((await svc.getLead(users.sdr, pool.id)).company?.city).toBe("Nice")
      await expect(svc.updateLead(users.sdr, theirs.id, { tags: ["x"] })).rejects.toMatchObject({ code: "not_found" })
      await expect(svc.updateLead(users.closer, pool.id, { tags: ["x"] })).rejects.toMatchObject({ code: "not_found" })
    })

    it("assignment: managers assign anyone, others only themselves", async () => {
      const lead = await rawLead("Assign me", null)
      await expect(svc.updateLead(users.sdr, lead.id, { ownerId: users.sdr2.id })).rejects.toMatchObject({ code: "forbidden" })
      await svc.updateLead(users.sdr, lead.id, { ownerId: users.sdr.id })
      await svc.updateLead(users.manager, lead.id, { ownerId: users.closer.id })
      expect((await svc.getLead(users.manager, lead.id)).ownerId).toBe(users.closer.id)
      await expect(svc.updateLead(users.manager, lead.id, { ownerId: users.viewer.id })).rejects.toMatchObject({ code: "invalid" })
      const history = (await svc.getLead(users.manager, lead.id)).activities.map((a) => a.body)
      expect(history.filter((b) => b?.startsWith("Attribuée"))).toHaveLength(2)
    })

    it("records every status change, and keeps edits traceable", async () => {
      const lead = await rawLead("History", users.sdr.id)
      await svc.updateLead(users.sdr, lead.id, { status: "CONTACTED", company: { sector: "plombier" } })
      const detail = await svc.getLead(users.sdr, lead.id)
      expect(detail.status).toBe("CONTACTED")
      expect(detail.activities.some((a) => a.kind === "STATUS_CHANGE")).toBe(true)
      expect(detail.activities.some((a) => a.body?.includes("sector"))).toBe(true)
    })

    it("do-not-contact blocks the address, and only a manager can lift a manual block", async () => {
      const { id } = await svc.createLead(users.sdr, { company: { name: "Bloque moi", city: "Lyon" }, contact: { email: "paul@bloque.fr" } } as never)
      await svc.updateLead(users.sdr, id, { status: "DO_NOT_CONTACT" })
      expect(await prisma.suppression.findFirst({ where: { email: "paul@bloque.fr" } })).toMatchObject({ reason: "MANUAL" })
      expect((await svc.getLead(users.sdr, id)).contact?.doNotContact).toBe(true)
      await expect(svc.updateLead(users.sdr, id, { status: "NEW" })).rejects.toMatchObject({ code: "forbidden" })
      await svc.updateLead(users.manager, id, { status: "NEW" })
      expect(await prisma.suppression.count({ where: { email: "paul@bloque.fr" } })).toBe(0)
    })

    it("never lifts a block the person asked for themselves", async () => {
      const { id } = await svc.createLead(users.manager, { company: { name: "Désinscrite", city: "Lyon" }, contact: { email: "bye@desinscrit.fr" } } as never)
      await svc.updateLead(users.manager, id, { status: "DO_NOT_CONTACT" })
      await prisma.suppression.update({ where: { workspaceId_email: { workspaceId: ws, email: "bye@desinscrit.fr" } }, data: { reason: "UNSUBSCRIBED" } })
      await expect(svc.updateLead(users.owner, id, { status: "NEW" })).rejects.toMatchObject({ code: "conflict" })
      expect((await svc.getLead(users.owner, id)).status).toBe("DO_NOT_CONTACT")
    })

    it("an edit cannot silently create a duplicate", async () => {
      await mk(users.manager, "Boulangerie Paul", { city: "Lyon" })
      const other = await mk(users.manager, "Boulangerie Paul", { city: "Lille" })
      await expect(svc.updateLead(users.manager, other.id, { company: { city: "Lyon" } })).rejects.toMatchObject({ code: "duplicate" })
    })

    it("a call makes a new fiche contacted", async () => {
      const lead = await rawLead("Call me", users.sdr.id)
      await svc.addActivity(users.sdr, lead.id, { kind: "CALL", body: "Répondeur" })
      const detail = await svc.getLead(users.sdr, lead.id)
      expect(detail.status).toBe("CONTACTED")
      expect(detail.lastContactedAt).not.toBeNull()
      await expect(svc.addActivity(users.sdr2, lead.id, { kind: "NOTE", body: "x" })).rejects.toMatchObject({ code: "not_found" })
      await expect(svc.addActivity(users.viewer, (await rawLead("V", null)).id, { kind: "NOTE", body: "x" })).rejects.toMatchObject({ code: "forbidden" })
    })
  })

  describe("bulk actions and deletion", () => {
    it("applies to what is allowed and reports the rest", async () => {
      const a = await rawLead("A", null)
      const b = await rawLead("B", users.sdr.id)
      const c = await rawLead("C", users.sdr2.id)
      const r = await svc.bulkUpdate(users.sdr, { ids: [a.id, b.id, c.id], action: { type: "tag", tag: "Chaud" } })
      expect(r).toMatchObject({ updated: 2, notAllowed: 1 })
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: a.id } })).tags).toEqual(["chaud"])
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: c.id } })).tags).toEqual([])
      const assign = await svc.bulkUpdate(users.sdr, { ids: [a.id], action: { type: "assign", ownerId: users.sdr2.id } })
      expect(assign.failures).toHaveLength(1)
      await svc.bulkUpdate(users.manager, { ids: [a.id, b.id], action: { type: "assign", ownerId: users.closer.id } })
      expect((await prisma.lead.findMany({ where: { id: { in: [a.id, b.id] } } })).every((l) => l.ownerId === users.closer.id)).toBe(true)
    })

    it("only the owner erases, and the suppression list survives", async () => {
      const { id } = await svc.createLead(users.owner, { company: { name: "À effacer", city: "Lyon" }, contact: { email: "gone@efface.fr" } } as never)
      await svc.updateLead(users.owner, id, { status: "DO_NOT_CONTACT" })
      await prisma.activity.count()
      await expect(svc.deleteLead(users.manager, id)).rejects.toMatchObject({ code: "forbidden" })
      await svc.deleteLead(users.owner, id)
      expect(await prisma.lead.count()).toBe(0)
      expect(await prisma.company.count()).toBe(0)
      expect(await prisma.contact.count()).toBe(0)
      expect(await prisma.activity.count()).toBe(0)
      expect(await prisma.suppression.count({ where: { email: "gone@efface.fr" } })).toBe(1)
      expect(await prisma.auditLog.count({ where: { action: "lead.deleted" } })).toBe(1)
    })
  })

  describe("import", () => {
    const rows = () => [
      { name: "Dupont Plomberie", email: "marie.durand@dupont-plomberie.fr", phone: "01 23 45 67 89", website: "https://www.dupont-plomberie.fr", city: "Lyon", sector: "plombier", contactName: "Marie Durand", tags: "chaud, lyon" },
      { name: "Boulangerie Paul", city: "Lille", phone: "03 20 00 00 01" },
      { name: "Garage Martin", email: "contact@garage-martin.fr", website: "garage-martin.fr", city: "Nantes" },
      { name: "", email: "orphelin@x.fr", city: "Paris" },
      { name: "Sans rien" },
      { name: "Email cassé", city: "Rennes", email: "pas-un-email", phone: "123" },
      { name: "DUPONT PLOMBERIE SARL", city: "Lyon" }, // same file duplicate
    ]
    const manager = () => users.manager

    it("previews exactly what the import then does", async () => {
      const preview = await imp.runImport(manager(), rows(), { commit: false, source: "CSV", fileName: "x.csv" })
      expect(preview.committed).toBe(false)
      expect(await prisma.company.count()).toBe(0)
      const done = await imp.runImport(manager(), rows(), { commit: true, source: "CSV", fileName: "x.csv" })
      expect(done.summary).toEqual(preview.summary)
      expect(done.summary).toMatchObject({ total: 7, created: 4, existing: 1, skipped: 2 })
      expect(await prisma.company.count()).toBe(4)
      expect(await prisma.lead.count()).toBe(4)
      expect(done.issues.find((i) => i.name === "Sans rien")?.reason).toMatch(/doublons/)
      expect(done.issues.find((i) => i.line === 5)?.reason).toMatch(/manquant/)
      expect(done.rows.find((r) => r.name === "Email cassé")?.warnings).toHaveLength(2)
    })

    it("records the batch, the origin and the legal basis, and scores the fiches", async () => {
      const done = await imp.runImport(manager(), rows(), { commit: true, source: "CSV", fileName: "prospects.csv" })
      const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: done.batchId! } })
      expect(batch).toMatchObject({ total: 7, created: 4, existing: 1, skipped: 2, source: "CSV" })
      expect(await prisma.lead.count({ where: { importBatchId: batch.id } })).toBe(4)
      const contact = await prisma.contact.findFirstOrThrow({ where: { email: "marie.durand@dupont-plomberie.fr" } })
      expect(contact).toMatchObject({ emailKind: "NOMINATIVE", collectedFrom: "prospects.csv", legalBasis: "legitimate_interest_b2b", source: "CSV" })
      const lead = await prisma.lead.findFirstOrThrow({ where: { company: { name: "Dupont Plomberie" } } })
      expect(lead.score).toBeGreaterThan(50)
      expect(lead.tags).toEqual(["chaud", "lyon"])
      expect(await prisma.auditLog.count({ where: { action: "lead.import" } })).toBe(1)
    })

    it("can be replayed without creating anything", async () => {
      await imp.runImport(manager(), rows(), { commit: true, source: "CSV" })
      const counts = async () => [await prisma.company.count(), await prisma.contact.count(), await prisma.lead.count(), await prisma.activity.count()]
      const before = await counts()
      const again = await imp.runImport(manager(), rows(), { commit: true, source: "CSV" })
      expect(again.summary).toMatchObject({ created: 0, existing: 5, skipped: 2 })
      expect(await counts()).toEqual(before)
    })

    it("completes an existing fiche without overwriting it", async () => {
      await imp.runImport(manager(), [{ name: "Boulangerie Paul", city: "Lille" }], { commit: true, source: "CSV" })
      const again = await imp.runImport(manager(), [{ name: "Boulangerie Paul", city: "Lille", phone: "03 20 00 00 01", website: "https://paul-lille.fr", contactName: "Paul", email: "paul@paul-lille.fr", tags: "pain" }], { commit: true, source: "CSV" })
      expect(again.summary).toMatchObject({ created: 0, existing: 1, enriched: 1 })
      const lead = await prisma.lead.findFirstOrThrow({ include: { company: true, contact: true } })
      expect(lead.company).toMatchObject({ phone: "+33320000001", domain: "paul-lille.fr" })
      expect(lead.contact?.email).toBe("paul@paul-lille.fr")
      expect(lead.tags).toEqual(["pain"])
      // A different phone in a later file does not replace the stored one.
      await imp.runImport(manager(), [{ name: "Boulangerie Paul", city: "Lille", phone: "03 99 99 99 99" }], { commit: true, source: "CSV" })
      expect((await prisma.company.findFirstOrThrow()).phone).toBe("+33320000001")
      expect((await prisma.lead.findFirstOrThrow()).score).toBeGreaterThan(0)
    })

    it("keeps suppressed addresses blocked on re-import", async () => {
      await prisma.suppression.create({ data: { workspaceId: ws, domain: "bloque.fr", reason: "COMPLAINED" } })
      await imp.runImport(manager(), [{ name: "Chez Bloque", city: "Lyon", email: "x@bloque.fr", contactName: "X" }], { commit: true, source: "CSV" })
      const lead = await prisma.lead.findFirstOrThrow({ include: { contact: true } })
      expect(lead.status).toBe("DO_NOT_CONTACT")
      expect(lead.contact?.doNotContact).toBe(true)
    })

    it("does not match companies through a free mailbox or a social page", async () => {
      await imp.runImport(manager(), [
        { name: "Alpha Services", city: "Lyon", email: "alpha@gmail.com", website: "https://facebook.com/alpha" },
        { name: "Beta Services", city: "Paris", email: "beta@gmail.com", website: "https://facebook.com/beta" },
      ], { commit: true, source: "CSV" })
      expect(await prisma.company.count()).toBe(2)
    })

    it("rejects an oversized file and an empty one", async () => {
      const big = Array.from({ length: imp.MAX_IMPORT_ROWS + 1 }, (_, i) => ({ name: `E${i}`, city: "Lyon" }))
      await expect(imp.runImport(manager(), big, { commit: true, source: "CSV" })).rejects.toMatchObject({ code: "invalid" })
      await expect(imp.runImport(manager(), [], { commit: true, source: "CSV" })).rejects.toMatchObject({ code: "invalid" })
    })
  })

  describe("duplicates and merge", () => {
    async function pair() {
      const keepC = await prisma.company.create({ data: { workspaceId: ws, name: "Garage Martin", city: "Nantes", phone: "+33240000001", nameKey: "garage martin|nantes" } })
      const dropC = await prisma.company.create({ data: { workspaceId: ws, name: "Garage Martin & Fils", city: "Nantes", phone: "+33240000001", website: "https://garage-martin.fr", domain: "garage-martin.fr", sector: "garage" } })
      const dropContact = await prisma.contact.create({ data: { workspaceId: ws, companyId: dropC.id, email: "jean@garage-martin.fr", name: "Jean" } })
      const keep = await prisma.lead.create({ data: { workspaceId: ws, companyId: keepC.id, status: "NEW", tags: ["a"] } })
      const drop = await prisma.lead.create({ data: { workspaceId: ws, companyId: dropC.id, contactId: dropContact.id, status: "QUALIFIED", ownerId: users.sdr.id, tags: ["b"] } })
      await prisma.activity.create({ data: { workspaceId: ws, leadId: drop.id, kind: "NOTE", body: "Historique à conserver" } })
      await prisma.deal.create({ data: { workspaceId: ws, leadId: drop.id } })
      await prisma.meeting.create({ data: { workspaceId: ws, hostId: users.closer.id, leadId: drop.id, startsAt: new Date("2030-01-01T10:00:00Z"), endsAt: new Date("2030-01-01T10:30:00Z") } })
      return { keep, drop, keepC, dropC }
    }

    it("finds the same business under two names", async () => {
      const { keep, drop } = await pair()
      const groups = await dup.findDuplicateGroups(users.manager)
      expect(groups).toHaveLength(1)
      expect(groups[0].members.map((m) => m.leadId).sort()).toEqual([keep.id, drop.id].sort())
      expect(groups[0].reasons).toContain("même téléphone")
      // The fiche with history comes first: it is the one proposed to keep.
      expect(groups[0].members[0].leadId).toBe(drop.id)
    })

    it("merges everything into the kept fiche", async () => {
      const { keep, drop, dropC } = await pair()
      await dup.mergeLeads(users.manager, keep.id, drop.id)
      const merged = await svc.getLead(users.manager, keep.id)
      expect(merged.status).toBe("QUALIFIED")
      expect(merged.ownerId).toBe(users.sdr.id)
      expect(merged.tags.sort()).toEqual(["a", "b"])
      expect(merged.contact?.email).toBe("jean@garage-martin.fr")
      expect(merged.company).toMatchObject({ name: "Garage Martin", website: "https://garage-martin.fr", domain: "garage-martin.fr", sector: "garage" })
      expect(merged.activities.map((a) => a.body)).toEqual(expect.arrayContaining(["Historique à conserver", expect.stringContaining("Fusionnée")]))
      expect(merged.deals).toHaveLength(1)
      expect(merged.meetings).toHaveLength(1)
      expect(await prisma.lead.findUnique({ where: { id: drop.id } })).toBeNull()
      expect(await prisma.company.findUnique({ where: { id: dropC.id } })).toBeNull()
      expect(await dup.findDuplicateGroups(users.manager)).toHaveLength(0)
      expect(await prisma.auditLog.count({ where: { action: "lead.merged" } })).toBe(1)
    })

    it("a block always survives a merge", () => {
      expect(dup.mergedStatus("QUALIFIED", "DO_NOT_CONTACT")).toBe("DO_NOT_CONTACT")
      expect(dup.mergedStatus("DO_NOT_CONTACT", "NEW")).toBe("DO_NOT_CONTACT")
      expect(dup.mergedStatus("NEW", "REPLIED")).toBe("REPLIED")
      expect(dup.mergedStatus("QUALIFIED", "NEW")).toBe("QUALIFIED")
      expect(dup.mergedStatus("DISQUALIFIED", "NEW")).toBe("DISQUALIFIED")
    })

    it("refuses to merge a fiche with itself or an unknown one", async () => {
      const { keep } = await pair()
      await expect(dup.mergeLeads(users.manager, keep.id, keep.id)).rejects.toMatchObject({ code: "invalid" })
      await expect(dup.mergeLeads(users.manager, keep.id, "nope")).rejects.toMatchObject({ code: "not_found" })
    })
  })

  describe("saved views", () => {
    const f = () => schemas.viewFiltersSchema.parse({ status: ["NEW"], minScore: 40 })
    it("keeps views private unless a manager shares them", async () => {
      await views.createView(users.sdr, { name: "À appeler", filters: f(), shared: false })
      await expect(views.createView(users.sdr, { name: "Pour tous", filters: f(), shared: true })).rejects.toMatchObject({ code: "forbidden" })
      await views.createView(users.manager, { name: "Pour tous", filters: f(), shared: true })
      expect((await views.listViews(users.sdr)).map((v) => v.name).sort()).toEqual(["Pour tous", "À appeler"])
      expect((await views.listViews(users.sdr2)).map((v) => v.name)).toEqual(["Pour tous"])
      await expect(views.createView(users.sdr, { name: "À appeler", filters: f(), shared: false })).rejects.toMatchObject({ code: "conflict" })
    })
    it("only the author or an owner deletes a view, and a view reads back as a URL", async () => {
      const { id } = await views.createView(users.sdr, { name: "Mine", filters: f(), shared: false })
      await expect(views.deleteView(users.sdr2, id)).rejects.toMatchObject({ code: "not_found" })
      expect(views.viewToQuery(f())).toBe("status=NEW&minScore=40")
      await views.deleteView(users.sdr, id)
      expect(await prisma.savedView.count()).toBe(0)
    })
  })
})
