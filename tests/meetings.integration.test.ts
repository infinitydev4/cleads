// Needs a disposable PostgreSQL with the migrations applied (never your development database).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { resetDatabase } from "./helpers/reset-db"

// The development .env holds real email keys: no test may ever reach a provider.
const NOT_SENT = { ok: false, provider: null, messageId: null, skipped: "not_configured", attempts: [] } as const
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn(async () => NOT_SENT) }))

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

suite("meetings (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let svc: typeof import("@/features/meetings/service")
  let token: typeof import("@/features/meetings/token")
  type U = import("@/lib/auth/guard").CurrentUser
  const u: Record<string, U> = {}
  const ws = "ws_default"
  // The system clock is pinned: Monday 1 June 2026, 08:00 in Paris. Slots are open Monday to Friday, 9-12 and 14-18.
  const NOW = new Date("2026-06-01T06:00:00Z")
  const at = (isoLocal: string) => new Date(`${isoLocal}:00+02:00`).toISOString() // summer time
  const MON_10 = at("2026-06-08T10:00") // next Monday, 10:00 Paris
  const MON_11 = at("2026-06-08T11:00")

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.MEETING_LINK_SECRET = "test-secret-for-meeting-links"
    prisma = (await import("@/lib/prisma")).prisma
    svc = await import("@/features/meetings/service")
    token = await import("@/features/meetings/token")
  })
  afterAll(async () => {
    vi.useRealTimers()
    await prisma.$disconnect()
  })
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW)
    await resetDatabase(prisma)
    for (const [key, role] of [["owner", "OWNER"], ["manager", "MANAGER"], ["sdr", "SDR"], ["closer", "CLOSER"], ["closer2", "CLOSER"], ["viewer", "VIEWER"]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@rdv.test`, name: key, role, workspaceId: ws } })
      u[key] = { id: x.id, workspaceId: ws, name: key, email: x.email!, image: null, role }
    }
    for (const key of ["closer", "closer2", "manager"]) {
      await prisma.availabilityRule.createMany({
        data: [1, 2, 3, 4, 5].flatMap((weekday) => [
          { workspaceId: ws, hostId: u[key].id, weekday, startMinute: 540, endMinute: 720, timezone: "Europe/Paris" },
          { workspaceId: ws, hostId: u[key].id, weekday, startMinute: 840, endMinute: 1080, timezone: "Europe/Paris" },
        ]),
      })
      await prisma.bookingProfile.create({ data: { workspaceId: ws, hostId: u[key].id, slug: `${key}-rdv`, enabled: true, bufferMin: 0, minNoticeMin: 60, horizonDays: 60 } })
    }
  })

  const lead = async (name: string, ownerId: string | null = null, email = `${name.toLowerCase()}@client.test`) => {
    const c = await prisma.company.create({ data: { workspaceId: ws, name } })
    const k = await prisma.contact.create({ data: { workspaceId: ws, companyId: c.id, name: `Contact ${name}`, email } })
    return prisma.lead.create({ data: { workspaceId: ws, companyId: c.id, contactId: k.id, ownerId, status: "CONTACTED" } })
  }
  const book = (user: U, leadId: string, hostId: string, startsAt = MON_10, extra: object = {}) =>
    svc.bookMeeting(user, { leadId, hostId, startsAt, type: "DISCOVERY", notifyGuest: false, ...extra } as never)
  const history = (leadId: string) => prisma.activity.findMany({ where: { leadId, kind: "MEETING" }, orderBy: { occurredAt: "asc" } })
  const dealOf = (leadId: string) => prisma.deal.findFirst({ where: { leadId }, orderBy: { createdAt: "desc" } })

  describe("booking by a person", () => {
    it("books an open slot, traces it, and creates the opportunity at « RDV planifié »", async () => {
      const l = await lead("Alpha", u.sdr.id)
      const m = await book(u.sdr, l.id, u.closer.id)
      expect(m).toMatchObject({ status: "SCHEDULED", hostId: u.closer.id, source: "sdr", type: "DISCOVERY" })
      expect(new Date(m.endsAt).getTime() - new Date(m.startsAt).getTime()).toBe(30 * 60_000)
      expect((await history(l.id)).map((a) => (a.data as { event: string }).event)).toEqual(["booked"])
      expect(await dealOf(l.id)).toMatchObject({ stage: "MEETING_SET", ownerId: u.closer.id })
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("QUALIFIED")
    })

    it("moves an existing qualified opportunity to « RDV planifié » instead of creating another", async () => {
      const l = await lead("Beta", u.sdr.id)
      const deal = await prisma.deal.create({ data: { workspaceId: ws, leadId: l.id, ownerId: u.closer.id, stage: "QUALIFIED" } })
      await book(u.sdr, l.id, u.closer.id)
      expect(await prisma.deal.count({ where: { leadId: l.id } })).toBe(1)
      expect((await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } })).stage).toBe("MEETING_SET")
    })

    it("refuses a slot outside the open hours, but a manager can place it by hand", async () => {
      const l = await lead("Gamma", u.sdr.id)
      const lunch = at("2026-06-08T13:00")
      await expect(book(u.sdr, l.id, u.closer.id, lunch)).rejects.toMatchObject({ code: "conflict" })
      await expect(book(u.sdr, l.id, u.closer.id, lunch, { override: true })).rejects.toMatchObject({ code: "conflict" }) // an SDR cannot override
      const m = await book(u.manager, l.id, u.closer.id, lunch, { override: true })
      expect(m.startsAt).toBe(lunch)
    })

    it("never lets two meetings overlap on one host, even with the override", async () => {
      const a = await lead("Delta", u.sdr.id)
      const b = await lead("Epsilon", u.sdr.id)
      await book(u.sdr, a.id, u.closer.id, MON_10)
      await expect(book(u.sdr, b.id, u.closer.id, MON_10)).rejects.toMatchObject({ extra: { code: "slot_taken" } })
      await expect(book(u.manager, b.id, u.closer.id, at("2026-06-08T10:15"), { override: true })).rejects.toMatchObject({ extra: { code: "slot_taken" } })
      await book(u.sdr, b.id, u.closer.id, at("2026-06-08T10:30")) // back to back is fine
    })

    it("holds under a race: ten simultaneous bookings of one slot give exactly one meeting", async () => {
      const leads = await Promise.all(Array.from({ length: 10 }, (_, i) => lead(`Race${i}`, u.sdr.id)))
      const results = await Promise.allSettled(leads.map((l) => book(u.sdr, l.id, u.closer.id, MON_11)))
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
      expect(await prisma.meeting.count({ where: { hostId: u.closer.id } })).toBe(1)
    })

    it("allows one active meeting of a type per contact", async () => {
      const l = await lead("Zeta", u.sdr.id)
      await book(u.sdr, l.id, u.closer.id, MON_10)
      await expect(book(u.sdr, l.id, u.closer2.id, MON_11)).rejects.toMatchObject({ extra: { code: "duplicate_meeting" } })
      await svc.bookMeeting(u.sdr, { leadId: l.id, hostId: u.closer2.id, startsAt: MON_11, type: "DEMO", notifyGuest: false } as never) // another type is fine
    })

    it("refuses the past, a do-not-contact fiche, a non-host and someone else's calendar", async () => {
      const l = await lead("Eta", u.sdr.id)
      await expect(book(u.sdr, l.id, u.closer.id, at("2026-05-30T10:00"))).rejects.toMatchObject({ code: "invalid" })
      await prisma.lead.update({ where: { id: l.id }, data: { status: "DO_NOT_CONTACT" } })
      await expect(book(u.sdr, l.id, u.closer.id)).rejects.toMatchObject({ code: "invalid" })
      const l2 = await lead("Theta", u.sdr.id)
      await expect(book(u.sdr, l2.id, u.sdr.id)).rejects.toMatchObject({ code: "invalid" }) // an SDR does not host
      await expect(book(u.closer, l2.id, u.closer2.id)).rejects.toMatchObject({ code: "forbidden" })
      await expect(book(u.viewer, l2.id, u.closer.id)).rejects.toMatchObject({ code: "forbidden" })
    })

    it("reads the offered slots as UTC instants and hides the ones taken", async () => {
      const l = await lead("Iota", u.sdr.id)
      await book(u.sdr, l.id, u.closer.id, MON_10)
      const { slots } = await svc.listSlots(u.sdr, u.closer.id, "2026-06-08", 1)
      expect(slots).toContain(at("2026-06-08T09:30"))
      expect(slots).not.toContain(MON_10)
      expect(slots).toContain(at("2026-06-08T10:30"))
      expect(slots).not.toContain(at("2026-06-08T12:00"))
    })
  })

  describe("moving, cancelling and closing", () => {
    it("moves a meeting: the old row becomes « Reporté », a new one takes its place, history keeps both", async () => {
      const l = await lead("Kappa", u.sdr.id)
      const m = await book(u.sdr, l.id, u.closer.id, MON_10)
      const moved = await svc.actOnMeeting(u.sdr, m.id, { action: "reschedule", startsAt: MON_11 })
      expect(moved.id).not.toBe(m.id)
      expect(moved.status).toBe("SCHEDULED")
      const old = await prisma.meeting.findUniqueOrThrow({ where: { id: m.id } })
      expect(old).toMatchObject({ status: "RESCHEDULED", rescheduledToId: moved.id })
      expect((await history(l.id)).map((a) => (a.data as { event: string }).event)).toEqual(["booked", "rescheduled"])
      // The slot just left is free again.
      expect((await svc.listSlots(u.sdr, u.closer.id, "2026-06-08", 1)).slots).toContain(MON_10)
    })

    it("cancelling frees the slot and puts the opportunity back to « Qualifié » when nothing else is planned", async () => {
      const l = await lead("Lambda", u.sdr.id)
      const m = await book(u.sdr, l.id, u.closer.id)
      const done = await svc.actOnMeeting(u.sdr, m.id, { action: "cancel", reason: "Pas disponible" })
      expect(done.status).toBe("CANCELED")
      expect((await dealOf(l.id))!.stage).toBe("QUALIFIED")
      expect((await svc.listSlots(u.sdr, u.closer.id, "2026-06-08", 1)).slots).toContain(MON_10)
      await expect(svc.actOnMeeting(u.sdr, m.id, { action: "cancel" })).rejects.toMatchObject({ code: "conflict" }) // already closed
    })

    it("keeps the opportunity at « RDV planifié » when another meeting is still planned", async () => {
      const l = await lead("Mu", u.sdr.id)
      const a = await book(u.sdr, l.id, u.closer.id, MON_10)
      await svc.bookMeeting(u.sdr, { leadId: l.id, hostId: u.closer.id, startsAt: MON_11, type: "DEMO", notifyGuest: false } as never)
      await svc.actOnMeeting(u.sdr, a.id, { action: "cancel" })
      expect((await dealOf(l.id))!.stage).toBe("MEETING_SET")
    })

    it("requires a result to close a meeting, and only once it has started", async () => {
      const l = await lead("Nu", u.sdr.id)
      const m = await book(u.sdr, l.id, u.closer.id)
      await expect(svc.actOnMeeting(u.closer, m.id, { action: "complete", outcome: "QUALIFIED" })).rejects.toMatchObject({ code: "conflict" }) // not held yet
      vi.setSystemTime(new Date("2026-06-08T09:00:00Z")) // after 10:30 Paris
      await expect(svc.actOnMeeting(u.closer, m.id, {} as never)).rejects.toBeTruthy()
      await expect(svc.actOnMeeting(u.closer, m.id, { action: "complete", outcome: "LOST" })).rejects.toMatchObject({ code: "invalid" }) // reason owed
      const done = await svc.actOnMeeting(u.closer, m.id, { action: "complete", outcome: "QUALIFIED", notes: "Veut un devis" })
      expect(done).toMatchObject({ status: "COMPLETED", outcome: "QUALIFIED" })
      expect((await dealOf(l.id))!.stage).toBe("PROPOSAL")
    })

    it("a lost result closes the opportunity with its reason; a follow-up result plans a task", async () => {
      const a = await lead("Xi", u.sdr.id)
      const b = await lead("Omicron", u.sdr.id)
      const ma = await book(u.sdr, a.id, u.closer.id, MON_10)
      const mb = await book(u.sdr, b.id, u.closer.id, MON_11)
      vi.setSystemTime(new Date("2026-06-08T11:00:00Z"))
      await svc.actOnMeeting(u.closer, ma.id, { action: "complete", outcome: "LOST", lostReason: "Budget insuffisant" })
      expect(await dealOf(a.id)).toMatchObject({ stage: "LOST", lostReason: "Budget insuffisant" })
      await svc.actOnMeeting(u.closer, mb.id, { action: "complete", outcome: "FOLLOW_UP", followUpDay: "2026-06-12" })
      const task = await prisma.task.findFirstOrThrow({ where: { leadId: b.id } })
      expect(task).toMatchObject({ assigneeId: u.closer.id, doneAt: null })
      expect(task.dueAt!.toISOString()).toBe("2026-06-11T22:00:00.000Z") // 12 June, midnight in Paris
      expect((await dealOf(b.id))!.stage).toBe("QUALIFIED") // nothing planned any more
    })

    it("a no-show plans a follow-up for tomorrow and frees the opportunity", async () => {
      const l = await lead("Pi", u.sdr.id)
      const m = await book(u.sdr, l.id, u.closer.id)
      vi.setSystemTime(new Date("2026-06-08T09:00:00Z"))
      const r = await svc.actOnMeeting(u.closer, m.id, { action: "no_show" })
      expect(r.status).toBe("NO_SHOW")
      const task = await prisma.task.findFirstOrThrow({ where: { leadId: l.id } })
      expect(task.title).toMatch(/absent/)
      expect((await dealOf(l.id))!.stage).toBe("QUALIFIED")
    })

    it("lists the meetings still owed a result", async () => {
      const l = await lead("Rho", u.sdr.id)
      const m = await book(u.sdr, l.id, u.closer.id)
      expect(await svc.listToClose(u.closer)).toHaveLength(0)
      vi.setSystemTime(new Date("2026-06-08T09:00:00Z"))
      const owed = await svc.listToClose(u.closer)
      expect(owed.map((x) => x.id)).toEqual([m.id])
      expect(owed[0].needsOutcome).toBe(true)
      expect(await svc.listToClose(u.closer2)).toHaveLength(0)
      expect(await svc.listToClose(u.manager)).toHaveLength(1)
    })
  })

  describe("who may do what", () => {
    it("a closer sees and changes only their own meetings; a manager sees all; a viewer reads only", async () => {
      const l = await lead("Sigma", u.sdr.id)
      const m = await book(u.sdr, l.id, u.closer.id)
      const range = { from: "2026-06-01T00:00:00Z", to: "2026-07-01T00:00:00Z" }
      expect(await svc.listMeetings(u.closer, range)).toHaveLength(1)
      expect(await svc.listMeetings(u.closer2, range)).toHaveLength(0)
      expect(await svc.listMeetings(u.manager, range)).toHaveLength(1)
      expect(await svc.listMeetings(u.viewer, range)).toHaveLength(1)
      await expect(svc.getMeeting(u.closer2, m.id)).rejects.toMatchObject({ code: "forbidden" })
      await expect(svc.actOnMeeting(u.closer2, m.id, { action: "cancel" })).rejects.toMatchObject({ code: "forbidden" })
      await expect(svc.actOnMeeting(u.viewer, m.id, { action: "cancel" })).rejects.toMatchObject({ code: "forbidden" })
      vi.setSystemTime(new Date("2026-06-08T09:00:00Z"))
      await expect(svc.actOnMeeting(u.sdr, m.id, { action: "complete", outcome: "QUALIFIED" })).rejects.toMatchObject({ code: "forbidden" }) // an SDR does not close
      await expect(svc.actOnMeeting(u.closer2, m.id, { action: "complete", outcome: "QUALIFIED" })).rejects.toMatchObject({ code: "forbidden" })
      await svc.actOnMeeting(u.manager, m.id, { action: "complete", outcome: "QUALIFIED" })
    })

    it("offers a closer only themselves as host", async () => {
      expect((await svc.listHosts(u.closer)).map((h) => h.id)).toEqual([u.closer.id])
      expect((await svc.listHosts(u.sdr)).map((h) => h.id).sort()).toEqual([u.closer.id, u.closer2.id, u.manager.id, u.owner.id].sort())
    })
  })

  describe("public booking: no account is ever created", () => {
    const input = (over: object = {}) => ({ startsAt: MON_10, name: "Camille Durand", email: "camille@boulangerie.test", phone: "06 12 34 56 78", company: "Boulangerie Durand", message: "Je veux un site", consent: true as const, ...over })

    it("creates the contact, the fiche, the meeting and the opportunity, and returns a working link", async () => {
      const usersBefore = await prisma.user.count()
      const r = await svc.bookPublic("closer-rdv", input(), "1.2.3.4")
      expect(r.startsAt).toBe(MON_10)
      expect(await prisma.user.count()).toBe(usersBefore) // the old flow created a User with a temporary password
      const meeting = await prisma.meeting.findFirstOrThrow({ include: { lead: { include: { company: true, contact: true } } } })
      expect(meeting).toMatchObject({ hostId: u.closer.id, source: "booking", type: "DISCOVERY", status: "SCHEDULED" })
      expect(meeting.lead!.company!.name).toBe("Boulangerie Durand")
      expect(meeting.lead!).toMatchObject({ source: "INBOUND", ownerId: u.closer.id })
      expect(meeting.lead!.contact).toMatchObject({ email: "camille@boulangerie.test", phone: "+33612345678", source: "INBOUND", legalBasis: "consent" })
      expect(await dealOf(meeting.leadId!)).toMatchObject({ stage: "MEETING_SET", ownerId: u.closer.id })
      const g = await svc.guestMeeting(r.manageUrl.split("/rdv/gerer/")[1])
      expect(g).toMatchObject({ status: "SCHEDULED", hostName: "closer", durationMin: 30, locked: null })
      const notes = await prisma.activity.findMany({ where: { leadId: meeting.leadId!, kind: "NOTE" } })
      expect(notes[0].body).toMatch(/Je veux un site/)
    })

    it("recognises a known contact by email and reuses their fiche", async () => {
      const l = await lead("Boulangerie Durand", u.sdr.id, "camille@boulangerie.test")
      await svc.bookPublic("closer-rdv", input(), "1.2.3.4")
      expect(await prisma.lead.count()).toBe(1)
      expect(await prisma.contact.count()).toBe(1)
      expect((await prisma.meeting.findFirstOrThrow()).leadId).toBe(l.id)
    })

    it("refuses a taken slot, a closed slot, a second booking by the same person, and an unknown or closed page", async () => {
      await svc.bookPublic("closer-rdv", input(), "1.2.3.4")
      await expect(svc.bookPublic("closer-rdv", input({ email: "autre@x.test", name: "Autre Personne" }), "1.2.3.5")).rejects.toMatchObject({ extra: { code: "slot_taken" } })
      await expect(svc.bookPublic("closer-rdv", input({ startsAt: at("2026-06-08T13:00") }), "1.2.3.6")).rejects.toMatchObject({ extra: { code: "slot_taken" } })
      await expect(svc.bookPublic("closer-rdv", input({ startsAt: MON_11 }), "1.2.3.7")).rejects.toMatchObject({ extra: { code: "duplicate_meeting" } })
      await expect(svc.bookPublic("nobody", input({ startsAt: MON_11 }), "1.2.3.8")).rejects.toMatchObject({ code: "not_found" })
      await prisma.bookingProfile.update({ where: { slug: "closer2-rdv" }, data: { enabled: false } })
      await expect(svc.bookPublic("closer2-rdv", input({ startsAt: MON_11, email: "z@z.test" }), "1.2.3.9")).rejects.toMatchObject({ code: "not_found" })
      await prisma.user.update({ where: { id: u.manager.id }, data: { active: false } })
      await expect(svc.bookPublic("manager-rdv", input({ startsAt: MON_11, email: "y@y.test" }), "1.2.3.10")).rejects.toMatchObject({ code: "not_found" })
    })

    it("treats a filled honeypot as a robot: nothing is stored", async () => {
      await svc.bookPublic("closer-rdv", input({ website: "http://spam.test" }), "9.9.9.9")
      expect(await prisma.meeting.count()).toBe(0)
      expect(await prisma.contact.count()).toBe(0)
    })

    it("limits the number of bookings from one connection", async () => {
      for (let i = 0; i < 5; i++) await svc.bookPublic("closer-rdv", input({ startsAt: at(`2026-06-0${8 + (i % 2)}T1${i}:00`), email: `p${i}@x.test`, name: `Personne ${i}` }), "7.7.7.7").catch(() => null)
      await expect(svc.bookPublic("closer-rdv", input({ email: "p9@x.test" }), "7.7.7.7")).rejects.toMatchObject({ code: "rate_limited", status: 429 })
      await expect(svc.bookPublic("closer-rdv", input({ email: "p9@x.test", startsAt: at("2026-06-10T10:00") }), "8.8.8.8")).resolves.toBeTruthy() // another connection is fine
    })

    it("keeps the booking even when an email cannot be sent", async () => {
      const r = await svc.bookPublic("closer-rdv", input(), "1.2.3.4")
      expect(r.emailSent).toBe(false)
      expect(await prisma.meeting.count()).toBe(1)
    })

    it("serves public slots without exposing who booked", async () => {
      await svc.bookPublic("closer-rdv", input(), "1.2.3.4")
      const s = await svc.publicSlots("closer-rdv", "2026-06-08", 1, "5.5.5.5")
      expect(s.slots).not.toContain(MON_10)
      expect(s.slots).toContain(MON_11)
      expect(JSON.stringify(s)).not.toMatch(/camille|durand/i)
      expect(await svc.publicProfile("closer-rdv")).toMatchObject({ hostName: "closer", durationMin: 30 })
    })
  })

  describe("the prospect's own link", () => {
    it("signs links that cannot be forged", async () => {
      const t = token.signMeetingToken("abc123")
      expect(token.verifyMeetingToken(t)).toBe("abc123")
      expect(token.verifyMeetingToken(t.replace(/.$/, (c) => (c === "A" ? "B" : "A")))).toBeNull()
      expect(token.verifyMeetingToken("abc123.")).toBeNull()
      expect(token.verifyMeetingToken("other." + t.split(".")[1])).toBeNull()
      expect(token.verifyMeetingToken("nodot")).toBeNull()
    })

    it("moves then cancels from the link; the old link follows the move", async () => {
      const r = await svc.bookPublic("closer-rdv", { startsAt: MON_10, name: "Léa Martin", email: "lea@x.test", consent: true }, "2.2.2.2")
      const t = r.manageUrl.split("/rdv/gerer/")[1]
      const moved = await svc.guestAct(t, { action: "reschedule", startsAt: MON_11 }, "2.2.2.2")
      expect(moved.startsAt).toBe(MON_11)
      expect((await svc.guestMeeting(t)).startsAt).toBe(MON_11) // the first link now shows the new time
      const canceled = await svc.guestAct(t, { action: "cancel", reason: "Empêchement" }, "2.2.2.2")
      expect(canceled.status).toBe("CANCELED")
      await expect(svc.guestAct(t, { action: "cancel" }, "2.2.2.2")).rejects.toMatchObject({ code: "conflict" })
      const lead = await prisma.lead.findFirstOrThrow()
      expect((await history(lead.id)).map((a) => (a.data as { event: string }).event)).toEqual(["booked", "rescheduled", "canceled"])
      expect((await dealOf(lead.id))!.stage).toBe("QUALIFIED")
    })

    it("locks changes when the meeting is too close, and rejects a forged link", async () => {
      const r = await svc.bookPublic("closer-rdv", { startsAt: MON_10, name: "Léa Martin", email: "lea@x.test", consent: true }, "2.2.2.2")
      const t = r.manageUrl.split("/rdv/gerer/")[1]
      vi.setSystemTime(new Date("2026-06-08T06:30:00Z")) // 08:30 Paris, 90 minutes before
      expect((await svc.guestMeeting(t)).locked).toMatch(/trop proche/)
      await expect(svc.guestAct(t, { action: "cancel" }, "2.2.2.2")).rejects.toMatchObject({ code: "conflict" })
      await expect(svc.guestMeeting("nope.nope")).rejects.toMatchObject({ code: "not_found" })
    })

    it("offers the guest the slots of the host, including the one they hold", async () => {
      const r = await svc.bookPublic("closer-rdv", { startsAt: MON_10, name: "Léa Martin", email: "lea@x.test", consent: true }, "2.2.2.2")
      const s = await svc.guestSlots(r.manageUrl.split("/rdv/gerer/")[1], "2026-06-08", 1, "3.3.3.3")
      expect(s.slots).toContain(MON_10)
    })
  })

  describe("availability settings", () => {
    const base = (over: object = {}) => ({
      windows: [{ weekday: 1, startMinute: 600, endMinute: 660 }],
      exceptions: [],
      profile: { slug: "mon-lien", enabled: true, timezone: "Europe/Paris", durationMin: 30, bufferMin: 0, minNoticeMin: 0, horizonDays: 30 },
      ...over,
    })

    it("saves hours, a day off and the page, and the slots follow", async () => {
      await svc.saveAvailability(u.closer, base({ exceptions: [{ date: "2026-06-15", available: false, reason: "Congés" }] }) as never)
      const a = await svc.getAvailability(u.closer)
      expect(a.windows).toEqual([{ weekday: 1, startMinute: 600, endMinute: 660 }])
      expect(a.exceptions[0]).toMatchObject({ date: "2026-06-15", available: false, reason: "Congés" })
      expect(a.publicUrl).toMatch(/\/rdv\/mon-lien$/)
      const { slots } = await svc.listSlots(u.sdr, u.closer.id, "2026-06-08", 10)
      expect(slots).toEqual([at("2026-06-08T10:00"), at("2026-06-08T10:30")]) // Monday 15 June is off, and 22 June is beyond the range
    })

    it("a closer edits only their own; a manager edits anyone's; bad hours and a taken link are refused", async () => {
      await expect(svc.saveAvailability(u.closer, base({ hostId: u.closer2.id }) as never)).rejects.toMatchObject({ code: "forbidden" })
      await svc.saveAvailability(u.manager, base({ hostId: u.closer2.id, profile: { ...base().profile, slug: "pris" } }) as never)
      await expect(svc.saveAvailability(u.closer, base({ profile: { ...base().profile, slug: "pris" } }) as never)).rejects.toMatchObject({ code: "conflict" })
      await expect(svc.saveAvailability(u.closer, base({ windows: [{ weekday: 1, startMinute: 700, endMinute: 600 }] }) as never)).rejects.toMatchObject({ code: "invalid" })
      await expect(svc.saveAvailability(u.closer, base({ windows: [] }) as never)).rejects.toMatchObject({ message: expect.stringMatching(/plage/) })
      await expect(svc.saveAvailability(u.viewer, base() as never)).rejects.toMatchObject({ code: "forbidden" })
    })
  })

  describe("reminders", () => {
    it("sends one reminder per meeting and person, never twice, and skips what was booked at the last minute", async () => {
      const sent: string[] = []
      const { sendMail } = await import("@/lib/mail")
      vi.mocked(sendMail).mockImplementation((async (m: { to: string; subject: string }) => (sent.push(`${m.to}|${m.subject}`), { ok: true, provider: "ses", messageId: "x", attempts: [] })) as never)
      const l = await lead("Tau", u.sdr.id)
      const m = await book(u.sdr, l.id, u.closer.id, MON_10)
      const soon = await lead("Upsilon", u.sdr.id)
      await prisma.meeting.update({ where: { id: m.id }, data: { createdAt: new Date("2026-06-01T00:00:00Z") } })

      vi.setSystemTime(new Date("2026-06-06T09:00:00Z")) // 47 h ahead: too early
      expect(await svc.sendMeetingReminders()).toEqual({ guests: 0, hosts: 0 })
      vi.setSystemTime(new Date("2026-06-07T07:00:00Z")) // 25 h ahead: still too early
      expect(await svc.sendMeetingReminders()).toEqual({ guests: 0, hosts: 0 })
      vi.setSystemTime(new Date("2026-06-07T10:30:00Z")) // 21.5 h ahead
      expect(await svc.sendMeetingReminders()).toEqual({ guests: 1, hosts: 1 })
      expect(sent.filter((x) => x.includes("Rappel")).sort()).toEqual([expect.stringMatching(/^closer@rdv.test\|Rappel/), expect.stringMatching(/^tau@client.test\|Rappel/)])
      expect(await svc.sendMeetingReminders()).toEqual({ guests: 0, hosts: 0 }) // idempotent

      // Booked with less than 3 h notice: the confirmation is enough.
      vi.setSystemTime(new Date("2026-06-08T06:00:00Z"))
      const near = await prisma.meeting.create({ data: { workspaceId: ws, hostId: u.closer2.id, leadId: soon.id, contactId: soon.contactId, startsAt: new Date("2026-06-08T08:00:00Z"), endsAt: new Date("2026-06-08T08:30:00Z"), createdAt: new Date("2026-06-08T05:30:00Z") } })
      expect(await svc.sendMeetingReminders()).toEqual({ guests: 0, hosts: 0 })
      expect((await prisma.meeting.findUniqueOrThrow({ where: { id: near.id } })).reminderSentAt).not.toBeNull()
      vi.mocked((await import("@/lib/mail")).sendMail).mockImplementation((async () => NOT_SENT) as never)
    })

    it("gives the claim back when the email fails, so the next run retries", async () => {
      const { sendMail } = await import("@/lib/mail")
      vi.mocked(sendMail).mockImplementation((async () => ({ ok: false, provider: null, messageId: null, attempts: [{ provider: "ses", error: "down" }] })) as never)
      const l = await lead("Phi", u.sdr.id)
      const m = await book(u.sdr, l.id, u.closer.id, MON_10)
      await prisma.meeting.update({ where: { id: m.id }, data: { createdAt: new Date("2026-06-01T00:00:00Z") } })
      vi.setSystemTime(new Date("2026-06-07T10:30:00Z"))
      expect(await svc.sendMeetingReminders()).toEqual({ guests: 0, hosts: 0 })
      expect((await prisma.meeting.findUniqueOrThrow({ where: { id: m.id } })).reminderSentAt).toBeNull()
      expect((await prisma.meeting.findUniqueOrThrow({ where: { id: m.id } })).hostReminderSentAt).toBeNull()
      vi.mocked((await import("@/lib/mail")).sendMail).mockImplementation((async () => NOT_SENT) as never)
    })
  })
})
