// E22 drafting and replies. Needs a disposable PostgreSQL with the migrations applied (never your development database):
//   TEST_DATABASE_URL=postgresql://… npx vitest run tests/drafts-replies.integration.test.ts
// The models and the SMTP server are fakes: nothing leaves the machine.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { Experimental_DecisionMockModelV4, MockLanguageModelV4 } from "ai/test"
import type { AuditReport } from "@/features/prospect-audit/schemas"
import { resetDatabase } from "./helpers/reset-db"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

const REPORT: AuditReport = {
  findings: [
    { area: "mobile", severity: "high", title: "Site non adapté au téléphone", detail: "Il faut zoomer pour lire la page sur mobile.", evidence: ["P1"], origin: "measure" },
    { area: "seoLocal", severity: "medium", title: "Seulement 8 avis Google", detail: "Les concurrents en ont davantage.", evidence: ["S1"], origin: "measure" },
  ],
  strengths: [],
  frictions: [],
  opportunities: [],
  signals: [],
  evidence: [
    { id: "P1", kind: "page", label: "Accueil", value: "Plombier à Lyon", url: "https://plomberie.test/" },
    { id: "S1", kind: "source", label: "Fiche Google (Extractor)", value: "4,2/5, 8 avis", url: null },
  ],
  people: [],
  registry: null,
  site: { reachable: true, pages: ["https://plomberie.test/"], cms: null, blockedByRobots: false },
  notes: [],
  models: { extraction: null, analysis: null },
}

suite("Drafts and replies (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let catalog: typeof import("@/features/ai/catalog")
  let handlers: typeof import("@/features/ai/handlers")
  let runner: typeof import("@/worker/runner")
  let triage: typeof import("@/features/reply-triage/handler")
  let writer: typeof import("@/features/email-draft/handler")
  let drafts: typeof import("@/features/email-draft/service")
  let svc: typeof import("@/features/outreach/service")
  let replies: typeof import("@/features/outreach/replies")
  let boxes: typeof import("@/features/outreach/mailboxes")
  let transport: typeof import("@/features/outreach/transport")
  let PRICES: typeof import("@/lib/ai/pricing").DEFAULT_PRICES
  type U = import("@/lib/auth/guard").CurrentUser
  const u: Record<string, U> = {}
  const ws = "ws_default"
  let leadId = ""
  let mailboxId = ""
  let sent: { to: string; subject: string; text: string; headers: Record<string, string> }[] = []
  let prompts: string[] = []
  let decision: Record<string, unknown> = {}

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.MAILBOX_SECRET_KEY = Buffer.alloc(32, 3).toString("base64")
    process.env.OUTREACH_LINK_SECRET = "test-secret-for-unsubscribe-links"
    process.env.NEXT_PUBLIC_APP_URL = "https://cleads.test"
    prisma = (await import("@/lib/prisma")).prisma
    catalog = await import("@/features/ai/catalog")
    handlers = await import("@/features/ai/handlers")
    runner = await import("@/worker/runner")
    triage = await import("@/features/reply-triage/handler")
    writer = await import("@/features/email-draft/handler")
    drafts = await import("@/features/email-draft/service")
    svc = await import("@/features/outreach/service")
    replies = await import("@/features/outreach/replies")
    boxes = await import("@/features/outreach/mailboxes")
    transport = await import("@/features/outreach/transport")
    PRICES = (await import("@/lib/ai/pricing")).DEFAULT_PRICES
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })

  const textModel = new MockLanguageModelV4({
    doGenerate: async (options) => {
      const messages = options.prompt as { role: string; content: string | { type: string; text?: string }[] }[]
      const prompt = messages.filter((m) => m.role === "user").map((m) => (typeof m.content === "string" ? m.content : m.content.map((p) => p.text ?? "").join(""))).join("\n")
      prompts.push(prompt)
      const answer = prompt.includes("Rédige le premier email")
        ? { subject: "Votre site sur téléphone", body: "Bonjour Jean,\n\nSur téléphone, votre page d'accueil s'affiche en version réduite : il faut zoomer pour lire vos services. Vos clients pressés appellent alors un concurrent.\n\nNous refaisons des sites pensés pour le mobile, avec le numéro visible dès l'arrivée.\n\nAuriez-vous 15 minutes jeudi ou vendredi pour en parler ?", facts: [{ text: "La page d'accueil n'est pas adaptée au téléphone.", evidence: ["P1"] }, { text: "Un fait inventé.", evidence: ["Z9"] }] }
        : prompt.includes("Rédige la réponse")
          ? { body: "Bonjour Jean,\n\nMerci pour votre retour. Le plus simple est d'en parler 15 minutes de vive voix : je vous montrerai ce que nous ferions pour votre site." }
          : { subject: "", body: "Bonjour {{prenom|Madame, Monsieur}},\n\nJe reviens vers vous au sujet de la visibilité de {{entreprise}} à {{ville}}, et de votre {{telephone}}. Seriez-vous disponible 15 minutes cette semaine ?" }
      return {
        content: [{ type: "text", text: JSON.stringify(answer) }],
        finishReason: { unified: "stop", raw: undefined },
        usage: { inputTokens: { total: 2000, noCache: 2000, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 700, text: 300, reasoning: 400 } },
        warnings: [],
      }
    },
  })
  const decisionModel = new Experimental_DecisionMockModelV4({ doDecide: async () => ({ answers: decision as never, usage: { inputTokens: 900, outputTokens: 0 }, warnings: [] }) })
  // A decision model gives a complete distribution over the options.
  const classes = (top: string, p: number) => Object.fromEntries(["INTERESTED", "NOT_NOW", "NOT_INTERESTED", "OUT_OF_OFFICE", "WRONG_PERSON", "STOP", "OTHER"].map((c) => [c, c === top ? p : (1 - p) / 6]))
  const interested = { reply: { type: "choice", choice: "INTERESTED", probabilities: classes("INTERESTED", 0.93) }, urgency: { type: "choice", choice: "HIGH", probabilities: { HIGH: 0.8, NORMAL: 0.15, LOW: 0.05 } }, action: { type: "boolean", probability: 0.9 } }

  const worker = () => new runner.AgentWorker({ id: "w1", version: "test", concurrency: 2, perAgent: {}, pollIdleMs: 50, pollBusyMs: 10, maintenanceMs: 60_000, beatMs: 60_000, heartbeatMs: 40 }, { publish: async () => undefined })
  async function drain() {
    const w = worker()
    while ((await w.tick()) > 0) await w.idle()
    await w.idle()
  }

  beforeEach(async () => {
    await resetDatabase(prisma)
    handlers.clearAgentHandlers()
    handlers.registerAgentHandler("replies", (job) => triage.runReplyTriage(job, { decisionModel: () => decisionModel, prices: PRICES }))
    handlers.registerAgentHandler("writer", (job) => writer.runWriter(job, { languageModel: () => textModel, prices: PRICES }))
    sent = []
    prompts = []
    decision = interested
    vi.spyOn(transport.transport, "verify").mockResolvedValue({ imap: true, sentFolder: "Sent" })
    vi.spyOn(transport.transport, "saveToSent").mockResolvedValue(true)
    vi.spyOn(transport.transport, "send").mockImplementation(async (_c, m) => {
      sent.push({ to: m.to, subject: m.subject, text: m.text, headers: m.headers })
      return { raw: Buffer.from("raw"), response: "250 OK" }
    })
    for (const [key, role] of [["owner", "OWNER"], ["sdr", "SDR"], ["sdr2", "SDR"], ["closer", "CLOSER"], ["viewer", "VIEWER"]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@team.test`, name: `${key} Test`, role, workspaceId: ws } })
      u[key] = { id: x.id, workspaceId: ws, name: `${key} Test`, email: x.email!, image: null, role }
    }
    const box = await boxes.createMailbox(u.owner, { address: "lea@trycleads.test", displayName: "Léa Martin", ownerId: u.sdr.id, username: "lea@trycleads.test", password: "app-password", dailyCap: 30, alreadyWarm: true, smtpHost: "smtp.trycleads.test", smtpPort: 465, smtpSecure: true, imapHost: "imap.trycleads.test", imapPort: 993, imapSecure: true, sentFolder: null, signature: null })
    mailboxId = box.mailbox.id
    const company = await prisma.company.create({ data: { workspaceId: ws, name: "Plomberie Dupont", city: "Lyon", sector: "Plombier", website: "https://plomberie.test", domain: "plomberie.test" } })
    const contact = await prisma.contact.create({ data: { workspaceId: ws, companyId: company.id, name: "Jean Dupont", email: "jean@plomberie.test", emailKind: "NOMINATIVE" } })
    leadId = (await prisma.lead.create({ data: { workspaceId: ws, companyId: company.id, contactId: contact.id, ownerId: u.sdr.id, source: "EXTRACTOR" } })).id
    await catalog.ensureAgentCatalog(ws)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const audit = () =>
    prisma.prospectAudit.create({
      data: { workspaceId: ws, leadId, domain: "plomberie.test", url: "https://plomberie.test/", status: "COMPLETE", scores: {}, score: 40, summary: ["Site illisible sur téléphone", "Peu d'avis Google"], report: REPORT, validUntil: new Date(Date.now() + 30 * 86_400_000) },
    })

  /** Our first email (sent once per test), then an answer to it, as the mailbox reader files it. */
  async function thread(body = "Bonjour, oui ça m'intéresse, rappelez-moi demain matin. Jean", from = "jean@plomberie.test") {
    if (!(await prisma.emailMessage.count({ where: { direction: "OUTBOUND" } }))) {
      await svc.sendToLead(u.sdr, leadId, { mailboxId, subject: "Votre site sur téléphone", body: "Bonjour Jean,\n\nUne question rapide sur votre site." })
    }
    const ours = await prisma.emailMessage.findFirstOrThrow({ where: { direction: "OUTBOUND" }, orderBy: { createdAt: "asc" } })
    return prisma.emailMessage.create({
      data: { workspaceId: ws, mailboxId, leadId, contactId: ours.contactId, sentById: ours.sentById, direction: "INBOUND", status: "RECEIVED", fromEmail: from, toEmail: "lea@trycleads.test", subject: `Re: ${ours.subject}`, bodyText: body, messageId: `<reply-${Math.random().toString(36).slice(2)}@plomberie.test>`, inReplyTo: ours.messageId, repliesToId: ours.id, sentAt: new Date() },
    })
  }

  describe("filing replies (Jev)", () => {
    it("suggests how to file a reply, with its probabilities, and leaves the decision to a person", async () => {
      const reply = await thread()
      expect(await triage.enqueueTriage(ws, leadId, [reply.id])).toBe("queued")
      await drain()
      const t = await prisma.replyTriage.findUniqueOrThrow({ where: { emailId: reply.id } })
      expect(t).toMatchObject({ replyClass: "INTERESTED", classConfidence: 0.93, outcome: "AUTO", urgency: "HIGH", needsAction: true, actionConfidence: 0.9, model: "typesafe-ai/jev" })
      // Nothing is filed by itself.
      expect((await prisma.emailMessage.findUniqueOrThrow({ where: { id: reply.id } })).replyClass).toBeNull()
      const view = (await replies.listReplies(u.sdr)).items.find((r) => r.id === reply.id)!
      expect(view.triage).toEqual({ replyClass: "INTERESTED", confidence: 0.93, outcome: "AUTO", urgency: "HIGH", needsAction: true })
      // The reply's text stays in the mailbox: the run keeps only which reply it read.
      const steps = await prisma.agentStep.findMany({ where: { run: { agentId: "replies" } } })
      expect(steps.map((s) => s.name)).toEqual(["classify_reply"])
      expect(JSON.stringify(steps)).not.toContain("rappelez-moi")
      // Confirming is the existing filing, in one click.
      await replies.updateReply(u.sdr, reply.id, { replyClass: "INTERESTED" })
      expect((await prisma.emailMessage.findUniqueOrThrow({ where: { id: reply.id } })).replyClass).toBe("INTERESTED")
    })

    it("leaves an uncertain reply « à classer », and a refusal to a person", async () => {
      decision = { ...interested, reply: { type: "choice", choice: "NOT_NOW", probabilities: classes("NOT_NOW", 0.5) } }
      const unsure = await thread()
      await triage.enqueueTriage(ws, leadId, [unsure.id])
      await drain()
      expect(await prisma.replyTriage.findUniqueOrThrow({ where: { emailId: unsure.id } })).toMatchObject({ replyClass: "NOT_NOW", classConfidence: 0.5, outcome: "HUMAN" })
      decision = { ...interested, reply: { type: "refusal" } }
      const refused = await thread("…", "autre@plomberie.test")
      await triage.enqueueTriage(ws, leadId, [refused.id])
      await drain()
      expect(await prisma.replyTriage.findUniqueOrThrow({ where: { emailId: refused.id } })).toMatchObject({ replyClass: null, classConfidence: null, outcome: "HUMAN" })
      // Asking again would get the same answer: the run ends at once, without a second try.
      expect(await prisma.agentRun.findFirstOrThrow({ where: { agentId: "replies" }, orderBy: { createdAt: "desc" } })).toMatchObject({ status: "SUCCEEDED", attempts: 1 })
    })

    it("files replies that arrive together in one run, and catches up what could not be queued", async () => {
      const first = await thread()
      const second = await prisma.emailMessage.create({ data: { ...(({ id: _id, createdAt: _c, ...rest }) => rest)(first), messageId: "<second@plomberie.test>", bodyText: "Et aussi : quel serait le prix ?" } })
      expect(await triage.enqueueTriage(ws, leadId, [first.id])).toBe("queued")
      // A run of the fiche is waiting: it takes the second reply too.
      expect(await triage.enqueueTriage(ws, leadId, [second.id])).toBe("busy")
      await drain()
      expect(await prisma.replyTriage.count()).toBe(2)
      expect(await prisma.agentRun.count({ where: { agentId: "replies" } })).toBe(1)

      // A reply the fast path missed is queued by the worker's sweep, once its fiche has rested.
      const missed = await thread("Pas intéressé, merci.", "marc@plomberie.test")
      await prisma.emailMessage.update({ where: { id: missed.id }, data: { createdAt: new Date(Date.now() - 5 * 60_000) } })
      expect(await triage.sweepTriage()).toBe(0)
      await prisma.agentRun.updateMany({ where: { agentId: "replies" }, data: { createdAt: new Date(Date.now() - 3600_000) } })
      expect(await triage.sweepTriage()).toBe(1)
      await drain()
      expect(await prisma.replyTriage.count({ where: { emailId: missed.id } })).toBe(1)
      // Filed by a person, or automatic: never sent to Jev.
      expect(await triage.sweepTriage()).toBe(0)
    })
  })

  describe("first email", () => {
    it("drafts from the audit, keeps only sourced facts, and measures what the person changed", async () => {
      await expect(drafts.requestFirstDraft(u.sdr, leadId)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/Auditez d’abord/) })
      await audit()
      await expect(drafts.requestFirstDraft(u.viewer, leadId)).rejects.toMatchObject({ status: 403 })
      await expect(drafts.requestFirstDraft(u.sdr2, leadId)).rejects.toMatchObject({ status: 404 })
      const ctx = await svc.composeContext(u.sdr, leadId)
      expect(ctx.ai).toEqual({ available: true, canDraft: true, reason: null })

      const { runId } = await drafts.requestFirstDraft(u.sdr, leadId)
      await drain()
      const state = await drafts.draftState(u.sdr, runId)
      expect(state).toMatchObject({ status: "SUCCEEDED", draft: { kind: "FIRST_EMAIL", subject: "Votre site sur téléphone" } })
      const draft = state.draft!
      expect(draft.facts).toEqual([{ text: "La page d'accueil n'est pas adaptée au téléphone.", evidence: [expect.objectContaining({ id: "P1", label: "Accueil" })] }])
      expect(draft.body).toMatch(/^Bonjour Jean,/)
      // The prospect's data is fenced; the contact's email address is never sent to the model.
      expect(prompts[0]).toContain('<contenu_externe source="fiche et audit de plomberie.test">')
      expect(prompts[0]).not.toContain("jean@plomberie.test")
      await expect(drafts.draftState(u.sdr2, runId)).rejects.toMatchObject({ status: 404 })

      await svc.sendToLead(u.sdr, leadId, { mailboxId, subject: draft.subject, body: `${draft.body}\n\nBien à vous`, draftId: draft.id })
      const used = await prisma.emailDraft.findUniqueOrThrow({ where: { id: draft.id } })
      expect(used.sentEmailId).not.toBeNull()
      expect(used.editRatio).toBeGreaterThan(0)
      expect(used.editRatio).toBeLessThan(0.1)
      expect(sent.at(-1)!.text).toContain("Auriez-vous 15 minutes")
    })
  })

  describe("answering a reply", () => {
    it("drafts an answer with the booking link, and sends it in the thread right after our first email", async () => {
      await prisma.bookingProfile.create({ data: { workspaceId: ws, hostId: u.sdr.id, slug: "lea-martin", enabled: true } })
      const reply = await thread()
      const { runId } = await drafts.requestReplyDraft(u.sdr, reply.id)
      await drain()
      const draft = (await drafts.draftState(u.sdr, runId)).draft!
      expect(draft).toMatchObject({ kind: "REPLY", subject: "Re: Votre site sur téléphone" })
      // The link is the CRM's, written after the model's text.
      expect(draft.body).toMatch(/Choisissez le créneau qui vous convient : https:\/\/cleads\.test\/rdv\/lea-martin$/)
      expect(prompts[0]).toContain('<contenu_externe source="réponse de jean@plomberie.test">')

      const before = sent.length
      await svc.answerReply(u.sdr, reply.id, { subject: draft.subject, body: draft.body, draftId: draft.id })
      expect(sent).toHaveLength(before + 1)
      const answer = sent.at(-1)!
      expect(answer).toMatchObject({ to: "jean@plomberie.test", subject: "Re: Votre site sur téléphone" })
      expect(answer.headers["In-Reply-To"]).toBe(reply.messageId)
      expect(answer.headers.References).toContain(reply.inReplyTo!)
      // The footer and the unsubscribe link are added, as in any prospecting email.
      expect(answer.text).toMatch(/Pour ne plus recevoir d’emails de notre part/)
      expect(await prisma.emailDraft.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ editRatio: 0 })
      expect((await prisma.emailMessage.findUniqueOrThrow({ where: { id: reply.id } })).readAt).not.toBeNull()
      expect(await prisma.activity.count({ where: { leadId, kind: "EMAIL", data: { path: ["answeredReplyId"], equals: reply.id } } })).toBe(1)
    })

    it("refuses to write to someone who asked to stop, or whose address is excluded", async () => {
      const reply = await thread("Ne m'écrivez plus.")
      const other = await prisma.emailMessage.create({ data: { ...(({ id: _id, createdAt: _c, ...rest }) => rest)(reply), messageId: "<paul@plomberie.test>", fromEmail: "paul@plomberie.test", bodyText: "Oui pourquoi pas" } })
      await replies.updateReply(u.sdr, reply.id, { replyClass: "STOP" })
      await expect(drafts.requestReplyDraft(u.sdr, reply.id)).rejects.toMatchObject({ status: 409 })
      await expect(svc.answerReply(u.sdr, reply.id, { subject: "Re: x", body: "Bonjour, une dernière chose." })).rejects.toMatchObject({ status: 409 })
      // The fiche's contact asked to stop: nobody on the fiche is written to any more, and an excluded address neither.
      await expect(svc.answerReply(u.sdr, other.id, { subject: "Re: x", body: "Bonjour, avec plaisir." })).rejects.toMatchObject({ status: 409, extra: { blocker: "do_not_contact" } })
      await prisma.contact.updateMany({ data: { doNotContact: false } })
      await prisma.suppression.create({ data: { workspaceId: ws, email: "paul@plomberie.test", reason: "UNSUBSCRIBED", source: "test" } })
      await expect(svc.answerReply(u.sdr, other.id, { subject: "Re: x", body: "Bonjour, avec plaisir." })).rejects.toMatchObject({ status: 409 })
      await expect(svc.answerReply(u.sdr2, other.id, { subject: "Re: x", body: "Bonjour, avec plaisir." })).rejects.toMatchObject({ status: 404 })
    })
  })

  describe("sequence steps", () => {
    it("drafts a step as a template, and says which variables do not exist", async () => {
      await expect(drafts.requestStepDraft(u.closer, { position: 2, delayDays: 3, previous: [] })).rejects.toMatchObject({ status: 403 })
      const { runId } = await drafts.requestStepDraft(u.sdr, { position: 2, delayDays: 3, brief: "SEO local pour les artisans", previous: [{ subject: "Votre fiche Google", body: "Bonjour {{prenom|Madame, Monsieur}}, une question sur votre fiche." }] })
      await drain()
      const draft = (await drafts.draftState(u.sdr, runId)).draft!
      expect(draft).toMatchObject({ kind: "SEQUENCE_STEP", subject: "" })
      expect(draft.body).toContain("{{entreprise}}")
      expect(draft.notes.join(" ")).toMatch(/Variable inconnue : \{\{telephone\}\}/)
      expect(prompts[0]).toContain("Consigne de l'équipe : SEO local pour les artisans")
      expect(await prisma.emailDraft.count({ where: { kind: "SEQUENCE_STEP", leadId: null } })).toBe(1)
    })
  })
})
