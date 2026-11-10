// The AI caller (E33): a wave, its calls handed to ElevenLabs, the agent's tools during a call, and the signed post-call
// webhook filing the result on the fiche.
// Needs a disposable PostgreSQL with the migrations applied (never your development database):
//   TEST_DATABASE_URL=postgresql://… npx vitest run tests/ai-caller.integration.test.ts
// ElevenLabs is never called: fetch is replaced and every request it would receive is checked.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { resetDatabase } from "./helpers/reset-db"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip
// Tuesday 17 November 2026, 10:30 in Paris: inside the calling hours.
const IN_HOURS = new Date("2026-11-17T09:30:00Z")
const SECRET = "whsec_test_only"

suite("AI caller (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let svc: typeof import("@/features/ai-caller/service")
  let signPayload: typeof import("@/lib/telephony/elevenlabs").signPayload
  let webhook: typeof import("@/app/api/webhooks/elevenlabs/route")
  let tools: typeof import("@/app/api/ai-caller/tools/[tool]/route")
  type U = import("@/lib/auth/guard").CurrentUser
  const u: Record<string, U> = {}
  const ws = "ws_default"
  const lead: Record<string, string> = {}
  const saved = { ...process.env }
  let placed: { url: string; body: Record<string, unknown> }[] = []

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    prisma = (await import("@/lib/prisma")).prisma
    svc = await import("@/features/ai-caller/service")
    signPayload = (await import("@/lib/telephony/elevenlabs")).signPayload
    webhook = await import("@/app/api/webhooks/elevenlabs/route")
    tools = await import("@/app/api/ai-caller/tools/[tool]/route")
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    process.env = { ...saved, DATABASE_URL: url }
  })

  /** ElevenLabs as a stub: each outbound call gets a conversation id, tools and agent get ids. */
  function stubElevenLabs() {
    placed = []
    let n = 0
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      placed.push({ url: input, body })
      if (input.endsWith("/v1/convai/sip-trunk/outbound-call")) return Response.json({ success: true, message: "ok", conversation_id: `conv_${++n}`, sip_call_id: `sip_${n}` })
      if (input.endsWith("/v1/convai/tools")) return Response.json({ id: `tool_${++n}` })
      if (input.endsWith("/v1/convai/agents/create")) return Response.json({ agent_id: "agent_test" })
      return new Response("not found", { status: 404 })
    })
  }

  beforeEach(async () => {
    await resetDatabase(prisma)
    process.env.ELEVENLABS_API_KEY = "test-key"
    process.env.ELEVENLABS_WEBHOOK_SECRET = SECRET
    process.env.NEXTAUTH_URL = "https://cleads.test"
    for (const [key, role] of [["owner", "OWNER"], ["host", "CLOSER"]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@ai-caller.test`, name: `${key} Test`, role, workspaceId: ws } })
      u[key] = { id: x.id, workspaceId: ws, name: `${key} Test`, email: x.email!, image: null, role }
    }
    // The host is open every day, 8:00–20:00, so the slots tool always has something to offer.
    for (let weekday = 0; weekday < 7; weekday++) await prisma.availabilityRule.create({ data: { workspaceId: ws, hostId: u.host.id, weekday, startMinute: 8 * 60, endMinute: 20 * 60 } })
    await prisma.aiCallSetting.create({ data: { workspaceId: ws, agentId: "agent_test", phoneNumberId: "phnum_test", hostId: u.host.id, paused: true } })

    const fiches: [string, { phone: string | null; website: string | null; status?: "DO_NOT_CONTACT"; audit?: boolean }][] = [
      ["weak", { phone: "+33240000001", website: "https://plomberie-test.example", audit: true }],
      ["nosite", { phone: "06 12 34 56 78", website: null }],
      ["nophone", { phone: null, website: null }],
      ["belgian", { phone: "+32470123456", website: null }],
      ["blocked", { phone: "+33240000005", website: null, status: "DO_NOT_CONTACT" }],
      ["okSite", { phone: "+33240000006", website: "https://bon-site.example" }],
    ]
    for (const [key, f] of fiches) {
      const company = await prisma.company.create({ data: { workspaceId: ws, name: `Fiche ${key}`, sector: "Plombier", city: "Nantes", phone: f.phone, website: f.website, domain: f.website ? new URL(f.website).hostname : null } })
      lead[key] = (await prisma.lead.create({ data: { workspaceId: ws, companyId: company.id, status: f.status ?? "NEW" } })).id
      if (f.audit) {
        await prisma.prospectAudit.create({
          data: {
            workspaceId: ws,
            leadId: lead[key],
            domain: "plomberie-test.example",
            status: "COMPLETE",
            score: 41,
            scores: {},
            summary: ["Site lent sur téléphone"],
            report: { findings: [{ area: "mobile", severity: "high", title: "Le site met 9 s à s’afficher sur téléphone.", detail: "", evidence: [], origin: "measure" }] },
            validUntil: new Date(Date.now() + 30 * 86_400_000),
          },
        })
      }
    }
  })

  const unpause = () => prisma.aiCallSetting.update({ where: { workspaceId: ws }, data: { paused: false } })

  async function launch(size = 20) {
    stubElevenLabs()
    const r = await svc.launchWave(u.owner, { source: { kind: "pool" }, size, hookMode: "auto" })
    await unpause()
    return r
  }

  async function post(path: string, body: unknown) {
    return tools.POST(new Request(`https://cleads.test/api/ai-caller/tools/${path}`, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ tool: path }) })
  }

  async function finish(conversationId: string, data: Record<string, unknown>, type = "post_call_transcription") {
    const raw = JSON.stringify({ type, event_timestamp: 1, data: { conversation_id: conversationId, ...data } })
    return webhook.POST(new Request("https://cleads.test/api/webhooks/elevenlabs", { method: "POST", body: raw, headers: { "ElevenLabs-Signature": signPayload(raw, SECRET) } }))
  }

  it("previews and launches a wave of the fiches with something true to say", async () => {
    const preview = await svc.previewWave(u.owner, { kind: "pool" }, "auto")
    // weak (audit: phone problem) and nosite are callable; no phone, a Belgian number and a good site without audit are not.
    expect(preview).toMatchObject({ eligible: 2, noPhone: 2, noHook: 1, byHook: { mobile: 1, nosite: 1 } })
    const r = await launch()
    expect(r.calls).toBe(2)
    const calls = await prisma.aiCall.findMany({ orderBy: { createdAt: "asc" } })
    expect(calls.map((c) => [c.leadId, c.hook, c.number, c.status])).toEqual(
      expect.arrayContaining([
        [lead.weak, "mobile", "+33240000001", "QUEUED"],
        [lead.nosite, "nosite", "+33612345678", "QUEUED"],
      ])
    )
    // Paused while launching: nothing was dialled.
    expect(placed).toHaveLength(0)
  })

  it("dials within the hours, the free lines and the budget, telling the agent only the fiche's facts", async () => {
    await launch()
    expect(await svc.dispatchCalls(ws, new Date("2026-11-17T06:00:00Z"))).toEqual({ placed: 0, stopped: "hours" })
    expect(await svc.dispatchCalls(ws, IN_HOURS)).toEqual({ placed: 2 })
    const out = placed.filter((p) => p.url.endsWith("/outbound-call"))
    expect(out).toHaveLength(2)
    const weak = out.find((p) => p.body.to_number === "+33240000001")!
    expect(weak.body).toMatchObject({ agent_id: "agent_test", agent_phone_number_id: "phnum_test" })
    const init = weak.body.conversation_initiation_client_data as { dynamic_variables: Record<string, string>; conversation_config_override: { agent: { prompt: { prompt: string }; first_message: string; language: string } } }
    expect(init.dynamic_variables.call_token).toHaveLength(32)
    expect(init.conversation_config_override.agent.first_message).toBe("Bonjour, ici l’assistante IA de Cleads. Je suis bien chez Fiche weak ?")
    expect(init.conversation_config_override.agent.prompt.prompt).toContain("le site met 9 s à s’afficher sur téléphone")
    expect(init.conversation_config_override.agent.language).toBe("fr")
    expect(await prisma.aiCall.count({ where: { status: "DIALING", conversationId: { not: null } } })).toBe(2)
    // Both lines busy: the next run waits.
    expect((await svc.dispatchCalls(ws, IN_HOURS)).stopped).toBe("busy")
  })

  it("stops at the monthly cap", async () => {
    await launch()
    await prisma.aiCallSetting.update({ where: { workspaceId: ws }, data: { monthlyCapCents: 0 } })
    expect(await svc.dispatchCalls(ws, IN_HOURS)).toEqual({ placed: 0, stopped: "budget" })
  })

  it("books a meeting from the call, then files the transcript on the fiche once", async () => {
    await launch()
    await svc.dispatchCalls(ws, IN_HOURS)
    const call = await prisma.aiCall.findFirstOrThrow({ where: { leadId: lead.weak } })

    const slots = (await (await post("slots", { call_token: call.token })).json()) as { slots: { starts_at: string; label: string }[] }
    expect(slots.slots.length).toBeGreaterThanOrEqual(2)
    expect(new Set(slots.slots.map((s) => s.label)).size).toBe(slots.slots.length)

    const booked = await (await post("book", { call_token: call.token, starts_at: slots.slots[0].starts_at })).json()
    expect(booked).toMatchObject({ booked: true })
    const meeting = await prisma.meeting.findFirstOrThrow({ where: { leadId: lead.weak } })
    expect(meeting).toMatchObject({ hostId: u.host.id, source: "ai-caller", createdById: u.owner.id })
    expect(await prisma.deal.count({ where: { leadId: lead.weak, stage: "MEETING_SET" } })).toBe(1)

    const transcript = [
      { role: "agent", message: "Bonjour, ici l’assistante IA de Cleads.", time_in_call_secs: 0 },
      { role: "user", message: "Oui, c’est moi.", time_in_call_secs: 3 },
    ]
    const res = await finish(call.conversationId!, {
      transcript,
      metadata: { call_duration_secs: 108, start_time_unix_secs: Math.floor(IN_HOURS.getTime() / 1000) },
      analysis: { transcript_summary: "Le gérant accepte une visio jeudi.", data_collection_results: { decision_maker: { value: "Oui, le gérant" } } },
      conversation_initiation_client_data: { dynamic_variables: { call_token: call.token } },
    })
    expect(await res.json()).toMatchObject({ filed: true, outcome: "MEETING" })
    const done = await prisma.aiCall.findUniqueOrThrow({ where: { id: call.id } })
    expect(done).toMatchObject({ status: "DONE", outcome: "MEETING", durationSec: 108, meetingId: meeting.id, summary: "Le gérant accepte une visio jeudi.", facts: { decision_maker: "Oui, le gérant" } })
    expect(done.costMicros).toBeGreaterThan(200_000)
    const activity = await prisma.activity.findFirstOrThrow({ where: { leadId: lead.weak, kind: "CALL" } })
    expect(activity).toMatchObject({ actorKind: "AGENT", body: "Le gérant accepte une visio jeudi.", data: { aiCallId: call.id, aiOutcome: "MEETING", durationSec: 108 } })

    // A replay changes nothing; the tools stop working once the call is filed.
    expect(await (await finish(call.conversationId!, { transcript })).json()).toMatchObject({ filed: false, reason: "already_filed" })
    expect(await prisma.activity.count({ where: { leadId: lead.weak, kind: "CALL" } })).toBe(1)
    expect((await post("slots", { call_token: call.token })).status).toBe(404)
  })

  it("tries a second time the next day when nobody answered", async () => {
    await launch()
    await svc.dispatchCalls(ws, IN_HOURS)
    const call = await prisma.aiCall.findFirstOrThrow({ where: { leadId: lead.nosite } })
    await finish(call.conversationId!, { failure_reason: "no-answer", metadata: { type: "sip", body: {} } }, "call_initiation_failure")
    expect(await prisma.aiCall.findUniqueOrThrow({ where: { id: call.id } })).toMatchObject({ status: "DONE", outcome: "NO_ANSWER" })
    const retry = await prisma.aiCall.findFirstOrThrow({ where: { leadId: lead.nosite, attempt: 2 } })
    expect(retry.status).toBe("QUEUED")
    expect(retry.notBefore.getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000)
  })

  it("takes the number out for good when the prospect asks", async () => {
    await launch()
    await svc.dispatchCalls(ws, IN_HOURS)
    const call = await prisma.aiCall.findFirstOrThrow({ where: { leadId: lead.nosite } })
    await prisma.aiCall.create({ data: { workspaceId: ws, waveId: call.waveId, leadId: lead.nosite, number: call.number, hook: "nosite", attempt: 2, token: "queued-token-for-the-same-fiche" } })
    expect(await (await post("do-not-call", { call_token: call.token })).json()).toMatchObject({ saved: true })
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.nosite } })).status).toBe("DO_NOT_CONTACT")
    expect(await prisma.aiCall.count({ where: { leadId: lead.nosite, status: "QUEUED" } })).toBe(0)
    await finish(call.conversationId!, { transcript: [{ role: "user", message: "Ne m’appelez plus.", time_in_call_secs: 5 }], metadata: { call_duration_secs: 12 } })
    expect((await prisma.aiCall.findUniqueOrThrow({ where: { id: call.id } })).outcome).toBe("DO_NOT_CALL")
  })

  it("files a callback as a task, and refuses an unknown token or an unsigned webhook", async () => {
    await launch()
    await svc.dispatchCalls(ws, IN_HOURS)
    const call = await prisma.aiCall.findFirstOrThrow({ where: { leadId: lead.weak } })
    expect(await (await post("callback", { call_token: call.token, when: "demain vers 14 h", day: "2026-11-18", who: "le gérant" })).json()).toMatchObject({ saved: true })
    const task = await prisma.task.findFirstOrThrow({ where: { leadId: lead.weak } })
    expect(task.title).toBe("Rappeler : demain vers 14 h (demander le gérant) · demandé à l’agent IA")
    expect((await prisma.aiCall.findUniqueOrThrow({ where: { id: call.id } })).outcome).toBe("CALLBACK")

    expect((await post("slots", { call_token: "x".repeat(32) })).status).toBe(404)
    const raw = JSON.stringify({ type: "post_call_transcription", data: { conversation_id: call.conversationId } })
    expect((await webhook.POST(new Request("https://cleads.test/api/webhooks/elevenlabs", { method: "POST", body: raw, headers: { "ElevenLabs-Signature": signPayload(raw, "wrong") } }))).status).toBe(403)
  })

  it("creates the agent with its tools, data collection and per-call overrides", async () => {
    await prisma.aiCallSetting.update({ where: { workspaceId: ws }, data: { agentId: null } })
    stubElevenLabs()
    const s = await svc.setupAgent(u.owner)
    expect(s.agentId).toBe("agent_test")
    const madeTools = placed.filter((p) => p.url.endsWith("/v1/convai/tools")).map((p) => p.body.tool_config as { name: string; api_schema: { url: string; request_body_schema: { properties: Record<string, { dynamic_variable?: string }> } } })
    expect(madeTools.map((t) => t.name)).toEqual(["get_slots", "book_meeting", "callback", "do_not_call"])
    expect(madeTools[1].api_schema.url).toBe("https://cleads.test/api/ai-caller/tools/book")
    expect(madeTools.every((t) => t.api_schema.request_body_schema.properties.call_token.dynamic_variable === "call_token")).toBe(true)
    const agent = placed.find((p) => p.url.endsWith("/v1/convai/agents/create"))!.body as { platform_settings: { overrides: unknown; data_collection: Record<string, unknown> }; conversation_config: { agent: { prompt: { tool_ids: string[] } } } }
    expect(agent.platform_settings.overrides).toEqual({ conversation_config_override: { agent: { first_message: true, language: true, prompt: { prompt: true } }, tts: { voice_id: true } } })
    expect(Object.keys(agent.platform_settings.data_collection)).toEqual(["decision_maker", "priority", "objection", "preference", "voicemail"])
    expect(agent.conversation_config.agent.prompt.tool_ids).toHaveLength(4)
  })
})
