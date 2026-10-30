// Needs a disposable PostgreSQL with the migrations applied (never your development database).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { resetDatabase } from "./helpers/reset-db"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

suite("mail providers and bounce handling (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let mail: typeof import("@/lib/mail")
  let settings: typeof import("@/lib/mail/settings")
  let events: typeof import("@/lib/mail/events")
  const ws = "ws_default"
  const msg = { to: "paul@client.test", subject: "Hello", html: "<p>Hi</p>" }
  const spies: ReturnType<typeof vi.spyOn>[] = []

  /** Both providers are made to look configured and their send is replaced: nothing reaches the network. */
  function fake(behaviour: { ses?: "ok" | "fail" | "off"; resend?: "ok" | "fail" | "off" }) {
    const sent: string[] = []
    for (const id of ["ses", "resend"] as const) {
      const mode = behaviour[id] ?? "ok"
      spies.push(vi.spyOn(mail.providers[id], "configured").mockReturnValue(mode !== "off"))
      spies.push(vi.spyOn(mail.providers[id], "send").mockImplementation(async (m) => {
        sent.push(`${id}:${m.to.join(",")}`)
        if (mode === "fail") throw new Error(`${id} down`)
        return { id: `${id}-id` }
      }))
    }
    return sent
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    prisma = (await import("@/lib/prisma")).prisma
    mail = await import("@/lib/mail")
    settings = await import("@/lib/mail/settings")
    events = await import("@/lib/mail/events")
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })
  beforeEach(async () => {
    await resetDatabase(prisma)
    settings.clearMailSettingsCache()
    vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => {
    spies.splice(0).forEach((s) => s.mockRestore())
    vi.restoreAllMocks()
    delete process.env.MAIL_PROVIDER
  })

  describe("sending", () => {
    it("refuses outreach outright: cold mail never goes through SES or Resend", async () => {
      const sent = fake({})
      await expect(mail.sendMail(msg, { purpose: "outreach" as never, workspaceId: ws })).rejects.toBeInstanceOf(mail.MailPolicyError)
      expect(sent).toEqual([])
    })

    it("uses SES by default when it is configured, and says which provider carried the mail", async () => {
      const sent = fake({})
      const r = await mail.sendMail(msg, { purpose: "transactional", workspaceId: ws })
      expect(r).toMatchObject({ ok: true, provider: "ses", messageId: "ses-id", attempts: [] })
      expect(sent).toEqual(["ses:paul@client.test"])
    })

    it("falls back to Resend when SES fails, and keeps the reason", async () => {
      const sent = fake({ ses: "fail" })
      const r = await mail.sendMail(msg, { purpose: "transactional", workspaceId: ws })
      expect(r).toMatchObject({ ok: true, provider: "resend" })
      expect(r.attempts).toEqual([{ provider: "ses", error: "ses down" }])
      expect(sent).toEqual(["ses:paul@client.test", "resend:paul@client.test"])
    })

    it("does not fall back when the fallback is switched off, and reports the failure instead of throwing", async () => {
      const sent = fake({ ses: "fail" })
      await settings.saveMailSettings(ws, { transactionalProvider: "ses", fallbackEnabled: false }, (await prisma.user.create({ data: { email: "o@mail.test", role: "OWNER", workspaceId: ws } })).id)
      const r = await mail.sendMail(msg, { purpose: "transactional", workspaceId: ws })
      expect(r).toMatchObject({ ok: false, provider: null })
      expect(r.attempts).toHaveLength(1)
      expect(sent).toEqual(["ses:paul@client.test"])
    })

    it("fails cleanly when both providers fail", async () => {
      fake({ ses: "fail", resend: "fail" })
      const r = await mail.sendMail(msg, { purpose: "transactional", workspaceId: ws })
      expect(r.ok).toBe(false)
      expect(r.attempts.map((a) => a.provider)).toEqual(["ses", "resend"])
    })

    it("skips providers that are not configured, and reports when none is", async () => {
      const sent = fake({ ses: "off" })
      expect(await mail.sendMail(msg, { purpose: "transactional", workspaceId: ws })).toMatchObject({ ok: true, provider: "resend" })
      expect(sent).toEqual(["resend:paul@client.test"])
      fake({ ses: "off", resend: "off" })
      expect(await mail.sendMail(msg, { purpose: "transactional", workspaceId: ws })).toMatchObject({ ok: false, skipped: "not_configured" })
    })

    it("follows the provider chosen in the settings", async () => {
      const sent = fake({})
      const owner = await prisma.user.create({ data: { email: "o@mail.test", role: "OWNER", workspaceId: ws } })
      await settings.saveMailSettings(ws, { transactionalProvider: "resend", fallbackEnabled: true }, owner.id)
      await mail.sendMail(msg, { purpose: "transactional", workspaceId: ws })
      expect(sent).toEqual(["resend:paul@client.test"])
    })

    it("defaults to Resend when SES has no keys, and MAIL_PROVIDER can force a default", () => {
      fake({ ses: "off" })
      expect(settings.defaultProvider()).toBe("resend")
      fake({})
      expect(settings.defaultProvider()).toBe("ses")
      process.env.MAIL_PROVIDER = "resend"
      expect(settings.defaultProvider()).toBe("resend")
    })

    it("normalises and de-duplicates recipients", async () => {
      const sent = fake({})
      await mail.sendMail({ ...msg, to: ["Paul@Client.test ", "paul@client.test"] }, { purpose: "transactional", workspaceId: ws })
      expect(sent).toEqual(["ses:paul@client.test"])
    })

    it("never writes to an address that bounced for good or complained, but still writes to an unsubscribed one", async () => {
      const sent = fake({})
      await prisma.suppression.createMany({ data: [
        { workspaceId: ws, email: "bounced@client.test", reason: "BOUNCED" },
        { workspaceId: ws, email: "angry@client.test", reason: "COMPLAINED" },
        { workspaceId: ws, email: "unsub@client.test", reason: "UNSUBSCRIBED" },
      ] })
      expect(await mail.sendMail({ ...msg, to: "bounced@client.test" }, { purpose: "transactional", workspaceId: ws })).toMatchObject({ ok: false, skipped: "suppressed" })
      expect(await mail.sendMail({ ...msg, to: "angry@client.test" }, { purpose: "transactional", workspaceId: ws })).toMatchObject({ ok: false, skipped: "suppressed" })
      expect(sent).toEqual([])
      // A booking confirmation is not marketing: unsubscribing from prospecting does not cancel it.
      expect((await mail.sendMail({ ...msg, to: ["unsub@client.test", "bounced@client.test"] }, { purpose: "transactional", workspaceId: ws })).ok).toBe(true)
      expect(sent).toEqual(["ses:unsub@client.test"])
    })

    it("sendTest uses exactly the chosen provider, with no fallback", async () => {
      const sent = fake({ ses: "fail" })
      expect(await mail.sendTest("ses", "me@mail.test")).toMatchObject({ ok: false, provider: "ses" })
      expect(sent).toEqual(["ses:me@mail.test"])
      expect(await mail.sendTest("resend", "me@mail.test")).toMatchObject({ ok: true, provider: "resend" })
      fake({ resend: "off" })
      expect(await mail.sendTest("resend", "me@mail.test")).toMatchObject({ ok: false, skipped: "not_configured" })
    })

    it("signs with the CRM sender by default", () => {
      expect(mail.defaultFrom()).toMatch(/^Cleads <.+@.+>$/)
    })
  })

  describe("settings", () => {
    it("start from the defaults, then keep what an owner saved", async () => {
      fake({})
      const first = await settings.getMailSettings(ws)
      expect(first).toMatchObject({ transactionalProvider: "ses", fallbackEnabled: true, source: "default" })
      const owner = await prisma.user.create({ data: { email: "o@mail.test", role: "OWNER", workspaceId: ws } })
      const saved = await settings.saveMailSettings(ws, { transactionalProvider: "resend", fallbackEnabled: false }, owner.id)
      expect(saved).toMatchObject({ transactionalProvider: "resend", fallbackEnabled: false, source: "database" })
      settings.clearMailSettingsCache()
      expect(await settings.getMailSettings(ws)).toMatchObject({ transactionalProvider: "resend", fallbackEnabled: false })
    })
    it("a provider name the database does not allow is refused by the table itself", async () => {
      await expect(prisma.$executeRawUnsafe(`INSERT INTO "MailSetting" ("workspaceId","transactionalProvider","updatedAt") VALUES ('${ws}','smtp-lol', now())`)).rejects.toBeTruthy()
    })
  })

  describe("bounces and complaints", () => {
    it("a permanent bounce suppresses the address and stops contacting the person everywhere; a replay changes nothing", async () => {
      const c = await prisma.company.create({ data: { workspaceId: ws, name: "Acme" } })
      const k = await prisma.contact.create({ data: { workspaceId: ws, companyId: c.id, name: "Paul", email: "paul@client.test" } })
      const targets = events.suppressionTargets({ eventType: "Bounce", bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: "Paul@client.test" }] } })
      expect(await events.applySuppressions(ws, targets)).toBe(1)
      expect(await events.applySuppressions(ws, targets)).toBe(0)
      expect(await prisma.suppression.findMany({ where: { workspaceId: ws } })).toMatchObject([{ email: "paul@client.test", reason: "BOUNCED", source: "ses" }])
      expect(await prisma.contact.findUniqueOrThrow({ where: { id: k.id } })).toMatchObject({ doNotContact: true, doNotContactReason: expect.stringMatching(/rebond/i) })
      expect(await prisma.auditLog.count({ where: { action: "mail.bounce" } })).toBe(2)
    })
    it("a complaint outranks an earlier unsubscribe or manual entry, but a bounce does not downgrade a complaint", async () => {
      await prisma.suppression.createMany({ data: [{ workspaceId: ws, email: "a@client.test", reason: "UNSUBSCRIBED" }, { workspaceId: ws, email: "b@client.test", reason: "COMPLAINED" }] })
      await events.applySuppressions(ws, [{ email: "a@client.test", reason: "COMPLAINED", detail: "abuse" }, { email: "b@client.test", reason: "BOUNCED", detail: "" }])
      expect((await prisma.suppression.findFirstOrThrow({ where: { email: "a@client.test" } })).reason).toBe("COMPLAINED")
      expect((await prisma.suppression.findFirstOrThrow({ where: { email: "b@client.test" } })).reason).toBe("COMPLAINED")
    })
  })

  describe("the webhook", () => {
    const TOPIC = "arn:aws:sns:eu-north-1:484907492647:cleads-ses-events"
    const bounce = JSON.stringify({ eventType: "Bounce", bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: "hook@client.test" }] } })
    let route: typeof import("@/app/api/webhooks/ses/route")
    const post = (body: unknown) => route.POST(new Request("http://localhost/api/webhooks/ses", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }))
    const note = (over: object = {}) => ({ Type: "Notification", MessageId: "1", TopicArn: TOPIC, Message: bounce, Timestamp: "t", SignatureVersion: "2", Signature: "s", SigningCertURL: "https://sns.eu-north-1.amazonaws.com/SimpleNotificationService-a.pem", ...over })

    beforeEach(async () => {
      vi.resetModules()
      vi.doMock("@/lib/mail/sns", async (orig) => ({ ...(await orig<typeof import("@/lib/mail/sns")>()), verifySnsMessage: vi.fn(async (m: { Signature: string }) => m.Signature === "s") }))
      process.env.DATABASE_URL = url
      route = await import("@/app/api/webhooks/ses/route")
      await prisma.workspace.upsert({ where: { id: ws }, update: {}, create: { id: ws, name: "Default", slug: "default" } })
      process.env.SES_SNS_TOPIC_ARN = TOPIC
    })
    afterEach(() => {
      vi.doUnmock("@/lib/mail/sns")
      delete process.env.SES_SNS_TOPIC_ARN
    })

    it("answers 503 until the topic is configured, and 403 for a bad signature or someone else's topic", async () => {
      delete process.env.SES_SNS_TOPIC_ARN
      expect((await post(note())).status).toBe(503)
      process.env.SES_SNS_TOPIC_ARN = TOPIC
      expect((await post(note({ Signature: "forged" }))).status).toBe(403)
      expect((await post(note({ TopicArn: "arn:aws:sns:eu-north-1:999999999999:attacker" }))).status).toBe(403)
      expect((await post("not json")).status).toBe(400)
      expect(await prisma.suppression.count()).toBe(0)
    })

    it("suppresses the bounced address from a genuine notification, and reports what it did", async () => {
      const res = await post(note())
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ suppressed: 1 })
      expect((await prisma.suppression.findFirstOrThrow({ where: { email: "hook@client.test" } })).reason).toBe("BOUNCED")
    })

    it("ignores events that suppress nothing and messages that are not SES events", async () => {
      expect(await (await post(note({ Message: JSON.stringify({ eventType: "Delivery" }) }))).json()).toEqual({ suppressed: 0 })
      expect(await (await post(note({ Message: "hello" }))).json()).toEqual({ ignored: "not an SES event" })
      expect(await (await post(note({ Type: "UnsubscribeConfirmation" }))).json()).toEqual({ ignored: "UnsubscribeConfirmation" })
    })

    it("confirms a subscription only on an AWS URL", async () => {
      const fetched: string[] = []
      vi.stubGlobal("fetch", vi.fn(async (u: string) => (fetched.push(u), new Response("ok"))))
      const good = "https://sns.eu-north-1.amazonaws.com/?Action=ConfirmSubscription&Token=abc"
      expect((await post(note({ Type: "SubscriptionConfirmation", SubscribeURL: good, Token: "abc" }))).status).toBe(200)
      expect(fetched).toEqual([good])
      expect((await post(note({ Type: "SubscriptionConfirmation", SubscribeURL: "https://evil.example/confirm", Token: "abc" }))).status).toBe(400)
      expect(fetched).toEqual([good])
      vi.unstubAllGlobals()
    })
  })
})
