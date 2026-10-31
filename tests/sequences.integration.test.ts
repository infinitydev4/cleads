// Needs a disposable PostgreSQL with the migrations applied (never your development database).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { resetDatabase } from "./helpers/reset-db"
import { startOfDay } from "@/lib/crm/day"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

suite("outreach: sequences (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let boxes: typeof import("@/features/outreach/mailboxes")
  let svc: typeof import("@/features/outreach/service")
  let poll: typeof import("@/features/outreach/poll")
  let replies: typeof import("@/features/outreach/replies")
  let sequences: typeof import("@/features/outreach/sequences")
  let run: typeof import("@/features/outreach/sequence-run")
  let health: typeof import("@/features/outreach/deliverability")
  let events: typeof import("@/lib/mail/events")
  let leadsSvc: typeof import("@/features/leads/service")
  let unsub: typeof import("@/features/outreach/unsubscribe")
  let compose: typeof import("@/features/outreach/compose")
  let transport: typeof import("@/features/outreach/transport")
  type U = import("@/lib/auth/guard").CurrentUser
  const u: Record<string, U> = {}
  const ws = "ws_default"
  /** Every message handed to the (fake) SMTP server. Nothing in this suite reaches a real server. */
  let sent: { to: string; subject: string; text: string; headers: Record<string, string> }[] = []
  let smtpFailure: Error | null = null

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.MAILBOX_SECRET_KEY = Buffer.alloc(32, 3).toString("base64")
    process.env.OUTREACH_LINK_SECRET = "test-secret-for-unsubscribe-links"
    process.env.OUTREACH_LINK_BASE_URL = "https://trycleads.test"
    prisma = (await import("@/lib/prisma")).prisma
    boxes = await import("@/features/outreach/mailboxes")
    svc = await import("@/features/outreach/service")
    unsub = await import("@/features/outreach/unsubscribe")
    poll = await import("@/features/outreach/poll")
    replies = await import("@/features/outreach/replies")
    sequences = await import("@/features/outreach/sequences")
    run = await import("@/features/outreach/sequence-run")
    health = await import("@/features/outreach/deliverability")
    events = await import("@/lib/mail/events")
    leadsSvc = await import("@/features/leads/service")
    compose = await import("@/features/outreach/compose")
    transport = await import("@/features/outreach/transport")
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })
  beforeEach(async () => {
    await resetDatabase(prisma)
    sent = []
    smtpFailure = null
    vi.spyOn(transport.transport, "verify").mockResolvedValue({ imap: true, sentFolder: "Sent" })
    vi.spyOn(transport.transport, "saveToSent").mockResolvedValue(true)
    vi.spyOn(transport.transport, "send").mockImplementation(async (_c, m) => {
      // A real server takes a moment: concurrent sends then truly overlap.
      await new Promise((r) => setTimeout(r, 5))
      if (smtpFailure) throw smtpFailure
      sent.push({ to: m.to, subject: m.subject, text: m.text, headers: m.headers })
      return { raw: Buffer.from("raw"), response: "250 OK" }
    })
    vi.spyOn(console, "error").mockImplementation(() => {})
    for (const [key, role] of [["owner", "OWNER"], ["manager", "MANAGER"], ["sdr", "SDR"], ["sdr2", "SDR"], ["closer", "CLOSER"], ["viewer", "VIEWER"]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@team.test`, name: `${key} Test`, role, workspaceId: ws } })
      u[key] = { id: x.id, workspaceId: ws, name: `${key} Test`, email: x.email!, image: null, role }
    }
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const smtp = { smtpHost: "smtp.trycleads.test", smtpPort: 465, smtpSecure: true, imapHost: "imap.trycleads.test", imapPort: 993, imapSecure: true, sentFolder: null, signature: null }
  const mailbox = async (ownerId: string | null, opts: { address?: string; dailyCap?: number; alreadyWarm?: boolean } = {}) => {
    const address = opts.address ?? `box${Math.random().toString(36).slice(2, 7)}@trycleads.test`
    const r = await boxes.createMailbox(u.owner, { address, displayName: "Marie Martin", ownerId, username: address, password: "app-password", dailyCap: opts.dailyCap ?? 30, alreadyWarm: opts.alreadyWarm ?? true, ...smtp })
    return r.mailbox
  }
  let n = 0
  const lead = async (opts: { ownerId?: string | null; email?: string | null; companyEmail?: string | null; status?: "NEW" | "CONTACTED" | "DO_NOT_CONTACT"; doNotContact?: boolean; name?: string | null } = {}) => {
    const i = ++n
    const c = await prisma.company.create({ data: { workspaceId: ws, name: `Plomberie ${i}`, city: "Lyon", email: opts.companyEmail ?? null } })
    const email = opts.email === undefined ? `jean.dupont${i}@plomberie${i}.test` : opts.email
    const k = await prisma.contact.create({ data: { workspaceId: ws, companyId: c.id, name: opts.name === undefined ? "Jean Dupont" : opts.name, email, emailKind: "NOMINATIVE", doNotContact: !!opts.doNotContact } })
    return prisma.lead.create({ data: { workspaceId: ws, companyId: c.id, contactId: k.id, ownerId: opts.ownerId === undefined ? u.sdr.id : opts.ownerId, status: opts.status ?? "NEW", source: "EXTRACTOR" } })
  }
  const send = (user: U, leadId: string, mailboxId: string, extra: object = {}) =>
    svc.sendToLead(user, leadId, { mailboxId, subject: "Une question rapide", body: "Bonjour Jean,\n\nUne question rapide sur vos demandes de devis.", ...extra })
  const rejection = async (p: Promise<unknown>) => {
    try {
      await p
    } catch (e) {
      return e as { code: string; status: number; message: string; extra?: { blocker?: string } }
    }
    throw new Error("expected a refusal")
  }

  /** What the (fake) IMAP server returns on the next read. */
  let inbox: { uid: number; source: Buffer }[] = []
  let fetchFailure: Error | null = null
  let fetchCalls: { lastUid: number | null; uidValidity: string | null }[] = []
  beforeEach(() => {
    inbox = []
    fetchFailure = null
    fetchCalls = []
    vi.spyOn(transport.transport, "fetchNew").mockImplementation(async (_c, cursor) => {
      fetchCalls.push(cursor)
      if (fetchFailure) throw fetchFailure
      const fresh = inbox.filter((m) => cursor.lastUid === null || m.uid > cursor.lastUid)
      return { uidValidity: "42", lastUid: Math.max(cursor.lastUid ?? 0, ...inbox.map((m) => m.uid)), messages: fresh, more: false }
    })
  })

  const crlf = (s: string) => Buffer.from(s.trim().replace(/\n/g, "\r\n") + "\r\n")
  const reply = (from: string, to: string, inReplyTo: string, id: string, extra = "") =>
    crlf(`From: ${from}\nTo: ${to}\nSubject: Re: Une question rapide\nMessage-ID: ${id}\nIn-Reply-To: ${inReplyTo}\nReferences: ${inReplyTo}\n${extra}Content-Type: text/plain; charset=UTF-8\n\nOui, rappelez-moi.\n\n> Bonjour Jean`)
  const dsn = (to: string, original: string, status: string) =>
    crlf(`From: mailer-daemon@googlemail.com\nTo: ${to}\nSubject: Delivery Status Notification (Failure)\nMessage-ID: <dsn-${Math.random()}@g>\nContent-Type: multipart/report; report-type=delivery-status; boundary="b"\n\n--b\nContent-Type: text/plain\n\nFailed\n--b\nContent-Type: message/delivery-status\n\nFinal-Recipient: rfc822; x@y.test\nAction: failed\nStatus: ${status}\nDiagnostic-Code: smtp; 550 5.1.1 no such user\n\n--b\nContent-Type: message/rfc822\n\nMessage-ID: ${original}\nSubject: x\n\nbody\n--b--`)


  // 2026-11-02 is a Monday; Paris is UTC+1.
  const paris = (day: string, h: number, m = 0) => new Date(startOfDay(day).getTime() + (h * 60 + m) * 60_000)
  const MON_9 = paris("2026-11-02", 9, 30)
  const MON_11 = paris("2026-11-02", 11)
  const SAT_11 = paris("2026-11-07", 11)

  const STEPS = [
    { delayDays: 0, subject: "Une question rapide", body: "Bonjour {{prenom|Madame, Monsieur}}, une question sur les demandes de devis de {{entreprise}}." },
    { delayDays: 3, subject: "", body: "Je me permets de relancer mon message précédent, sans suite de votre part." },
    { delayDays: 5, subject: "Dernier message", body: "Je ne vous écrirai plus après celui-ci. Bonne continuation." },
  ]
  const seq = async (steps = STEPS) => (await sequences.createSequence(u.owner, { name: `Séquence ${++n}`, steps })).id
  const enroll = (user: U, seqId: string, leadIds: string[], mailboxId: string, extra: object = {}) => sequences.enrollLeads(user, seqId, { leadIds, mailboxId, ...extra })
  const enrollmentOf = (leadId: string) => prisma.sequenceEnrollment.findFirstOrThrow({ where: { leadId }, orderBy: { createdAt: "desc" } })
  const makeDue = (id: string) => prisma.sequenceEnrollment.update({ where: { id }, data: { nextAt: MON_9 } })
  const sentCount = () => prisma.emailMessage.count({ where: { direction: "OUTBOUND", status: "SENT" } })
  /** A fiche in a running sequence, step 1 already due. */
  async function running(opts: { steps?: typeof STEPS; mailbox?: Awaited<ReturnType<typeof mailbox>>; leadOpts?: Parameters<typeof lead>[0] } = {}) {
    const box = opts.mailbox ?? (await mailbox(u.sdr.id))
    const l = await lead(opts.leadOpts)
    const id = await seq(opts.steps)
    const r = await enroll(u.sdr, id, [l.id], box.id)
    expect(r.enrolled).toBe(1)
    const e = await enrollmentOf(l.id)
    await makeDue(e.id)
    return { box, lead: l, seqId: id, enrollmentId: e.id }
  }
  const stopped = async (enrollmentId: string) => (await prisma.sequenceEnrollment.findUniqueOrThrow({ where: { id: enrollmentId } }))
  /** After a stop, the next run must not send anything more to that fiche. */
  async function expectSilent(enrollmentId: string, reason: string) {
    const e = await stopped(enrollmentId)
    expect(e).toMatchObject({ status: "STOPPED", stoppedReason: reason, nextAt: null })
    // Even if something put it back on the schedule, a stopped enrollment is never picked up.
    await makeDue(enrollmentId)
    const before = await sentCount()
    await run.runSequences(MON_11)
    expect(await sentCount()).toBe(before)
  }

  describe("writing a sequence", () => {
    it("accepts up to four steps and refuses what cannot work", async () => {
      const schemas = await import("@/features/outreach/schemas")
      const ok = schemas.sequenceSchema.safeParse({ name: "Relance", steps: STEPS })
      expect(ok.success).toBe(true)
      expect(schemas.sequenceSchema.safeParse({ name: "Trop", steps: [...STEPS, ...STEPS] }).success).toBe(false)
      expect(schemas.sequenceSchema.safeParse({ name: "Même jour", steps: [STEPS[0], { ...STEPS[1], delayDays: 0 }] }).success).toBe(false)
      expect(schemas.sequenceSchema.safeParse({ name: "Sans objet", steps: [{ ...STEPS[0], subject: "" }] }).success).toBe(false)
      expect((await rejection(sequences.createSequence(u.owner, { name: "Inconnue", steps: [{ ...STEPS[0], body: "Bonjour {{inconnue}}, un message assez long." }] }))).code).toBe("invalid")
      await seq()
      const dup = await rejection(sequences.createSequence(u.owner, { name: `Séquence ${n}`, steps: STEPS }))
      expect(dup.code).toBe("duplicate")
    })
  })

  describe("enrolling", () => {
    it("checks every fiche on the server and says why it skips one", async () => {
      const box = await mailbox(u.sdr.id)
      const id = await seq()
      const good = await lead()
      const suppressedLead = await lead({ email: "gone@plomberie.test" })
      await prisma.suppression.create({ data: { workspaceId: ws, email: "gone@plomberie.test", reason: "BOUNCED", source: "test" } })
      const refused = await lead({ doNotContact: true })
      const replied = await lead()
      await prisma.lead.update({ where: { id: replied.id }, data: { status: "REPLIED" } })
      const generic = await lead({ email: null, companyEmail: "contact@plomberie.test" })
      const others = await lead({ ownerId: u.sdr2.id })
      const pool = await lead({ ownerId: null })
      const r = await enroll(u.sdr, id, [good.id, suppressedLead.id, refused.id, replied.id, generic.id, others.id, pool.id, "does-not-exist"], box.id)
      expect(r.enrolled).toBe(1)
      const why = Object.fromEntries(r.skipped.map((s) => [s.leadId, s.reason]))
      expect(why[suppressedLead.id]).toMatch(/exclusion/)
      expect(why[refused.id]).toMatch(/ne pas contacter/)
      expect(why[replied.id]).toMatch(/Nouveau/)
      expect(why[generic.id]).toMatch(/générique/)
      // Someone else's fiche is not even visible to a SDR; a pool fiche is visible but must be claimed first.
      expect(why[others.id]).toMatch(/introuvable/)
      expect(why[pool.id]).toMatch(/attribuée/)
      expect(why["does-not-exist"]).toMatch(/introuvable/)
      // The generic address goes in once confirmed.
      expect((await enroll(u.sdr, id, [generic.id], box.id, { confirmGeneric: true })).enrolled).toBe(1)
      // Nothing was sent at enrollment: the first message waits for the worker and the window.
      expect(sent).toHaveLength(0)
      expect(await prisma.activity.count({ where: { leadId: good.id, data: { path: ["event"], equals: "sequence_enrolled" } } })).toBe(1)
    })

    it("refuses a fiche already in a sequence, a mailbox that is not yours, a paused mailbox or sequence, and a missing variable", async () => {
      const box = await mailbox(u.sdr.id)
      const l = await lead()
      const id = await seq()
      await enroll(u.sdr, id, [l.id], box.id)
      expect((await enroll(u.sdr, await seq(), [l.id], box.id)).skipped[0].reason).toMatch(/déjà dans une séquence/)

      const theirs = await mailbox(u.sdr2.id)
      expect((await rejection(enroll(u.sdr, id, [(await lead()).id], theirs.id))).status).toBe(403)
      await boxes.updateMailbox(u.owner, box.id, { status: "PAUSED" })
      expect((await rejection(enroll(u.sdr, id, [(await lead()).id], box.id))).extra?.blocker).toBe("mailbox_inactive")

      const live = await mailbox(u.sdr.id)
      await sequences.setSequenceStatus(u.owner, id, "PAUSED")
      expect((await rejection(enroll(u.sdr, id, [(await lead()).id], live.id))).status).toBe(409)

      const needsSite = await seq([{ ...STEPS[0], body: "Bonjour, j’ai regardé {{site}} ce matin et j’ai une idée." }])
      const r = await enroll(u.sdr, needsSite, [(await lead()).id], live.id)
      expect(r.enrolled).toBe(0)
      expect(r.skipped[0].reason).toContain("{{site}}")
    })

    it("lets a SDR see only the fiches they enrolled, a manager all", async () => {
      const box = await mailbox(u.sdr.id)
      const box2 = await mailbox(u.sdr2.id)
      const id = await seq()
      await enroll(u.sdr, id, [(await lead()).id], box.id)
      await enroll(u.sdr2, id, [(await lead({ ownerId: u.sdr2.id })).id], box2.id)
      expect(await sequences.listEnrollments(u.sdr, { sequenceId: id })).toHaveLength(1)
      expect(await sequences.listEnrollments(u.manager, { sequenceId: id })).toHaveLength(2)
    })
  })

  describe("sending the steps", () => {
    it("sends step by step in one thread, only inside the window, and finishes", async () => {
      const { box, lead: l, enrollmentId } = await running()
      // Saturday: nothing leaves.
      expect(await run.runSequences(SAT_11)).toMatchObject({ closed: true, sent: 0 })
      expect(sent).toHaveLength(0)

      expect(await run.runSequences(MON_11)).toMatchObject({ sent: 1, closed: false })
      expect(sent).toHaveLength(1)
      expect(sent[0].subject).toBe("Une question rapide")
      expect(sent[0].text).toContain("Bonjour Jean,")
      expect(sent[0].text).toContain("trycleads.test/u/") // the unsubscribe footer is still imposed
      expect(sent[0].headers["List-Unsubscribe"]).toContain("https://trycleads.test/api/public/unsubscribe/")
      expect(sent[0].headers["In-Reply-To"]).toBeUndefined()
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("CONTACTED")
      let e = await stopped(enrollmentId)
      expect(e).toMatchObject({ status: "ACTIVE", currentStep: 1 })
      // Next step: at least the delay later, on a weekday, inside the window.
      expect(e.nextAt!.getTime()).toBeGreaterThan(Date.now() + 2 * 86_400_000)
      const first = await prisma.emailMessage.findFirstOrThrow({ where: { enrollmentId, stepNumber: 1 } })
      expect(first).toMatchObject({ status: "SENT", leadId: l.id, mailboxId: box.id })

      // Not due yet: another run changes nothing.
      await run.runSequences(MON_11)
      expect(sent).toHaveLength(1)

      await makeDue(enrollmentId)
      await run.runSequences(MON_11)
      expect(sent).toHaveLength(2)
      expect(sent[1].subject).toBe("Re: Une question rapide")
      expect(sent[1].headers["In-Reply-To"]).toBe(first.messageId)
      expect(sent[1].headers.References).toBe(first.messageId)

      await makeDue(enrollmentId)
      await run.runSequences(MON_11)
      expect(sent).toHaveLength(3)
      expect(sent[2].subject).toBe("Dernier message")
      expect(sent[2].headers.References.split(" ")).toHaveLength(2)
      e = await stopped(enrollmentId)
      expect(e).toMatchObject({ status: "COMPLETED", currentStep: 3, nextAt: null })

      await run.runSequences(MON_11)
      expect(sent).toHaveLength(3)
      // The log keeps the sequence and the step on every message.
      expect((await prisma.emailMessage.findMany({ where: { enrollmentId }, orderBy: { stepNumber: "asc" } })).map((m) => m.stepNumber)).toEqual([1, 2, 3])
    })

    it("sends once when two runs overlap", async () => {
      await running()
      await Promise.all([run.runSequences(MON_11), run.runSequences(MON_11)])
      expect(sent).toHaveLength(1)
    })

    it("sends at most two per mailbox per run, then the rest on the next one", async () => {
      const box = await mailbox(u.sdr.id)
      const id = await seq()
      const ls = [await lead(), await lead(), await lead()]
      await enroll(u.sdr, id, ls.map((l) => l.id), box.id)
      for (const l of ls) await makeDue((await enrollmentOf(l.id)).id)
      await run.runSequences(MON_11)
      expect(sent).toHaveLength(2)
      await run.runSequences(MON_11)
      expect(sent).toHaveLength(3)
    })

    it("respects the mailbox's daily allowance: the fiche waits until tomorrow instead of failing", async () => {
      const box = await mailbox(u.sdr.id, { dailyCap: 1 })
      const id = await seq()
      const a = await lead()
      const b = await lead()
      await enroll(u.sdr, id, [a.id, b.id], box.id)
      for (const l of [a, b]) await makeDue((await enrollmentOf(l.id)).id)
      const r = await run.runSequences(MON_11)
      expect(r).toMatchObject({ sent: 1, waiting: 1, failed: 0 })
      const waiting = await prisma.sequenceEnrollment.findMany({ where: { currentStep: 0 } })
      expect(waiting).toHaveLength(1)
      expect(waiting[0]).toMatchObject({ status: "ACTIVE", failures: 0 })
      expect(waiting[0].nextAt!.getTime()).toBeGreaterThan(Date.now())
    })

    it("holds back everything while the mailbox or the sequence is paused", async () => {
      const { box, seqId, enrollmentId } = await running()
      await boxes.updateMailbox(u.owner, box.id, { status: "PAUSED" })
      expect(await run.runSequences(MON_11)).toMatchObject({ sent: 0, waiting: 1 })
      expect(sent).toHaveLength(0)
      expect((await stopped(enrollmentId)).status).toBe("ACTIVE")

      await boxes.updateMailbox(u.owner, box.id, { status: "ACTIVE" })
      await sequences.setSequenceStatus(u.owner, seqId, "PAUSED")
      await makeDue(enrollmentId)
      await run.runSequences(MON_11)
      expect(sent).toHaveLength(0)
      await sequences.setSequenceStatus(u.owner, seqId, "ACTIVE")
      await run.runSequences(MON_11)
      expect(sent).toHaveLength(1)
    })

    it("stops a fiche whose address was excluded in between, without sending, even if no hook ran", async () => {
      const { lead: l, enrollmentId } = await running()
      const email = (await prisma.contact.findFirstOrThrow({ where: { leads: { some: { id: l.id } } } })).email!
      await prisma.suppression.create({ data: { workspaceId: ws, email, reason: "UNSUBSCRIBED", source: "test" } })
      await run.runSequences(MON_11)
      expect(sent).toHaveLength(0)
      expect(await stopped(enrollmentId)).toMatchObject({ status: "STOPPED", stoppedReason: "UNSUBSCRIBED" })
    })
  })

  describe("stopping automatically", () => {
    it("on a reply: step 2 never leaves", async () => {
      const { box, enrollmentId } = await running()
      await run.runSequences(MON_11)
      const first = await prisma.emailMessage.findFirstOrThrow({ where: { enrollmentId, stepNumber: 1 } })
      inbox = [{ uid: 1, source: reply("jean@plomberie.test", box.address, first.messageId, "<r1@plomberie.test>") }]
      await poll.pollMailbox(box.id)
      await expectSilent(enrollmentId, "REPLIED")
      expect(sent).toHaveLength(1)
    })

    it("but not on an out-of-office notice", async () => {
      const { box, enrollmentId } = await running()
      await run.runSequences(MON_11)
      const first = await prisma.emailMessage.findFirstOrThrow({ where: { enrollmentId, stepNumber: 1 } })
      inbox = [{ uid: 1, source: reply("jean@plomberie.test", box.address, first.messageId, "<ooo@plomberie.test>", "Auto-Submitted: auto-replied\n") }]
      await poll.pollMailbox(box.id)
      expect((await stopped(enrollmentId)).status).toBe("ACTIVE")
      await makeDue(enrollmentId)
      await run.runSequences(MON_11)
      expect(sent).toHaveLength(2)
    })

    it("on a permanent bounce", async () => {
      const { box, enrollmentId } = await running()
      await run.runSequences(MON_11)
      const first = await prisma.emailMessage.findFirstOrThrow({ where: { enrollmentId, stepNumber: 1 } })
      inbox = [{ uid: 1, source: dsn(box.address, first.messageId, "5.1.1") }]
      await poll.pollMailbox(box.id)
      await expectSilent(enrollmentId, "BOUNCED")
    })

    it("on an unsubscribe, by the link and by the one-click request", async () => {
      const { enrollmentId } = await running()
      await run.runSequences(MON_11)
      const first = await prisma.emailMessage.findFirstOrThrow({ where: { enrollmentId, stepNumber: 1 } })
      expect(await unsub.unsubscribe(compose.signUnsubscribeToken(first.id))).toBe(true)
      await expectSilent(enrollmentId, "UNSUBSCRIBED")
      // The opt-out is attributed to the mailbox that sent it.
      expect((await prisma.emailMessage.findUniqueOrThrow({ where: { id: first.id } })).unsubscribedAt).not.toBeNull()
    })

    it("on a spam complaint", async () => {
      const { lead: l, enrollmentId } = await running()
      await run.runSequences(MON_11)
      const email = (await prisma.contact.findFirstOrThrow({ where: { leads: { some: { id: l.id } } } })).email!
      await events.applySuppressions(ws, [{ email, reason: "COMPLAINED", detail: "abuse" }])
      await expectSilent(enrollmentId, "COMPLAINED")
    })

    it("when a reply is filed 'Ne plus écrire'", async () => {
      const { box, enrollmentId } = await running()
      await run.runSequences(MON_11)
      const first = await prisma.emailMessage.findFirstOrThrow({ where: { enrollmentId, stepNumber: 1 } })
      const ooo = reply("jean@plomberie.test", box.address, first.messageId, "<r2@plomberie.test>", "Auto-Submitted: auto-replied\n")
      inbox = [{ uid: 1, source: ooo }]
      await poll.pollMailbox(box.id)
      const inbound = await prisma.emailMessage.findFirstOrThrow({ where: { direction: "INBOUND" } })
      await replies.updateReply(u.sdr, inbound.id, { replyClass: "STOP" })
      await expectSilent(enrollmentId, "UNSUBSCRIBED")
    })

    it("when the fiche changes status or a call reaches the person", async () => {
      for (const [status, reason] of [["DISQUALIFIED", "LEAD_CLOSED"], ["DO_NOT_CONTACT", "DO_NOT_CONTACT"]] as const) {
        const { lead: l, enrollmentId } = await running()
        await leadsSvc.updateLead(u.owner, l.id, { status })
        await expectSilent(enrollmentId, reason)
      }
      const { lead: l, enrollmentId } = await running()
      await leadsSvc.addActivity(u.sdr, l.id, { kind: "CALL", outcome: "reached", body: "On s’est parlé" } as never)
      await expectSilent(enrollmentId, "REPLIED")
    })

    it("by hand, and when the sequence is archived", async () => {
      const a = await running()
      await sequences.stopEnrollment(u.sdr, a.enrollmentId)
      await expectSilent(a.enrollmentId, "MANUAL")
      // Another SDR cannot touch it.
      const b = await running()
      expect((await rejection(sequences.stopEnrollment(u.sdr2, b.enrollmentId))).status).toBe(404)

      expect(await sequences.archiveSequence(u.owner, b.seqId)).toEqual({ stopped: 1 })
      await expectSilent(b.enrollmentId, "MANUAL")
      expect(await sequences.listSequences(u.owner)).toHaveLength(1)
    })

    it("tells the fiche why in its history", async () => {
      const { lead: l, enrollmentId } = await running()
      await sequences.stopEnrollment(u.sdr, enrollmentId)
      const a = await prisma.activity.findFirstOrThrow({ where: { leadId: l.id, data: { path: ["event"], equals: "sequence_stopped" } } })
      expect(a.body).toMatch(/arrêtée : arrêtée à la main/)
    })
  })

  describe("when sending goes wrong", () => {
    it("retries a server failure, then gives up after three attempts", async () => {
      const { enrollmentId } = await running()
      smtpFailure = new Error("server busy")
      expect(await run.runSequences(MON_11)).toMatchObject({ failed: 1 })
      let e = await stopped(enrollmentId)
      expect(e).toMatchObject({ status: "ACTIVE", failures: 1 })
      expect(e.nextAt!.getTime()).toBe(MON_11.getTime() + 3_600_000)
      for (let i = 0; i < 2; i++) {
        await makeDue(enrollmentId)
        await run.runSequences(MON_11)
      }
      e = await stopped(enrollmentId)
      expect(e).toMatchObject({ status: "STOPPED", stoppedReason: "SEND_FAILED" })
      // A failed attempt used no place in the day's allowance.
      expect(await prisma.emailMessage.count({ where: { status: "FAILED" } })).toBe(3)
    })

    it("stops on a refused recipient, and waits (mailbox in error) on a refused login", async () => {
      const a = await running()
      smtpFailure = transport.toTransportError({ code: "EENVELOPE" }, "smtp")
      await run.runSequences(MON_11)
      expect(await stopped(a.enrollmentId)).toMatchObject({ status: "STOPPED", stoppedReason: "SEND_FAILED" })

      const b = await running()
      smtpFailure = transport.toTransportError({ code: "EAUTH" }, "smtp")
      await run.runSequences(MON_11)
      expect(await stopped(b.enrollmentId)).toMatchObject({ status: "ACTIVE", failures: 0 })
      expect((await prisma.mailbox.findUniqueOrThrow({ where: { id: b.box.id } })).status).toBe("ERROR")
    })

    it("picks a lease back up if a run died after claiming", async () => {
      const { enrollmentId } = await running()
      // A run claimed it (lease in the future) and died: nothing leaves until the lease ends.
      await prisma.sequenceEnrollment.update({ where: { id: enrollmentId }, data: { nextAt: new Date(MON_11.getTime() + 600_000) } })
      await run.runSequences(MON_11)
      expect(sent).toHaveLength(0)
      await run.runSequences(new Date(MON_11.getTime() + 11 * 60_000))
      expect(sent).toHaveLength(1)
    })
  })

  describe("mailbox health and the automatic pause", () => {
    const history = async (boxId: string, sentN: number, bouncedN: number, extra: { unsubscribed?: number } = {}) => {
      for (let i = 0; i < sentN; i++) {
        await prisma.emailMessage.create({
          data: {
            workspaceId: ws, mailboxId: boxId, status: i < bouncedN ? "BOUNCED" : "SENT", fromEmail: "a@trycleads.test", toEmail: `p${i}@x.test`, subject: "s", bodyText: "b",
            messageId: `<h-${boxId}-${i}@x>`, unsubscribedAt: i >= sentN - (extra.unsubscribed ?? 0) ? new Date() : null,
          },
        })
      }
    }

    it("pauses a mailbox whose bounce rate crosses the line, and waits for a person to resume it", async () => {
      const box = await mailbox(u.sdr.id)
      const ok = await mailbox(u.sdr.id)
      await history(box.id, 30, 3) // 10 %
      await history(ok.id, 30, 0)
      const paused = await health.pauseUnhealthyMailboxes()
      expect(paused.map((p) => p.address)).toEqual([box.address])
      const row = await prisma.mailbox.findUniqueOrThrow({ where: { id: box.id } })
      expect(row.status).toBe("PAUSED")
      expect(row.statusReason).toMatch(/^Pause automatique : 10,0 % de rebonds/)
      expect(await prisma.auditLog.count({ where: { action: "mailbox.auto_paused", entityId: box.id } })).toBe(1)
      // Nothing leaves it, one-to-one included.
      expect((await rejection(send(u.sdr, (await lead()).id, box.id))).extra?.blocker).toBe("mailbox_inactive")

      // A person fixes the cause and resumes: the count restarts, it is not paused again at once.
      await boxes.updateMailbox(u.owner, box.id, { status: "ACTIVE" })
      expect((await prisma.mailbox.findUniqueOrThrow({ where: { id: box.id } })).status).toBe("ACTIVE")
      expect(await health.pauseUnhealthyMailboxes()).toEqual([])
    })

    it("pauses on opt-outs, warns before, and ignores tests and small samples", async () => {
      const box = await mailbox(u.sdr.id)
      await history(box.id, 10, 5) // small sample
      expect(await health.pauseUnhealthyMailboxes()).toEqual([])
      await history(box.id, 0, 0)
      const warn = await mailbox(u.sdr.id)
      await history(warn.id, 100, 3)
      await health.pauseUnhealthyMailboxes()
      expect((await health.deliverability(u.owner)).find((r) => r.id === warn.id)?.health.level).toBe("warn")
      expect((await prisma.mailbox.findUniqueOrThrow({ where: { id: warn.id } })).status).toBe("ACTIVE")

      const unsubs = await mailbox(u.sdr.id)
      await history(unsubs.id, 25, 0, { unsubscribed: 3 }) // 12 %
      expect((await health.pauseUnhealthyMailboxes()).map((p) => p.id)).toEqual([unsubs.id])
      // Test messages never count.
      const t = await mailbox(u.sdr.id)
      for (let i = 0; i < 30; i++) await prisma.emailMessage.create({ data: { workspaceId: ws, mailboxId: t.id, status: "BOUNCED", isTest: true, fromEmail: "a@x", toEmail: "b@x", subject: "s", bodyText: "b", messageId: `<t-${i}@x>` } })
      expect(await health.pauseUnhealthyMailboxes()).toEqual([])
    })

    it("holds the sequences of a paused mailbox, and shows the dashboard by role", async () => {
      const { box, enrollmentId } = await running()
      await history(box.id, 30, 3)
      await health.pauseUnhealthyMailboxes()
      await run.runSequences(MON_11)
      expect(sent).toHaveLength(0)
      expect((await stopped(enrollmentId)).status).toBe("ACTIVE")
      const mine = await health.deliverability(u.sdr)
      expect(mine.map((r) => r.id)).toEqual([box.id])
      expect(mine[0]).toMatchObject({ status: "PAUSED", month: { sent: 30, bounced: 3 } })
      await mailbox(u.sdr2.id)
      expect(await health.deliverability(u.manager)).toHaveLength(2)
    })
  })
})
