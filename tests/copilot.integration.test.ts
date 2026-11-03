// E24 copilot. Needs a disposable PostgreSQL with the migrations applied (never your development database):
//   TEST_DATABASE_URL=postgresql://… npx vitest run tests/copilot.integration.test.ts
// The model is a fake that streams what each test scripts: nothing leaves the machine.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { MockLanguageModelV4 } from "ai/test"
import { simulateReadableStream } from "ai"
import { resetDatabase } from "./helpers/reset-db"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

const usage = (input: number, output: number) => ({ inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: output, text: output, reasoning: 0 } })

interface Step {
  text?: string
  tools?: { name: string; input: unknown }[]
  /** Milliseconds between two pieces of text: a slow answer. */
  delay?: number
}

suite("Copilot (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let catalog: typeof import("@/features/ai/catalog")
  let copilot: typeof import("@/features/copilot/turn")
  let conversations: typeof import("@/features/copilot/conversations")
  let forget: typeof import("@/features/copilot/forget")
  let leads: typeof import("@/features/leads/service")
  let PRICES: typeof import("@/lib/ai/pricing").DEFAULT_PRICES
  type U = import("@/lib/auth/guard").CurrentUser
  type Message = import("@/features/copilot/messages").CopilotMessage
  const u: Record<string, U> = {}
  const ws = "ws_default"
  let leadId = ""
  let script: Step[] = []
  let calls: { prompt: unknown; maxOutputTokens?: number; reasoning?: string }[] = []
  let callId = 0

  const model = new MockLanguageModelV4({
    doStream: async (options) => {
      calls.push({ prompt: options.prompt, maxOutputTokens: options.maxOutputTokens, reasoning: (options as { reasoning?: string }).reasoning })
      const step = script.shift() ?? { text: "D'accord." }
      const pieces = step.text ? (step.delay ? step.text.match(/[\s\S]{1,8}/g)! : [step.text]) : []
      return {
        stream: simulateReadableStream({
          chunkDelayInMs: step.delay ?? 0,
          chunks: [
            ...(pieces.length ? [{ type: "text-start", id: "t" }, ...pieces.map((delta) => ({ type: "text-delta", id: "t", delta })), { type: "text-end", id: "t" }] : []),
            ...(step.tools ?? []).map((t) => ({ type: "tool-call", toolCallId: `call-${++callId}`, toolName: t.name, input: JSON.stringify(t.input) })),
            { type: "finish", finishReason: { unified: step.tools?.length ? "tool-calls" : "stop", raw: undefined }, usage: usage(3_000, 300) },
          ],
        }),
      } as never
    },
  })

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    prisma = (await import("@/lib/prisma")).prisma
    catalog = await import("@/features/ai/catalog")
    copilot = await import("@/features/copilot/turn")
    conversations = await import("@/features/copilot/conversations")
    forget = await import("@/features/copilot/forget")
    leads = await import("@/features/leads/service")
    PRICES = (await import("@/lib/ai/pricing")).DEFAULT_PRICES
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await resetDatabase(prisma)
    script = []
    calls = []
    for (const [key, role] of [["owner", "OWNER"], ["sdr", "SDR"], ["closer", "CLOSER"], ["viewer", "VIEWER"]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@team.test`, name: `${key} Test`, role, workspaceId: ws } })
      u[key] = { id: x.id, workspaceId: ws, name: `${key} Test`, email: x.email!, image: null, role }
    }
    const company = await prisma.company.create({ data: { workspaceId: ws, name: "Plomberie Dupont", city: "Lyon", sector: "Plombier", website: "https://plomberie.test", domain: "plomberie.test", phone: "0478000000" } })
    const contact = await prisma.contact.create({ data: { workspaceId: ws, companyId: company.id, name: "Jean Dupont", jobTitle: "Gérant", email: "jean@plomberie.test", phone: "0611223344", emailKind: "NOMINATIVE" } })
    leadId = (await prisma.lead.create({ data: { workspaceId: ws, companyId: company.id, contactId: contact.id, ownerId: u.sdr.id, source: "EXTRACTOR" } })).id
    await catalog.ensureAgentCatalog(ws)
  })

  const question = (id: string, text: string) => ({ id, role: "user", parts: [{ type: "text", text }] })

  /** One turn, read to its end, with the saving it schedules after the response. */
  async function turn(user: U, body: Record<string, unknown>, opts: { deadlineMs?: number } = {}) {
    const tasks: Promise<unknown>[] = []
    const res = await copilot.copilotTurn(user, body, undefined, { languageModel: () => model, prices: PRICES, keepAlive: (t) => tasks.push(t), deadlineMs: opts.deadlineMs })
    const text = await res.text()
    await Promise.all(tasks)
    return { status: res.status, text, conversationId: res.headers.get(copilot.CONVERSATION_HEADER) }
  }

  const history = async (conversationId: string) => conversations.loadMessages(conversationId)
  const toolParts = (m: Message) => m.parts.filter((p) => p.type.startsWith("tool-")) as unknown as { type: string; state: string; toolCallId: string; output?: unknown; errorText?: string; approval?: { id: string; approved?: boolean; reason?: string; requestReason?: string } }[]

  it("answers about the page's fiche through its tools, pays for each step and keeps the conversation", async () => {
    script = [{ tools: [{ name: "get_lead", input: { leadId } }] }, { text: "**Plomberie Dupont**, à Lyon : nouvelle fiche, jamais contactée. Appelez Jean Dupont, le gérant." }]
    const r = await turn(u.sdr, { message: question("q1", "Résume cette fiche"), page: `/app/leads/${leadId}` })
    expect(r.status).toBe(200)
    expect(r.conversationId).toBeTruthy()

    const c = await prisma.aiConversation.findUniqueOrThrow({ where: { id: r.conversationId! } })
    expect(c).toMatchObject({ userId: u.sdr.id, title: "Résume cette fiche", messageCount: 2, turnStartedAt: null })
    expect(c.leadIds).toEqual([leadId])
    expect(c.costMicros).toBeGreaterThan(0)
    expect(c.context).toEqual({ path: `/app/leads/${leadId}`, label: "Fiche Plomberie Dupont" })

    const [q, a] = await history(c.id)
    expect(q.metadata?.context).toMatchObject({ label: "Fiche Plomberie Dupont", leadId })
    expect(a.role).toBe("assistant")
    expect(toolParts(a)).toMatchObject([{ type: "tool-get_lead", state: "output-available" }])
    expect(a.parts.some((p) => p.type === "text" && p.text.includes("Plomberie Dupont"))).toBe(true)
    expect(a.metadata).toMatchObject({ costMicros: c.costMicros, model: "anthropic/claude-sonnet-5.5" })
    // The contact's email and phone stay on the fiche: neither the model nor the conversation sees them.
    expect(JSON.stringify(a)).not.toContain("jean@plomberie.test")
    expect(JSON.stringify(a)).not.toContain("0611223344")
    expect(JSON.stringify(calls)).not.toContain("jean@plomberie.test")

    // The model reads the date and the page before the question; it reasons little and answers briefly.
    expect(JSON.stringify(calls[0].prompt)).toContain("Nous sommes le")
    expect(JSON.stringify(calls[0].prompt)).toContain(`la fiche « Plomberie Dupont » (Lyon), leadId ${leadId}`)
    expect(JSON.stringify(calls[0].prompt)).toContain("Comment tu travailles ici")
    expect(calls.every((x) => x.maxOutputTokens! <= 3_000 && x.reasoning === "low")).toBe(true)

    // One run of the copilot, ended, its hold released, two model steps and one tool call.
    const run = await prisma.agentRun.findFirstOrThrow({ where: { agentId: "copilot" }, include: { steps: { orderBy: { index: "asc" } } } })
    expect(run).toMatchObject({ status: "SUCCEEDED", requestedById: u.sdr.id, reservedMicros: 0, costMicros: c.costMicros, leadId: null })
    expect(run.input).toEqual({ conversationId: c.id })
    expect(run.steps.map((s) => `${s.type}:${s.name}`)).toEqual(["TOOL:get_lead", "MODEL:copilote-etape-1", "MODEL:copilote-etape-2"])
    expect((await prisma.aiUsage.aggregate({ where: { agentId: "copilot", userKey: u.sdr.id }, _sum: { costMicros: true } }))._sum.costMicros).toBe(c.costMicros)

    // The next question continues the same conversation; asked from another fiche, the conversation follows it too.
    const company = await prisma.company.create({ data: { workspaceId: ws, name: "Chauffage Durand", city: "Lyon" } })
    const other = await prisma.lead.create({ data: { workspaceId: ws, companyId: company.id, ownerId: u.sdr.id, source: "MANUAL" } })
    script = [{ text: "Oui : rappelez-le jeudi." }]
    const next = await turn(u.sdr, { conversationId: c.id, message: question("q2", "Et celle-ci, faut-il la rappeler ?"), page: `/app/leads/${other.id}` })
    expect(next.conversationId).toBe(c.id)
    expect((await history(c.id)).map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"])
    expect((await prisma.aiConversation.findUniqueOrThrow({ where: { id: c.id } })).leadIds.sort()).toEqual([leadId, other.id].sort())
  })

  it("sees only what the person sees", async () => {
    // The closer holds no fiche: the page names nothing, and the fiche cannot be read through a tool either.
    script = [{ tools: [{ name: "get_lead", input: { leadId } }, { name: "search_leads", input: { query: "Dupont" } }] }, { text: "Je ne trouve pas cette fiche." }]
    const r = await turn(u.closer, { message: question("q1", "Résume cette fiche"), page: `/app/leads/${leadId}` })
    const [q, a] = await history(r.conversationId!)
    expect(q.metadata?.context).toMatchObject({ label: "Prospects" })
    expect(q.metadata?.context?.leadId).toBeUndefined()
    expect(JSON.stringify(calls[0].prompt)).not.toContain(leadId)
    const [read, search] = toolParts(a)
    expect(read).toMatchObject({ state: "output-error" })
    expect(read.errorText).toMatch(/introuvable/i)
    expect(search).toMatchObject({ state: "output-available", output: { total: 0, leads: [] } })
    expect((await prisma.aiConversation.findUniqueOrThrow({ where: { id: r.conversationId! } })).leadIds).toEqual([])
    // Nobody without the right to use AI talks to it.
    await expect(copilot.copilotTurn(u.viewer, { message: question("q", "Bonjour") }, undefined, { languageModel: () => model, prices: PRICES })).rejects.toMatchObject({ code: "forbidden" })
  })

  it("proposes an action, runs it once approved, and refuses a forged approval", async () => {
    // E28: a change other than a note waits for a click; the action is found on demand first.
    script = [{ tools: [{ name: "find_actions", input: { query: "changer le statut" } }] }, { tools: [{ name: "set_lead_status", input: { leadIds: [leadId], status: "QUALIFIED" } }] }]
    const r = await turn(u.sdr, { message: question("q1", "Passe-la en qualifié"), page: `/app/leads/${leadId}` })
    const id = r.conversationId!
    let [, a] = await history(id)
    const proposed = toolParts(a).find((p) => p.type === "tool-set_lead_status")!
    expect(proposed).toMatchObject({ state: "approval-requested" })
    expect(proposed.approval!.requestReason).toBe("Passer en « Qualifié » 1 fiche (Plomberie Dupont).")
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe("NEW")

    // An approval the server never asked for changes nothing.
    const answer = (approvalId: string) => ({ ...a, parts: a.parts.map((p) => (p.type === "tool-set_lead_status" ? { ...p, state: "approval-responded", approval: { id: approvalId, approved: true } } : p)) })
    await expect(turn(u.sdr, { conversationId: id, message: answer("fausse") })).rejects.toMatchObject({ code: "conflict" })
    // Nor does someone else's answer.
    const approved = answer(proposed.approval!.id)
    await expect(turn(u.owner, { conversationId: id, message: approved })).rejects.toMatchObject({ code: "not_found" })
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe("NEW")

    script = [{ text: "C'est fait : la fiche est qualifiée." }]
    const done = await turn(u.sdr, { conversationId: id, message: approved })
    expect(done.status).toBe(200)
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe("QUALIFIED")
    ;[, a] = await history(id)
    expect(toolParts(a).find((p) => p.type === "tool-set_lead_status")).toMatchObject({ state: "output-available", output: { done: true, updated: 1 } })
    expect(a.parts.at(-1)).toMatchObject({ type: "text", text: "C'est fait : la fiche est qualifiée." })
    expect(a.metadata?.runIds).toHaveLength(2)
    expect(await prisma.auditLog.count({ where: { action: "ai.copilot_action" } })).toBe(1)

    // Answering again changes nothing: the call ran once.
    await expect(turn(u.sdr, { conversationId: id, message: approved })).rejects.toMatchObject({ code: "conflict" })
    expect(await prisma.activity.count({ where: { leadId, kind: "STATUS_CHANGE" } })).toBe(1)
  })

  it("creates a task without a click (D28)", async () => {
    script = [{ tools: [{ name: "find_actions", input: { query: "créer une tâche" } }] }, { tools: [{ name: "create_task", input: { leadId, title: "Rappeler Jean", dueDay: "2026-11-10" } }] }, { text: "C'est noté pour mardi." }]
    const r = await turn(u.sdr, { message: question("q1", "Programme un rappel mardi prochain"), page: `/app/leads/${leadId}` })
    const task = await prisma.task.findFirstOrThrow()
    expect(task).toMatchObject({ title: "Rappeler Jean", leadId, assigneeId: u.sdr.id })
    const [, a] = await history(r.conversationId!)
    expect(toolParts(a).find((p) => p.type === "tool-create_task")).toMatchObject({ state: "output-available", output: { done: true, taskId: task.id } })
  })

  it("refuses for free, and refuses what waits when the person moves on", async () => {
    const propose = { tools: [{ name: "create_campaign", input: { name: "Plombiers Lyon", sector: "Plombier" } }] }
    script = [{ tools: [{ name: "find_actions", input: { query: "créer une campagne" } }] }, propose]
    const r = await turn(u.sdr, { message: question("q1", "Crée une campagne pour les plombiers de Lyon") })
    const id = r.conversationId!
    let [, a] = await history(id)
    const proposed = toolParts(a).find((p) => p.type === "tool-create_campaign")!
    expect(proposed.approval!.requestReason).toBe("Créer la campagne « Plombiers Lyon » (Plombier), en brouillon.")
    const runs = await prisma.agentRun.count()
    const before = calls.length
    const refused = { ...a, parts: a.parts.map((p) => (p.type === "tool-create_campaign" ? { ...p, state: "approval-responded", approval: { id: proposed.approval!.id, approved: false } } : p)) }
    await turn(u.sdr, { conversationId: id, message: refused })
    ;[, a] = await history(id)
    expect(toolParts(a).find((p) => p.type === "tool-create_campaign")).toMatchObject({ state: "output-denied", approval: { approved: false } })
    expect(calls.length).toBe(before)
    expect(await prisma.agentRun.count()).toBe(runs)
    expect(await prisma.campaign.count()).toBe(0)

    // Proposed again (the action the last answer used is loaded at once), then left without an answer: the next
    // question refuses it, and the model reads that it was not done.
    script = [propose, { text: "Bien, je ne la crée pas." }]
    await turn(u.sdr, { conversationId: id, message: question("q2", "Crée-la quand même") })
    await turn(u.sdr, { conversationId: id, message: question("q3", "Laisse tomber, parlons d'autre chose") })
    const messages = await history(id)
    expect(toolParts(messages[3]).find((p) => p.type === "tool-create_campaign")).toMatchObject({ state: "output-denied", approval: { approved: false, reason: "Non validée : la conversation a continué sans réponse." } })
    expect(JSON.stringify(calls.at(-1)!.prompt)).toContain("Non validée : la conversation a continué sans réponse.")
    expect(JSON.stringify(calls.at(-1)!.prompt)).toContain("Refusée par la personne")
    expect(await prisma.campaign.count()).toBe(0)
  })

  it("hands long work to a specialist, which waits in the worker's queue", async () => {
    await prisma.prospectAudit.create({
      data: { workspaceId: ws, leadId, domain: "plomberie.test", url: "https://plomberie.test/", status: "COMPLETE", scores: {}, score: 40, summary: ["Site illisible sur téléphone"], report: {}, validUntil: new Date(Date.now() + 30 * 86_400_000) },
    })
    // A fresh audit is read, never redone without being asked: the call is refused before anyone is asked.
    script = [{ tools: [{ name: "find_actions", input: { query: "auditer le site" } }] }, { tools: [{ name: "start_audit", input: { leadId } }] }, { text: "Un audit récent existe déjà." }]
    const r = await turn(u.sdr, { message: question("q1", "Audite cette fiche"), page: `/app/leads/${leadId}` })
    let [, a] = await history(r.conversationId!)
    const audit = toolParts(a).find((p) => p.type === "tool-start_audit")!
    expect(audit).toMatchObject({ state: "output-denied", approval: { approved: false } })
    expect(audit.approval!.reason).toMatch(/couvre déjà cette fiche/)

    script = [{ tools: [{ name: "find_actions", input: { query: "écrire un premier email" } }] }, { tools: [{ name: "draft_email", input: { leadId } }] }]
    await turn(u.sdr, { conversationId: r.conversationId, message: question("q2", "Écris-lui un premier email") })
    ;[, , , a] = await history(r.conversationId!)
    const proposed = toolParts(a).find((p) => p.type === "tool-draft_email")!
    expect(proposed.approval!.requestReason!.replace(/\s/g, " ")).toBe("Demander au Rédacteur un premier email pour Plomberie Dupont, à relire avant tout envoi (0,05 € au plus).")
    script = [{ text: "Le Rédacteur s'en occupe ; le brouillon s'ouvrira dans la fenêtre d'email." }]
    await turn(u.sdr, { conversationId: r.conversationId, message: { ...a, parts: a.parts.map((p) => (p.type === "tool-draft_email" ? { ...p, state: "approval-responded", approval: { id: proposed.approval!.id, approved: true } } : p)) } })
    const writer = await prisma.agentRun.findFirstOrThrow({ where: { agentId: "writer" } })
    expect(writer).toMatchObject({ status: "QUEUED", leadId, requestedById: u.sdr.id })
    ;[, , , a] = await history(r.conversationId!)
    expect(toolParts(a).find((p) => p.type === "tool-draft_email")).toMatchObject({ state: "output-available", output: { started: true, agentId: "writer", runId: writer.id, open: `/app/leads/${leadId}?brouillon=${writer.id}` } })
  })

  it("answers one turn at a time, and the budget stops a turn before anything is written", async () => {
    script = [{ text: "Bonjour." }]
    const r = await turn(u.sdr, { message: question("q1", "Bonjour") })
    expect(await conversations.takeTurn(r.conversationId!)).toBe(true)
    await expect(turn(u.sdr, { conversationId: r.conversationId, message: question("q2", "Encore") })).rejects.toMatchObject({ code: "conflict" })
    const busy = await prisma.agentRun.findFirstOrThrow({ where: { agentId: "copilot", status: "CANCELLED" } })
    expect(busy.reservedMicros).toBe(0)
    await conversations.releaseTurn(r.conversationId!)

    // The day's quota cannot hold a turn's cap: refused before any message is written or any model called.
    await prisma.aiSetting.update({ where: { workspaceId: ws }, data: { userDailyCapMicros: 50_000 } })
    const before = calls.length
    await expect(turn(u.sdr, { message: question("q3", "Une autre question") })).rejects.toMatchObject({ code: "budget_exceeded" })
    expect(calls.length).toBe(before)
    expect(await prisma.aiConversation.count()).toBe(1)
  })

  it("keeps what was written when a turn runs out of time", async () => {
    script = [{ text: "Voici une très longue réponse qui prend bien trop de temps à écrire pour tenir dans un tour.", delay: 25 }]
    const r = await turn(u.sdr, { message: question("q1", "Raconte-moi tout") }, { deadlineMs: 120 })
    const [, a] = await history(r.conversationId!)
    expect(a.metadata?.stopped).toBe("time")
    const text = a.parts.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join("")
    expect(text.length).toBeGreaterThan(0)
    expect(text.length).toBeLessThan(90)
    const run = await prisma.agentRun.findFirstOrThrow({ where: { agentId: "copilot" } })
    expect(run).toMatchObject({ status: "SUCCEEDED", reservedMicros: 0 })
    expect((await prisma.aiConversation.findUniqueOrThrow({ where: { id: r.conversationId! } })).turnStartedAt).toBeNull()
  })

  it("keeps conversations private, erased with a fiche they read and after 90 days", async () => {
    script = [{ tools: [{ name: "get_lead", input: { leadId } }] }, { text: "Fiche lue." }]
    const mine = await turn(u.sdr, { message: question("q1", "Lis la fiche Dupont") })
    script = [{ text: "Bonjour." }]
    const other = await turn(u.owner, { message: question("q1", "Bonjour") })

    expect((await conversations.listConversations(u.sdr)).map((c) => c.id)).toEqual([mine.conversationId])
    await expect(conversations.getConversation(u.owner, mine.conversationId!)).rejects.toMatchObject({ code: "not_found" })
    await expect(conversations.deleteConversation(u.owner, mine.conversationId!)).rejects.toMatchObject({ code: "not_found" })
    expect((await conversations.getConversation(u.sdr, mine.conversationId!)).history).toHaveLength(2)

    // The fiche is erased: the conversation that read it goes with it, the other stays.
    await leads.deleteLead(u.owner, leadId)
    expect(await prisma.aiConversation.findUnique({ where: { id: mine.conversationId! } })).toBeNull()
    expect(await prisma.aiConversation.count()).toBe(1)

    // Ninety days without a message.
    expect(await forget.purgeConversations(new Date(Date.now() + 89 * 86_400_000))).toBe(0)
    expect(await forget.purgeConversations(new Date(Date.now() + 91 * 86_400_000))).toBe(1)
    expect(await prisma.aiMessage.count()).toBe(0)
    void other
  })
})
