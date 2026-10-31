// Needs a disposable PostgreSQL with the migrations applied (never your development database).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { resetDatabase } from "./helpers/reset-db"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

suite("outreach: mailboxes, sending, unsubscribe (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let boxes: typeof import("@/features/outreach/mailboxes")
  let svc: typeof import("@/features/outreach/service")
  let templates: typeof import("@/features/outreach/templates")
  let unsub: typeof import("@/features/outreach/unsubscribe")
  let compose: typeof import("@/features/outreach/compose")
  let transport: typeof import("@/features/outreach/transport")
  let secret: typeof import("@/lib/crypto/secret-box")
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
    templates = await import("@/features/outreach/templates")
    unsub = await import("@/features/outreach/unsubscribe")
    compose = await import("@/features/outreach/compose")
    transport = await import("@/features/outreach/transport")
    secret = await import("@/lib/crypto/secret-box")
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

  describe("mailboxes", () => {
    it("stores the password sealed, tests the connection and starts active", async () => {
      const m = await mailbox(u.sdr.id)
      const row = await prisma.mailbox.findUniqueOrThrow({ where: { id: m.id } })
      expect(row.secret).not.toContain("app-password")
      expect(secret.open(row.secret)).toBe("app-password")
      expect(m).toMatchObject({ status: "ACTIVE", ownerId: u.sdr.id, sentToday: 0, allowanceToday: 30 })
      expect(row.sentFolder).toBe("Sent")
      expect(JSON.stringify(m)).not.toContain(row.secret)
    })

    it("keeps a mailbox whose connection is refused in error, with the reason, and it cannot send", async () => {
      vi.mocked(transport.transport.verify).mockRejectedValueOnce(transport.toTransportError({ code: "EAUTH" }, "smtp"))
      const m = await mailbox(u.sdr.id)
      expect(m.status).toBe("ERROR")
      expect(m.statusReason).toMatch(/Identifiants SMTP refusés/)
      const l = await lead()
      expect((await rejection(send(u.sdr, l.id, m.id))).extra?.blocker).toBe("mailbox_inactive")
      expect(sent).toHaveLength(0)
      // Fixed and tested again: it sends.
      expect((await boxes.testMailbox(u.owner, m.id)).mailbox.status).toBe("ACTIVE")
    })

    it("refuses the company's own domain, a duplicate, and an owner who cannot send", async () => {
      expect((await rejection(mailbox(u.sdr.id, { address: "marie@cleads.fr" }))).message).toMatch(/jamais depuis cleads\.fr/)
      await mailbox(u.sdr.id, { address: "marie@trycleads.test" })
      expect((await rejection(mailbox(u.sdr.id, { address: "marie@trycleads.test" }))).code).toBe("duplicate")
      expect((await rejection(mailbox(u.viewer.id))).code).toBe("invalid")
    })

    it("pauses and resumes only after a fresh test; a mailbox that sent stays in the history", async () => {
      const m = await mailbox(u.sdr.id)
      expect((await boxes.updateMailbox(u.owner, m.id, { status: "PAUSED" })).mailbox.status).toBe("PAUSED")
      const l = await lead()
      expect((await rejection(send(u.sdr, l.id, m.id))).extra?.blocker).toBe("mailbox_inactive")
      vi.mocked(transport.transport.verify).mockRejectedValueOnce(transport.toTransportError({ code: "ETIMEDOUT" }, "smtp"))
      expect((await boxes.updateMailbox(u.owner, m.id, { status: "ACTIVE" })).mailbox.status).toBe("ERROR")
      expect((await boxes.updateMailbox(u.owner, m.id, { status: "ACTIVE" })).mailbox.status).toBe("ACTIVE")
      await send(u.sdr, l.id, m.id)
      expect((await rejection(boxes.deleteMailbox(u.owner, m.id))).code).toBe("conflict")
    })
  })

  describe("sending to a prospect", () => {
    it("sends from the SDR's mailbox with the footer and one-click unsubscribe, and traces it on the fiche", async () => {
      const m = await mailbox(u.sdr.id)
      const l = await lead()
      const { emailId } = await send(u.sdr, l.id, m.id)
      expect(sent).toHaveLength(1)
      const msg = sent[0]
      const token = compose.signUnsubscribeToken(emailId)
      expect(msg.to).toBe(`jean.dupont${n}@plomberie${n}.test`)
      expect(msg.headers).toEqual({ "List-Unsubscribe": `<https://trycleads.test/api/public/unsubscribe/${token}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" })
      expect(msg.text).toContain("Marie Martin\n\n--\nVous recevez ce message à votre adresse professionnelle, trouvée sur la fiche publique de votre établissement")
      expect(msg.text).toContain(`https://trycleads.test/u/${token}`)
      const row = await prisma.emailMessage.findUniqueOrThrow({ where: { id: emailId } })
      expect(row).toMatchObject({ status: "SENT", sentById: u.sdr.id, leadId: l.id, fromEmail: m.address, bodyText: msg.text })
      expect(row.messageId).toMatch(/^<[0-9a-f-]+@trycleads\.test>$/)
      const after = await prisma.lead.findUniqueOrThrow({ where: { id: l.id }, include: { activities: { orderBy: { occurredAt: "asc" } } } })
      expect(after.status).toBe("CONTACTED")
      expect(after.lastContactedAt).not.toBeNull()
      expect(after.activities.map((a) => [a.kind, a.body])).toEqual([["EMAIL", "Une question rapide"], ["STATUS_CHANGE", null]])
    })

    it("never sends to a suppressed address or domain, a do-not-contact contact or fiche", async () => {
      const m = await mailbox(u.sdr.id)
      const a = await lead({ email: "paul@refus.test" })
      await prisma.suppression.create({ data: { workspaceId: ws, email: "paul@refus.test", reason: "UNSUBSCRIBED" } })
      const b = await lead({ email: "anne@domaine-exclu.test" })
      await prisma.suppression.create({ data: { workspaceId: ws, domain: "domaine-exclu.test", reason: "MANUAL" } })
      const c = await lead({ doNotContact: true })
      const d = await lead({ status: "DO_NOT_CONTACT" })
      const e = await lead({ email: null, companyEmail: "contact@plomberie.test", doNotContact: true })
      expect((await rejection(send(u.sdr, a.id, m.id))).extra?.blocker).toBe("suppressed")
      expect((await rejection(send(u.sdr, b.id, m.id))).extra?.blocker).toBe("suppressed")
      expect((await rejection(send(u.sdr, c.id, m.id))).extra?.blocker).toBe("do_not_contact")
      expect((await rejection(send(u.sdr, d.id, m.id))).extra?.blocker).toBe("lead_closed")
      expect((await rejection(send(u.sdr, e.id, m.id, { confirmGeneric: true }))).extra?.blocker).toBe("do_not_contact")
      expect(sent).toHaveLength(0)
      expect(await prisma.emailMessage.count()).toBe(0)
    })

    it("lets only the fiche's owner write, from their own mailbox; managers may use any", async () => {
      const mine = await mailbox(u.sdr.id)
      const theirs = await mailbox(u.sdr2.id)
      const pool = await lead({ ownerId: null })
      const other = await lead({ ownerId: u.sdr2.id })
      const own = await lead()
      expect((await rejection(send(u.sdr, pool.id, mine.id))).status).toBe(403)
      expect((await rejection(send(u.sdr, other.id, mine.id))).status).toBe(404) // not even visible
      expect((await rejection(send(u.sdr, own.id, theirs.id))).status).toBe(403)
      await send(u.manager, pool.id, theirs.id)
      expect(sent.map((s) => s.to)).toHaveLength(1)
    })

    it("asks for a confirmation before writing to a generic address, and refuses unfilled variables", async () => {
      const m = await mailbox(u.sdr.id)
      const g = await lead({ email: null, companyEmail: "contact@plombier.test" })
      expect((await rejection(send(u.sdr, g.id, m.id))).extra?.blocker).toBe("generic_address")
      await send(u.sdr, g.id, m.id, { confirmGeneric: true })
      expect(sent[0].to).toBe("contact@plombier.test")
      const l = await lead()
      expect((await rejection(send(u.sdr, l.id, m.id, { body: "Bonjour {{prenom}}, une question rapide." }))).message).toMatch(/variable/)
    })

    it("refuses a second email to the same address within minutes (a double click)", async () => {
      const m = await mailbox(u.sdr.id)
      const l = await lead()
      await send(u.sdr, l.id, m.id)
      expect((await rejection(send(u.sdr, l.id, m.id))).extra?.blocker).toBe("just_sent")
      expect(sent).toHaveLength(1)
    })

    it("never exceeds today's allowance, even with ten sends at the same moment", async () => {
      const m = await mailbox(u.sdr.id, { alreadyWarm: false }) // day 0 of the warm-up: 5 a day
      expect(m.allowanceToday).toBe(5)
      const leads = await Promise.all(Array.from({ length: 10 }, () => lead()))
      const results = await Promise.allSettled(leads.map((l) => send(u.sdr, l.id, m.id)))
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5)
      const refused = results.filter((r): r is PromiseRejectedResult => r.status === "rejected")
      expect(refused.map((r) => r.reason.extra?.blocker)).toEqual(Array(5).fill("quota_reached"))
      expect(sent).toHaveLength(5)
      expect(await boxes.sentToday(prisma, m.id)).toBe(5)
    })

    it("does not count a failed send in the quota; refused credentials stop the mailbox", async () => {
      const m = await mailbox(u.sdr.id, { dailyCap: 1 })
      const a = await lead()
      smtpFailure = transport.toTransportError({ code: "ETIMEDOUT" }, "smtp")
      const e = await rejection(send(u.sdr, a.id, m.id))
      expect(e.message).toMatch(/n’est pas parti.*injoignable/)
      expect(await prisma.emailMessage.findFirst({ where: { leadId: a.id } })).toMatchObject({ status: "FAILED" })
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("NEW")
      smtpFailure = null
      await send(u.sdr, a.id, m.id) // the failed one took no slot, and is no duplicate
      expect(sent).toHaveLength(1)

      const m2 = await mailbox(u.sdr.id)
      smtpFailure = transport.toTransportError({ code: "EAUTH" }, "smtp")
      await rejection(send(u.sdr, (await lead()).id, m2.id))
      expect((await prisma.mailbox.findUniqueOrThrow({ where: { id: m2.id } })).status).toBe("ERROR")
    })

    it("shows each person their own emails, managers the team's", async () => {
      const m1 = await mailbox(u.sdr.id)
      const m2 = await mailbox(u.sdr2.id)
      await send(u.sdr, (await lead()).id, m1.id)
      await send(u.sdr2, (await lead({ ownerId: u.sdr2.id })).id, m2.id)
      expect((await svc.listEmails(u.sdr)).items).toHaveLength(1)
      expect((await svc.listEmails(u.manager)).items).toHaveLength(2)
    })
  })

  describe("unsubscribe", () => {
    it("adds the address to the exclusion list, marks the contact and traces it; any later send is refused", async () => {
      const m = await mailbox(u.sdr.id)
      const l = await lead()
      const { emailId } = await send(u.sdr, l.id, m.id)
      const token = compose.signUnsubscribeToken(emailId)
      expect(await unsub.unsubscribeStatus(token)).toEqual({ email: `j•••@plomberie${n}.test`, done: false })
      // The mail client's one-click and the page's button arrive together.
      expect(await Promise.all([unsub.unsubscribe(token), unsub.unsubscribe(token)])).toEqual([true, true])
      expect(await unsub.unsubscribe(token)).toBe(true)
      expect(await prisma.suppression.findMany({ where: { email: `jean.dupont${n}@plomberie${n}.test` } })).toMatchObject([{ reason: "UNSUBSCRIBED" }])
      expect(await prisma.contact.findFirst({ where: { leads: { some: { id: l.id } } } })).toMatchObject({ doNotContact: true })
      expect(await prisma.activity.count({ where: { leadId: l.id, kind: "EMAIL", actorKind: "SYSTEM" } })).toBe(1)
      expect((await unsub.unsubscribeStatus(token))?.done).toBe(true)
      await prisma.emailMessage.updateMany({ data: { createdAt: new Date(Date.now() - 3_600_000) } })
      expect((await rejection(send(u.sdr, l.id, m.id))).extra?.blocker).toBe("do_not_contact")
    })

    it("ignores a forged link and keeps a stronger reason already on file", async () => {
      expect(await unsub.unsubscribe("forged.token")).toBe(false)
      expect(await unsub.unsubscribeStatus("forged.token")).toBeNull()
      const m = await mailbox(u.sdr.id)
      const l = await lead()
      const { emailId } = await send(u.sdr, l.id, m.id)
      const to = sent[0].to
      await prisma.suppression.create({ data: { workspaceId: ws, email: to, reason: "COMPLAINED" } })
      await unsub.unsubscribe(compose.signUnsubscribeToken(emailId))
      expect(await prisma.suppression.findMany({ where: { email: to } })).toMatchObject([{ reason: "COMPLAINED" }])
    })
  })

  describe("templates", () => {
    it("refuses unknown variables, and archiving frees the name without touching sent messages", async () => {
      expect((await rejection(templates.createTemplate(u.sdr, { name: "Premier contact", subject: "Bonjour", body: "Bonjour {{firstname}}, une question." }))).code).toBe("invalid")
      const { id } = await templates.createTemplate(u.sdr, { name: "Premier contact", subject: "{{entreprise}}", body: "Bonjour {{prenom|Madame, Monsieur}}, une question." })
      expect((await rejection(templates.createTemplate(u.sdr, { name: "Premier contact", subject: "x y", body: "Une autre question." }))).code).toBe("duplicate")
      const m = await mailbox(u.sdr.id)
      await send(u.sdr, (await lead()).id, m.id, { templateId: id })
      await templates.archiveTemplate(u.sdr, id)
      expect(await templates.listTemplates(u.sdr)).toEqual([])
      await templates.createTemplate(u.sdr, { name: "Premier contact", subject: "x y", body: "Une autre question." })
      expect(await prisma.emailMessage.count({ where: { templateId: id } })).toBe(1)
    })
  })
})
