// Needs a disposable PostgreSQL with the migrations applied (never your development database).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { resetDatabase } from "./helpers/reset-db"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

suite("activities, tasks and the daily file (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let leads: typeof import("@/features/leads/service")
  let tasks: typeof import("@/features/activity/tasks")
  let today: typeof import("@/features/activity/today")
  let pipe: typeof import("@/features/pipeline/service")
  type U = import("@/lib/auth/guard").CurrentUser
  const u: Record<string, U> = {}
  const ws = "ws_default"
  // Wednesday 4 November 2026, 11:00 in Paris.
  const NOW = new Date("2026-11-04T10:00:00Z")

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    prisma = (await import("@/lib/prisma")).prisma
    leads = await import("@/features/leads/service")
    tasks = await import("@/features/activity/tasks")
    today = await import("@/features/activity/today")
    pipe = await import("@/features/pipeline/service")
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })
  beforeEach(async () => {
    await resetDatabase(prisma)
    for (const [key, role] of [["owner", "OWNER"], ["manager", "MANAGER"], ["sdr", "SDR"], ["sdr2", "SDR"], ["closer", "CLOSER"], ["closer2", "CLOSER"], ["viewer", "VIEWER"]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@act.test`, name: key, role, workspaceId: ws } })
      u[key] = { id: x.id, workspaceId: ws, name: key, email: x.email!, image: null, role }
    }
  })

  const lead = async (name: string, ownerId: string | null, extra: object = {}) => {
    const c = await prisma.company.create({ data: { workspaceId: ws, name, phone: "+33123456789" } })
    return prisma.lead.create({ data: { workspaceId: ws, companyId: c.id, ownerId, ...extra } })
  }
  const traces = (leadId: string) => prisma.activity.findMany({ where: { leadId, kind: "TASK" }, orderBy: { occurredAt: "asc" } })
  const qualified = async (name: string, closerId: string | null) => {
    const l = await lead(name, u.sdr.id)
    await pipe.qualifyLead(u.sdr, l.id, { decision: "qualify", qualification: {}, closerId })
    return l
  }

  describe("calls", () => {
    it("records the outcome and duration, and a conversation makes the fiche 'replied'", async () => {
      const l = await lead("Dupont", u.sdr.id)
      await leads.addActivity(u.sdr, l.id, { kind: "CALL", outcome: "reached", durationMin: 7, body: "Intéressé par une refonte" })
      const d = await leads.getLead(u.sdr, l.id)
      expect(d.status).toBe("REPLIED")
      expect(d.lastContactedAt).not.toBeNull()
      expect(d.activities.find((a) => a.kind === "CALL")).toMatchObject({ outcome: "reached", durationMin: 7, body: "Intéressé par une refonte" })
    })

    it("an unanswered call makes the fiche contacted, never replied; a replied fiche stays replied", async () => {
      const l = await lead("Muet", u.sdr.id)
      await leads.addActivity(u.sdr, l.id, { kind: "CALL", outcome: "voicemail" })
      expect((await leads.getLead(u.sdr, l.id)).status).toBe("CONTACTED")
      await leads.addActivity(u.sdr, l.id, { kind: "CALL", outcome: "reached" })
      expect((await leads.getLead(u.sdr, l.id)).status).toBe("REPLIED")
      await leads.addActivity(u.sdr, l.id, { kind: "CALL", outcome: "no_answer" })
      expect((await leads.getLead(u.sdr, l.id)).status).toBe("REPLIED")
    })

    it("a wrong number is written down but is not a contact", async () => {
      const l = await lead("Erreur", u.sdr.id)
      await leads.addActivity(u.sdr, l.id, { kind: "CALL", outcome: "wrong_number" })
      const d = await leads.getLead(u.sdr, l.id)
      expect(d.status).toBe("NEW")
      expect(d.lastContactedAt).toBeNull()
      expect(d.activities[0]).toMatchObject({ kind: "CALL", outcome: "wrong_number" })
    })

    it("plans the follow-up in the same step, with a trace for both", async () => {
      const l = await lead("Rappel", u.sdr.id)
      await leads.addActivity(u.sdr, l.id, { kind: "CALL", outcome: "callback", followUp: { dueDay: "2026-11-06" } })
      const d = await leads.getLead(u.sdr, l.id)
      expect(d.tasks).toMatchObject([{ title: "Rappeler", assigneeId: u.sdr.id }])
      expect(await traces(l.id)).toHaveLength(1)
    })

    it("refuses to plan a follow-up on a 'do not contact' fiche, and writes nothing", async () => {
      const l = await lead("Stop", u.sdr.id, { status: "DO_NOT_CONTACT" })
      await expect(leads.addActivity(u.sdr, l.id, { kind: "CALL", outcome: "reached", followUp: { dueDay: "2026-11-06" } })).rejects.toMatchObject({ code: "conflict" })
      expect(await prisma.activity.count({ where: { leadId: l.id } })).toBe(0)
    })
  })

  describe("who may work a fiche", () => {
    it("the closer holding the opportunity notes, calls and plans on a fiche they do not own", async () => {
      const l = await qualified("Confiée", u.closer.id)
      await leads.addActivity(u.closer, l.id, { kind: "NOTE", body: "RDV à confirmer" })
      await leads.addActivity(u.closer, l.id, { kind: "CALL", outcome: "reached" })
      await tasks.createTask(u.closer, l.id, { title: "Envoyer la proposition", dueDay: "2026-11-05" })
      expect((await leads.getLead(u.closer, l.id)).can.log).toBe(true)
    })

    it("a closer without the opportunity sees nothing; a viewer reads but cannot write", async () => {
      const l = await qualified("Autre closer", u.closer.id)
      await expect(leads.addActivity(u.closer2, l.id, { kind: "NOTE", body: "x" })).rejects.toMatchObject({ code: "not_found" })
      await expect(tasks.createTask(u.closer2, l.id, { title: "x" })).rejects.toMatchObject({ code: "not_found" })
      await expect(leads.addActivity(u.viewer, l.id, { kind: "NOTE", body: "x" })).rejects.toMatchObject({ code: "forbidden" })
      await expect(tasks.createTask(u.viewer, l.id, { title: "x" })).rejects.toMatchObject({ code: "forbidden" })
    })
  })

  describe("tasks", () => {
    it("defaults to the author, and every change leaves exactly one line in the history", async () => {
      const l = await lead("Suivi", u.sdr.id)
      const { id } = await tasks.createTask(u.sdr, l.id, { title: "Envoyer la plaquette", dueDay: "2026-11-05" })
      expect(await prisma.task.findUniqueOrThrow({ where: { id } })).toMatchObject({ assigneeId: u.sdr.id, createdById: u.sdr.id })
      await tasks.updateTask(u.sdr, id, { dueDay: "2026-11-09" })
      await tasks.updateTask(u.sdr, id, { title: "Envoyer la plaquette PDF" })
      await tasks.updateTask(u.sdr, id, { done: true })
      await tasks.updateTask(u.sdr, id, { done: false })
      await tasks.updateTask(u.sdr, id, { done: true })
      await tasks.deleteTask(u.sdr, id)
      const events = (await traces(l.id)).map((a) => (a.data as { event: string }).event)
      expect(events).toEqual(["created", "postponed", "renamed", "done", "reopened", "done", "deleted"])
    })

    it("changing nothing writes nothing", async () => {
      const l = await lead("Rien", u.sdr.id)
      const { id } = await tasks.createTask(u.sdr, l.id, { title: "T", dueDay: "2026-11-05" })
      await tasks.updateTask(u.sdr, id, { title: "T", dueDay: "2026-11-05" })
      await tasks.updateTask(u.sdr, id, { done: false })
      expect(await traces(l.id)).toHaveLength(1)
    })

    it("two people ticking the same task leave one line", async () => {
      const l = await lead("Course", u.sdr.id)
      const { id } = await tasks.createTask(u.manager, l.id, { title: "Appeler", assigneeId: u.sdr.id })
      await Promise.all([tasks.updateTask(u.sdr, id, { done: true }), tasks.updateTask(u.manager, id, { done: true })])
      expect((await traces(l.id)).filter((a) => (a.data as { event: string }).event === "done")).toHaveLength(1)
    })

    it("a SDR hands a task to the closer who holds the opportunity, not to another closer", async () => {
      const l = await qualified("Passage de relais", u.closer.id)
      await tasks.createTask(u.sdr, l.id, { title: "Rappeler le décideur", assigneeId: u.closer.id })
      await expect(tasks.createTask(u.sdr, l.id, { title: "x", assigneeId: u.closer2.id })).rejects.toMatchObject({ code: "forbidden" })
      await tasks.createTask(u.manager, l.id, { title: "Autre", assigneeId: u.closer2.id })
    })

    it("a task cannot go to a viewer, an inactive member or someone from nowhere", async () => {
      const l = await lead("Mauvaise cible", u.sdr.id)
      await expect(tasks.createTask(u.manager, l.id, { title: "x", assigneeId: u.viewer.id })).rejects.toMatchObject({ code: "invalid" })
      await prisma.user.update({ where: { id: u.closer.id }, data: { active: false } })
      await expect(tasks.createTask(u.manager, l.id, { title: "x", assigneeId: u.closer.id })).rejects.toMatchObject({ code: "invalid" })
      await expect(tasks.createTask(u.manager, l.id, { title: "x", assigneeId: "nobody" })).rejects.toMatchObject({ code: "invalid" })
    })

    it("an assignee keeps the right to finish a task even if the fiche is no longer theirs to see", async () => {
      const l = await lead("Perdue de vue", u.sdr.id)
      const { id } = await tasks.createTask(u.manager, l.id, { title: "Appel", assigneeId: u.sdr.id })
      await leads.updateLead(u.manager, l.id, { ownerId: u.sdr2.id })
      await tasks.updateTask(u.sdr, id, { done: true })
      expect((await prisma.task.findUniqueOrThrow({ where: { id } })).doneAt).not.toBeNull()
      // A stranger neither sees nor changes it.
      await expect(tasks.updateTask(u.closer2, id, { done: false })).rejects.toMatchObject({ code: "not_found" })
    })

    it("someone who may only read a task cannot change it", async () => {
      const l = await lead("Lecture", null)
      const { id } = await tasks.createTask(u.manager, l.id, { title: "T", assigneeId: u.sdr.id })
      await expect(tasks.updateTask(u.viewer, id, { done: true })).rejects.toMatchObject({ code: "forbidden" })
    })

    it("only the author and managers delete", async () => {
      const l = await lead("Suppression", u.sdr.id)
      const { id } = await tasks.createTask(u.manager, l.id, { title: "T", assigneeId: u.sdr.id })
      await expect(tasks.deleteTask(u.sdr, id)).rejects.toMatchObject({ code: "forbidden" })
      await tasks.deleteTask(u.manager, id)
      expect(await prisma.task.count()).toBe(0)
    })

    it("does not plan anything on a 'do not contact' fiche, nor reopen a task there", async () => {
      const l = await lead("Fermée", u.sdr.id)
      const { id } = await tasks.createTask(u.sdr, l.id, { title: "T" })
      await leads.updateLead(u.sdr, l.id, { status: "DO_NOT_CONTACT" })
      await expect(tasks.createTask(u.sdr, l.id, { title: "U" })).rejects.toMatchObject({ code: "conflict" })
      await expect(tasks.updateTask(u.sdr, id, { done: false })).rejects.toMatchObject({ code: "conflict" })
    })

    it("disqualifying a prospect closes what was planned, with the reason in the history", async () => {
      const l = await lead("Hors cible", u.sdr.id)
      await tasks.createTask(u.sdr, l.id, { title: "A", dueDay: "2026-11-05" })
      await tasks.createTask(u.sdr, l.id, { title: "B" })
      await pipe.qualifyLead(u.sdr, l.id, { decision: "disqualify", qualification: {}, reason: "Hors cible" })
      expect(await prisma.task.count({ where: { leadId: l.id, doneAt: null } })).toBe(0)
      expect((await traces(l.id)).filter((a) => (a.data as { event: string }).event === "dropped")).toHaveLength(2)
    })

    it("a status change to 'do not contact' closes them too", async () => {
      const l = await lead("Opposition", u.sdr.id)
      await tasks.createTask(u.sdr, l.id, { title: "A" })
      await leads.updateLead(u.sdr, l.id, { status: "DO_NOT_CONTACT" })
      expect(await prisma.task.count({ where: { leadId: l.id, doneAt: null } })).toBe(0)
    })

    it("merging two fiches keeps the tasks on the one that stays", async () => {
      const a = await lead("A", u.sdr.id)
      const b = await lead("B", u.sdr.id)
      const { id } = await tasks.createTask(u.sdr, b.id, { title: "Sur B" })
      const dup = await import("@/features/leads/duplicates")
      await dup.mergeLeads(u.manager, a.id, b.id)
      expect((await prisma.task.findUniqueOrThrow({ where: { id } })).leadId).toBe(a.id)
    })
  })

  describe("the daily file", () => {
    const plan = (user: U, leadId: string, title: string, dueDay: string | null, assigneeId?: string) => tasks.createTask(user, leadId, { title, dueDay, assigneeId })

    it("sorts a person's tasks into overdue, today, coming and undated, by Paris day", async () => {
      const l = await lead("Tri", u.sdr.id)
      await plan(u.sdr, l.id, "Hier", "2026-11-03")
      await plan(u.sdr, l.id, "Aujourd’hui", "2026-11-04")
      await plan(u.sdr, l.id, "Demain", "2026-11-05")
      await plan(u.sdr, l.id, "Un jour", null)
      const t = await today.getToday(u.sdr, "mine", NOW)
      expect(t.overdue.map((x) => x.title)).toEqual(["Hier"])
      expect(t.dueToday.map((x) => x.title)).toEqual(["Aujourd’hui"])
      expect(t.upcoming.map((x) => x.title)).toEqual(["Demain"])
      expect(t.undated.map((x) => x.title)).toEqual(["Un jour"])
      expect(t.today).toBe("2026-11-04")
    })

    it("a task due this morning is not overdue this evening", async () => {
      const l = await lead("Soir", u.sdr.id)
      await plan(u.sdr, l.id, "Ce jour", "2026-11-04")
      const evening = new Date("2026-11-04T21:30:00Z") // 22:30 in Paris
      const t = await today.getToday(u.sdr, "mine", evening)
      expect(t.overdue).toHaveLength(0)
      expect(t.dueToday).toHaveLength(1)
      expect((await today.getToday(u.sdr, "mine", new Date("2026-11-04T23:30:00Z"))).overdue).toHaveLength(1) // after Paris midnight
    })

    it("shows each person their own tasks, and the team only to those who read every fiche", async () => {
      const l = await lead("Équipe", null)
      await plan(u.manager, l.id, "Pour Sam", "2026-11-04", u.sdr.id)
      await plan(u.manager, l.id, "Pour Clo", "2026-11-04", u.closer.id)
      expect((await today.getToday(u.sdr, "mine", NOW)).dueToday.map((x) => x.title)).toEqual(["Pour Sam"])
      expect((await today.getToday(u.manager, "team", NOW)).dueToday).toHaveLength(2)
      expect((await today.getToday(u.viewer, "team", NOW)).dueToday).toHaveLength(2)
      // A SDR asking for the team gets their own file, not the team's.
      const asked = await today.getToday(u.sdr, "team", NOW)
      expect(asked.scope).toBe("mine")
      expect(asked.dueToday.map((x) => x.title)).toEqual(["Pour Sam"])
    })

    it("done tasks leave the file", async () => {
      const l = await lead("Fini", u.sdr.id)
      const { id } = await plan(u.sdr, l.id, "À faire", "2026-11-04")
      await tasks.updateTask(u.sdr, id, { done: true })
      expect((await today.getToday(u.sdr, "mine", NOW)).dueToday).toHaveLength(0)
    })

    it("marks which tasks the person may change", async () => {
      const l = await lead("Droits", null)
      await plan(u.manager, l.id, "T", "2026-11-04", u.sdr.id)
      expect((await today.getToday(u.sdr, "mine", NOW)).dueToday[0].canChange).toBe(true)
      expect((await today.getToday(u.viewer, "team", NOW)).dueToday[0].canChange).toBe(false)
    })

    it("lists today's meetings for the host only, and not the cancelled ones", async () => {
      const l = await lead("RDV", u.sdr.id)
      const mk = (hostId: string, startsAt: string, status: "SCHEDULED" | "CANCELED") =>
        prisma.meeting.create({ data: { workspaceId: ws, hostId, leadId: l.id, startsAt: new Date(startsAt), endsAt: new Date(new Date(startsAt).getTime() + 1800_000), status, timezone: "Europe/Paris" } })
      await mk(u.closer.id, "2026-11-04T13:00:00Z", "SCHEDULED")
      await mk(u.closer.id, "2026-11-04T15:00:00Z", "CANCELED")
      await mk(u.closer.id, "2026-11-05T13:00:00Z", "SCHEDULED")
      await mk(u.closer2.id, "2026-11-04T14:00:00Z", "SCHEDULED")
      expect((await today.getToday(u.closer, "mine", NOW)).meetings).toHaveLength(1)
      expect((await today.getToday(u.manager, "team", NOW)).meetings).toHaveLength(2)
    })

    it("suggests the closer's opportunities that have no next step, and the file empties once one is planned", async () => {
      const a = await qualified("Sans suite", u.closer.id)
      const b = await qualified("Aussi", u.closer.id)
      let s = (await today.getToday(u.closer, "mine", NOW)).suggestions
      expect(s.map((x) => x.leadId).sort()).toEqual([a.id, b.id].sort())
      expect(s[0].reason).toBe("deal_without_next_step")
      await plan(u.closer, a.id, "Relancer", "2026-11-06")
      await plan(u.closer, b.id, "Relancer", "2026-11-06")
      s = (await today.getToday(u.closer, "mine", NOW)).suggestions
      expect(s).toHaveLength(0)
    })

    it("suggests to a SDR the prospects that answered and the new ones with a phone, best score first", async () => {
      const replied = await lead("A répondu", u.sdr.id, { status: "REPLIED" })
      const low = await lead("Faible", u.sdr.id, { score: 10 })
      const high = await lead("Fort", u.sdr.id, { score: 80 })
      await lead("Pas à moi", u.sdr2.id, { status: "REPLIED" })
      const s = (await today.getToday(u.sdr, "mine", NOW)).suggestions
      expect(s.map((x) => [x.leadId, x.reason])).toEqual([[replied.id, "replied"], [high.id, "to_contact"], [low.id, "to_contact"]])
    })

    it("never suggests a fiche that is closed to contact", async () => {
      await lead("Stop", u.sdr.id, { status: "DO_NOT_CONTACT" })
      expect((await today.getToday(u.sdr, "mine", NOW)).suggestions).toHaveLength(0)
    })
  })

  describe("history", () => {
    it("pages through a long history without gaps or repeats", async () => {
      const l = await lead("Longue", u.sdr.id)
      for (let i = 0; i < 12; i++) await prisma.activity.create({ data: { workspaceId: ws, leadId: l.id, kind: "NOTE", body: `n${i}`, occurredAt: new Date(Date.UTC(2026, 0, 1, 0, i)) } })
      const first = await leads.listTimeline(u.sdr, l.id, { take: 5 })
      expect(first.items.map((a) => a.body)).toEqual(["n11", "n10", "n9", "n8", "n7"])
      expect(first.hasMore).toBe(true)
      const second = await leads.listTimeline(u.sdr, l.id, { take: 5, before: first.items.at(-1)!.occurredAt })
      expect(second.items.map((a) => a.body)).toEqual(["n6", "n5", "n4", "n3", "n2"])
      const last = await leads.listTimeline(u.sdr, l.id, { take: 5, before: second.items.at(-1)!.occurredAt })
      expect(last.items.map((a) => a.body)).toEqual(["n1", "n0"])
      expect(last.hasMore).toBe(false)
    })

    it("filters by kind and keeps other people's fiches out of reach", async () => {
      const l = await lead("Filtre", u.sdr.id)
      await leads.addActivity(u.sdr, l.id, { kind: "NOTE", body: "n" })
      await tasks.createTask(u.sdr, l.id, { title: "t" })
      const only = await leads.listTimeline(u.sdr, l.id, { kinds: ["TASK"] })
      expect(only.items.every((a) => a.kind === "TASK")).toBe(true)
      await expect(leads.listTimeline(u.sdr2, l.id)).rejects.toMatchObject({ code: "not_found" })
    })
  })
})
