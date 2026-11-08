// E28 the copilot that acts (lot 1). Needs a disposable PostgreSQL with the migrations applied (never your development
// database):
//   TEST_DATABASE_URL=postgresql://… npx vitest run tests/copilot-actions.integration.test.ts
// The models are fakes that answer what each test scripts: nothing leaves the machine.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { MockLanguageModelV4 } from "ai/test"
import { simulateReadableStream, type TranscriptionModel } from "ai"
import { resetDatabase } from "./helpers/reset-db"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

const usage = (input: number, output: number) => ({ inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: output, text: output, reasoning: 0 } })

interface Step {
  text?: string
  tools?: { name: string; input: unknown }[]
}

suite("The copilot that acts (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let catalog: typeof import("@/features/ai/catalog")
  let copilot: typeof import("@/features/copilot/turn")
  let conversations: typeof import("@/features/copilot/conversations")
  let undo: typeof import("@/features/copilot/undo")
  let voice: typeof import("@/features/copilot/voice")
  let definitions: typeof import("@/features/ai/definitions")
  let runs: typeof import("@/features/ai/runs")
  let navigation: typeof import("@/features/ai/actions/navigation")
  let copilotTools: typeof import("@/features/copilot/tools")
  let PRICES: typeof import("@/lib/ai/pricing").DEFAULT_PRICES
  type U = import("@/lib/auth/guard").CurrentUser
  type Message = import("@/features/copilot/messages").CopilotMessage
  const u: Record<string, U> = {}
  const ws = "ws_default"
  let leadId = ""
  let otherLead = ""
  let script: Step[] = []
  let sentTools: string[][] = []
  let callId = 0

  const model = new MockLanguageModelV4({
    doStream: async (options) => {
      sentTools.push((options.tools ?? []).map((t) => t.name))
      const step = script.shift() ?? { text: "D'accord." }
      return {
        stream: simulateReadableStream({
          chunks: [
            ...(step.text ? [{ type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: step.text }, { type: "text-end", id: "t" }] : []),
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
    undo = await import("@/features/copilot/undo")
    voice = await import("@/features/copilot/voice")
    definitions = await import("@/features/ai/definitions")
    runs = await import("@/features/ai/runs")
    navigation = await import("@/features/ai/actions/navigation")
    copilotTools = await import("@/features/copilot/tools")
    PRICES = (await import("@/lib/ai/pricing")).DEFAULT_PRICES
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await resetDatabase(prisma)
    script = []
    sentTools = []
    for (const [key, role] of [["owner", "OWNER"], ["manager", "MANAGER"], ["sdr", "SDR"], ["closer", "CLOSER"], ["viewer", "VIEWER"]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@team.test`, name: `${key} Test`, role, workspaceId: ws } })
      u[key] = { id: x.id, workspaceId: ws, name: `${key} Test`, email: x.email!, image: null, role }
    }
    const company = await prisma.company.create({ data: { workspaceId: ws, name: "Plomberie Dupont", city: "Nantes", sector: "Plombier", website: "https://plomberie.test", domain: "plomberie.test" } })
    leadId = (await prisma.lead.create({ data: { workspaceId: ws, companyId: company.id, ownerId: u.sdr.id, source: "EXTRACTOR" } })).id
    const other = await prisma.company.create({ data: { workspaceId: ws, name: "Toiture Martin", city: "Nantes" } })
    otherLead = (await prisma.lead.create({ data: { workspaceId: ws, companyId: other.id, ownerId: u.owner.id, source: "EXTRACTOR" } })).id
    await catalog.ensureAgentCatalog(ws)
  })

  const question = (id: string, text: string) => ({ id, role: "user", parts: [{ type: "text", text }] })

  async function turn(user: U, body: Record<string, unknown>) {
    const tasks: Promise<unknown>[] = []
    const res = await copilot.copilotTurn(user, body, undefined, { languageModel: () => model, prices: PRICES, keepAlive: (t) => tasks.push(t) })
    await res.text()
    await Promise.all(tasks)
    return { conversationId: res.headers.get(copilot.CONVERSATION_HEADER)! }
  }
  const lastAnswer = async (conversationId: string) => (await conversations.loadMessages(conversationId)).at(-1)! as Message
  const toolParts = (m: Message) => m.parts.filter((p) => p.type.startsWith("tool-")) as unknown as { type: string; state: string; toolCallId: string; output?: Record<string, unknown>; approval?: { id: string } }[]

  it("finds an action on demand, runs a small note without a click, and puts it back from its card", async () => {
    script = [{ tools: [{ name: "find_actions", input: { query: "étiqueter des fiches" } }] }, { tools: [{ name: "tag_leads", input: { leadIds: [leadId, otherLead], tag: "A-appeler" } }] }, { text: "C'est étiqueté." }]
    const { conversationId } = await turn(u.sdr, { message: question("q1", "Étiquette Plomberie Dupont à appeler") })
    // The first request carries the core and the search only; the found action joins at the next step.
    expect(sentTools[0]).toContain("find_actions")
    expect(sentTools[0]).not.toContain("tag_leads")
    expect(sentTools[1]).toContain("tag_leads")
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).tags).toEqual(["a-appeler"])
    // The owner's fiche is not the SDR's to change: left out, and said so.
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: otherLead } })).tags).toEqual([])
    const tagged = toolParts(await lastAnswer(conversationId)).find((p) => p.type === "tool-tag_leads")!
    expect(tagged).toMatchObject({ state: "output-available", output: { done: true, updated: 1, notAllowed: 1, changedIds: [leadId] } })
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "lead.bulk_update" } })
    expect(log).toMatchObject({ actorId: u.sdr.id, metadata: { via: { agentId: "copilot" } } })

    await undo.undoAction(u.sdr, { conversationId, toolCallId: tagged.toolCallId })
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).tags).toEqual([])
    expect(toolParts(await lastAnswer(conversationId)).find((p) => p.type === "tool-tag_leads")!.output).toMatchObject({ undone: true })
    await expect(undo.undoAction(u.sdr, { conversationId, toolCallId: tagged.toolCallId })).rejects.toMatchObject({ code: "conflict" })
    // Someone else's conversation stays out of reach.
    await expect(undo.undoAction(u.owner, { conversationId, toolCallId: tagged.toolCallId })).rejects.toMatchObject({ status: 404 })
  })

  it("asks before a change, runs it once approved with the person as author, via the copilot", async () => {
    script = [{ tools: [{ name: "find_actions", input: { query: "changer le statut des fiches" } }] }, { tools: [{ name: "set_lead_status", input: { leadIds: [leadId], status: "QUALIFIED" } }] }]
    const { conversationId } = await turn(u.sdr, { message: question("q1", "Passe Plomberie Dupont en qualifié") })
    const a = await lastAnswer(conversationId)
    const proposed = toolParts(a).find((p) => p.type === "tool-set_lead_status")!
    expect(proposed.state).toBe("approval-requested")
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe("NEW")

    script = [{ text: "Fait." }]
    await turn(u.sdr, { conversationId, message: { ...a, parts: a.parts.map((p) => (p.type === "tool-set_lead_status" ? { ...p, state: "approval-responded", approval: { id: proposed.approval!.id, approved: true } } : p)) } })
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe("QUALIFIED")
    // The action found in the last answer is loaded again at once, so the model can carry on with it.
    expect(sentTools.at(-1)).toContain("set_lead_status")
    const change = await prisma.activity.findFirstOrThrow({ where: { leadId, kind: "STATUS_CHANGE" } })
    expect(change).toMatchObject({ actorId: u.sdr.id, actorKind: "USER", data: { to: "QUALIFIED", via: { agentId: "copilot" } } })
  })

  it("follows the owner's rights matrix, and only the owner changes it", async () => {
    await expect(definitions.updateAgentDefinition(u.manager, "copilot", { actionPolicy: { notes: "confirm" } })).rejects.toMatchObject({ code: "forbidden" })
    await expect(definitions.updateAgentDefinition(u.owner, "copilot", { actionPolicy: { records: "auto" } })).rejects.toMatchObject({ code: "invalid" })
    await expect(definitions.updateAgentDefinition(u.owner, "auditor", { actionPolicy: { outreach: "off" } })).rejects.toMatchObject({ code: "invalid" })
    const view = await definitions.updateAgentDefinition(u.owner, "copilot", { actionPolicy: { notes: "confirm", prospecting: "off" } })
    expect(view.families.find((f) => f.id === "notes")).toMatchObject({ mode: "confirm", codeMode: "auto" })
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "ai.agent_updated" } })
    expect(log.metadata).toMatchObject({ changes: ["rights"], rights: { before: null, after: { notes: "confirm", prospecting: "off" } } })

    const policy = (await definitions.effectiveAgent(ws, "copilot")).policy
    expect(copilotTools.toolsFor(u.sdr, { skills: true, policy }).map((t) => t.name)).not.toContain("start_search")
    // A note now waits for a click.
    script = [{ tools: [{ name: "find_actions", input: { query: "ajouter une note" } }] }, { tools: [{ name: "add_note", input: { leadId, text: "Rappeler jeudi" } }] }]
    const { conversationId } = await turn(u.sdr, { message: question("q1", "Note : rappeler jeudi") })
    expect(toolParts(await lastAnswer(conversationId)).find((p) => p.type === "tool-add_note")!.state).toBe("approval-requested")
    expect(await prisma.activity.count({ where: { leadId, kind: "NOTE" } })).toBe(0)
  })

  it("stops a specialist whose family the owner cut, but not a test of it", async () => {
    await definitions.updateAgentDefinition(u.owner, "auditor", { actionPolicy: { read_web: "off" } })
    await expect(runs.startRun(u.owner, { agentId: "auditor", leadId: otherLead })).rejects.toMatchObject({ code: "conflict", message: expect.stringContaining("Lire le web") })
    await expect(runs.startRun(u.owner, { agentId: "auditor", input: { kind: "skill_test" } })).resolves.toMatchObject({ agentId: "auditor" })
  })

  it("opens only the pages the person may see", async () => {
    const run = (user: U) => ({ run: { id: "r", workspaceId: ws, agentId: "copilot" as const, requester: user, userKey: user.id, leadId: null } })
    const open = (user: U, input: Record<string, unknown>) => navigation.openPageTool.execute(run(user), navigation.openPageTool.input.parse(input))
    await expect(open(u.sdr, { page: "lead", id: leadId })).resolves.toEqual({ open: `/app/leads/${leadId}`, label: "Plomberie Dupont" })
    await expect(open(u.closer, { page: "lead", id: leadId })).rejects.toMatchObject({ status: 404 })
    await expect(open(u.sdr, { page: "leads", filters: { query: "plomb", status: ["NEW", "CONTACTED"], tag: "A-appeler", mine: true } })).resolves.toMatchObject({ open: "/app/leads?q=plomb&status=NEW%2CCONTACTED&tag=a-appeler&owner=me" })
    await expect(open(u.manager, { page: "hq", zone: "agents" })).resolves.toMatchObject({ open: "/app/3d?zone=agents" })
    await expect(open(u.sdr, { page: "hq", zone: "agents" })).rejects.toMatchObject({ code: "forbidden" })
    await expect(open(u.closer, { page: "hq" })).rejects.toMatchObject({ code: "forbidden" })
    await expect(open(u.viewer, { page: "agents" })).rejects.toMatchObject({ code: "forbidden" })
    await expect(open(u.closer, { page: "searches" })).rejects.toMatchObject({ code: "forbidden" })
  })

  it("turns a dictated question into text, billed to the copilot by the minute", async () => {
    const heard: TranscriptionModel = {
      specificationVersion: "v4",
      provider: "test",
      modelId: "test",
      doGenerate: async () => ({ text: " Recherche 1000 architectes à Nantes ", segments: [], language: "fr", durationInSeconds: 6, warnings: [], response: { timestamp: new Date(), modelId: "test" } }),
    } as never
    const bytes = new Uint8Array([1, 2, 3, 4])
    await expect(voice.transcribeFor(u.sdr, { bytes, type: "audio/webm;codecs=opus" }, { transcriptionModel: heard })).resolves.toEqual({ text: "Recherche 1000 architectes à Nantes" })
    const run = await prisma.agentRun.findFirstOrThrow({ where: { agentId: "copilot" }, include: { steps: true } })
    expect(run).toMatchObject({ status: "SUCCEEDED", input: { kind: "transcription" }, reservedMicros: 0 })
    expect(run.costMicros).toBeGreaterThan(0)
    expect(run.steps[0]).toMatchObject({ name: "dictee", model: voice.TRANSCRIBE_MODEL })
    await expect(voice.transcribeFor(u.sdr, { bytes, type: "video/mp4" }, { transcriptionModel: heard })).rejects.toMatchObject({ code: "invalid" })
    await expect(voice.transcribeFor(u.viewer, { bytes, type: "audio/webm" }, { transcriptionModel: heard })).rejects.toMatchObject({ code: "forbidden" })
  })
})
