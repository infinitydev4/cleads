// Needs a disposable PostgreSQL with the migrations applied (never your development database).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { resetDatabase } from "./helpers/reset-db"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

suite("outreach: reading replies and bounces (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let boxes: typeof import("@/features/outreach/mailboxes")
  let svc: typeof import("@/features/outreach/service")
  let poll: typeof import("@/features/outreach/poll")
  let replies: typeof import("@/features/outreach/replies")
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
    poll = await import("@/features/outreach/poll")
    replies = await import("@/features/outreach/replies")
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

  async function sentMessage(opts: { status?: "NEW" | "CONTACTED" } = {}) {
    const m = await mailbox(u.sdr.id)
    const l = await lead({ status: opts.status ?? "NEW" })
    const { emailId } = await svc.sendToLead(u.sdr, l.id, { mailboxId: m.id, subject: "Une question rapide", body: "Bonjour Jean, une question." })
    const row = await prisma.emailMessage.findUniqueOrThrow({ where: { id: emailId }, include: { lead: { include: { contact: true } } } })
    return { box: m, lead: l, row }
  }

  it("files a reply on the fiche: status Répondu, history, unread, scoped to the sender", async () => {
    const { box, lead: l, row } = await sentMessage()
    inbox = [{ uid: 10, source: reply("Jean <jean@plomberie.test>", box.address, row.messageId, "<r1@plomberie.test>") }]
    const s = await poll.pollMailbox(box.id)
    expect(s).toMatchObject({ replies: 1, bounces: 0 })
    const inbound = await prisma.emailMessage.findFirstOrThrow({ where: { direction: "INBOUND" } })
    expect(inbound).toMatchObject({ status: "RECEIVED", leadId: l.id, repliesToId: row.id, fromEmail: "jean@plomberie.test", readAt: null, replyClass: null })
    expect(inbound.bodyText).toBe("Oui, rappelez-moi.")
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("REPLIED")
    expect(await prisma.activity.count({ where: { leadId: l.id, kind: "EMAIL", data: { path: ["event"], equals: "replied" } } })).toBe(1)
    // The quota counts only what we sent.
    expect((await boxes.getMailbox(u.owner, box.id)).sentToday).toBe(1)
    // Seen by the sender and the team, not by another SDR.
    expect((await replies.listReplies(u.sdr)).unread).toBe(1)
    expect((await replies.listReplies(u.manager)).items).toHaveLength(1)
    expect((await replies.listReplies(u.sdr2)).items).toHaveLength(0)
    expect((await prisma.mailbox.findUniqueOrThrow({ where: { id: box.id } })).imapLastUid).toBe(10)
  })

  it("reads each message once: a re-read, an overlapping run and a rewound cursor change nothing", async () => {
    const { box, row } = await sentMessage()
    inbox = [{ uid: 10, source: reply("jean@plomberie.test", box.address, row.messageId, "<r1@plomberie.test>") }]
    await poll.pollMailbox(box.id)
    expect((await poll.pollMailbox(box.id)).replies).toBe(0)
    await prisma.mailbox.update({ where: { id: box.id }, data: { imapLastUid: null, imapUidValidity: null } })
    expect((await poll.pollMailbox(box.id)).replies).toBe(0)
    expect(await prisma.emailMessage.count({ where: { direction: "INBOUND" } })).toBe(1)
    // A run already in progress holds the claim.
    await prisma.mailbox.update({ where: { id: box.id }, data: { pollClaimedAt: new Date() } })
    const before = fetchCalls.length
    expect((await poll.pollMailbox(box.id)).mailboxes).toBe(0)
    expect(fetchCalls.length).toBe(before)
  })

  it("keeps an out-of-office notice from counting as an answer", async () => {
    const { box, lead: l, row } = await sentMessage()
    inbox = [{ uid: 11, source: reply("jean@plomberie.test", box.address, row.messageId, "<ooo@plomberie.test>", "Auto-Submitted: auto-replied\n") }]
    expect(await poll.pollMailbox(box.id)).toMatchObject({ replies: 0, automatic: 1 })
    const inbound = await prisma.emailMessage.findFirstOrThrow({ where: { direction: "INBOUND" } })
    expect(inbound).toMatchObject({ replyClass: "OUT_OF_OFFICE" })
    expect(inbound.readAt).not.toBeNull()
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("CONTACTED")
  })

  it("ignores other mail, and replies to messages that are not ours", async () => {
    const { box } = await sentMessage()
    inbox = [
      { uid: 20, source: crlf(`From: news@x.test\nTo: ${box.address}\nSubject: Promo\nMessage-ID: <p@x>\n\nSolde`) },
      { uid: 21, source: reply("jean@plomberie.test", box.address, "<unknown@elsewhere>", "<r9@x>") },
    ]
    expect(await poll.pollMailbox(box.id)).toMatchObject({ replies: 0, bounces: 0, errors: 0 })
    expect(await prisma.emailMessage.count({ where: { direction: "INBOUND" } })).toBe(0)
  })

  it("turns a permanent bounce into an exclusion and tells the fiche; a temporary one suppresses nothing", async () => {
    const { box, lead: l, row } = await sentMessage()
    inbox = [{ uid: 30, source: dsn(box.address, row.messageId, "4.2.2") }]
    expect(await poll.pollMailbox(box.id)).toMatchObject({ bounces: 1 })
    expect((await prisma.emailMessage.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("SENT")
    expect(await prisma.suppression.count()).toBe(0)

    inbox = [...inbox, { uid: 31, source: dsn(box.address, row.messageId, "5.1.1") }]
    await poll.pollMailbox(box.id)
    const after = await prisma.emailMessage.findUniqueOrThrow({ where: { id: row.id } })
    expect(after.status).toBe("BOUNCED")
    expect(after.error).toContain("5.1.1")
    expect(await prisma.suppression.findFirstOrThrow({ where: { email: row.toEmail } })).toMatchObject({ reason: "BOUNCED" })
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: row.lead!.contactId! } })).doNotContact).toBe(true)
    expect(await prisma.activity.count({ where: { leadId: l.id, data: { path: ["event"], equals: "bounced" } } })).toBe(1)
    // A bounced message still used its slot today.
    expect((await boxes.getMailbox(u.owner, box.id)).sentToday).toBe(1)
    // And the address can no longer be written to.
    const second = await rejection(send(u.sdr, l.id, box.id))
    expect(second.extra?.blocker).toBeTruthy()
  })

  it("does not suppress anyone for a bounce of a test message", async () => {
    const box = await mailbox(u.sdr.id)
    const { emailId } = await svc.sendTestEmail(u.sdr, box.id)
    const row = await prisma.emailMessage.findUniqueOrThrow({ where: { id: emailId } })
    inbox = [{ uid: 40, source: dsn(box.address, row.messageId, "5.1.1") }]
    await poll.pollMailbox(box.id)
    expect((await prisma.emailMessage.findUniqueOrThrow({ where: { id: emailId } })).status).toBe("BOUNCED")
    expect(await prisma.suppression.count()).toBe(0)
  })

  it("puts a mailbox in error when the login is refused, and only notes a network fault", async () => {
    const { box } = await sentMessage()
    fetchFailure = transport.toTransportError({ code: "ETIMEDOUT" }, "imap")
    await poll.pollMailbox(box.id)
    let row = await prisma.mailbox.findUniqueOrThrow({ where: { id: box.id } })
    expect(row).toMatchObject({ status: "ACTIVE", pollClaimedAt: null })
    expect(row.lastPollError).toMatch(/injoignable/)

    fetchFailure = transport.toTransportError({ code: "EAUTH" }, "imap")
    await poll.pollMailbox(box.id)
    row = await prisma.mailbox.findUniqueOrThrow({ where: { id: box.id } })
    expect(row.status).toBe("ERROR")
    // Back to normal: a good read clears the message.
    await boxes.testMailbox(u.owner, box.id)
    fetchFailure = null
    await poll.pollMailbox(box.id)
    expect((await prisma.mailbox.findUniqueOrThrow({ where: { id: box.id } })).lastPollError).toBeNull()
  })

  it("frees the slot of a send stuck in SENDING, and leaves recent ones alone", async () => {
    const { box, row } = await sentMessage()
    await prisma.emailMessage.update({ where: { id: row.id }, data: { status: "SENDING", createdAt: new Date(Date.now() - 20 * 60_000) } })
    const fresh = await svcFresh(box.id)
    expect(await poll.failStaleSends()).toBe(1)
    expect((await prisma.emailMessage.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("FAILED")
    expect((await prisma.emailMessage.findUniqueOrThrow({ where: { id: fresh } })).status).toBe("SENDING")
  })
  async function svcFresh(mailboxId: string) {
    const m = await prisma.emailMessage.create({ data: { workspaceId: ws, mailboxId, status: "SENDING", fromEmail: "a@trycleads.test", toEmail: "z@z.test", subject: "s", bodyText: "b", messageId: `<fresh-${Math.random()}@x>` } })
    return m.id
  }

  describe("filing replies", () => {
    it("marks read, classifies, and 'Ne plus écrire' excludes the address", async () => {
      const { box, lead: l, row } = await sentMessage()
      inbox = [{ uid: 50, source: reply("jean@plomberie.test", box.address, row.messageId, "<r5@plomberie.test>") }]
      await poll.pollMailbox(box.id)
      const inbound = await prisma.emailMessage.findFirstOrThrow({ where: { direction: "INBOUND" } })

      expect((await rejection(replies.updateReply(u.sdr2, inbound.id, { read: true }))).status).toBe(404)
      await replies.updateReply(u.sdr, inbound.id, { read: true })
      expect((await replies.listReplies(u.sdr)).unread).toBe(0)

      await replies.updateReply(u.sdr, inbound.id, { replyClass: "NOT_NOW" })
      expect(await prisma.suppression.count()).toBe(0)
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("REPLIED")

      await replies.updateReply(u.sdr, inbound.id, { replyClass: "STOP" })
      const stops = await prisma.suppression.findMany()
      expect(stops.map((s) => s.email).sort()).toEqual([row.toEmail, "jean@plomberie.test"].sort())
      expect(stops.every((s) => s.reason === "UNSUBSCRIBED")).toBe(true)
      expect((await prisma.contact.findUniqueOrThrow({ where: { id: row.lead!.contactId! } })).doNotContact).toBe(true)
      expect((await rejection(send(u.sdr, l.id, box.id))).extra?.blocker).toBeTruthy()
    })
  })
})
