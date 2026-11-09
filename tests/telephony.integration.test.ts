// Zadarma telephony (E32): calls reported by the PBX filed on the fiche and the member, once each, merged with the
// member's own log either way round; recordings, the nightly sync, the signed webhook, and members' extensions.
// Needs a disposable PostgreSQL with the migrations applied (never your development database):
//   TEST_DATABASE_URL=postgresql://… npx vitest run tests/telephony.integration.test.ts
// Zadarma's API is never called: fetch is replaced where a case needs an answer from it.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { resetDatabase } from "./helpers/reset-db"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

suite("Zadarma telephony (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let tel: typeof import("@/features/telephony/service")
  let leads: typeof import("@/features/leads/service")
  let desk: typeof import("@/features/leads/desk")
  let team: typeof import("@/features/team/service")
  let teamSchemas: typeof import("@/features/team/schemas")
  let zadarma: typeof import("@/lib/telephony/zadarma")
  let webhook: typeof import("@/app/api/webhooks/zadarma/route")
  let workspace: typeof import("@/lib/mail/workspace")
  type U = import("@/lib/auth/guard").CurrentUser
  type Call = import("@/features/telephony/rules").ReportedCall
  const u: Record<string, U> = {}
  const ws = "ws_default"
  const id: Record<string, string> = {}
  const saved = { ...process.env }

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    prisma = (await import("@/lib/prisma")).prisma
    tel = await import("@/features/telephony/service")
    leads = await import("@/features/leads/service")
    desk = await import("@/features/leads/desk")
    team = await import("@/features/team/service")
    teamSchemas = await import("@/features/team/schemas")
    zadarma = await import("@/lib/telephony/zadarma")
    webhook = await import("@/app/api/webhooks/zadarma/route")
    workspace = await import("@/lib/mail/workspace")
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    process.env = { ...saved, DATABASE_URL: url }
  })

  beforeEach(async () => {
    await resetDatabase(prisma)
    workspace.resetDefaultWorkspaceCache()
    for (const [key, role, ext] of [["owner", "OWNER", null], ["closer", "CLOSER", "100"], ["other", "CLOSER", "101"]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@tel.test`, name: `${key} Test`, role, workspaceId: ws, zadarmaExtension: ext } })
      u[key] = { id: x.id, workspaceId: ws, name: `${key} Test`, email: x.email!, image: null, role }
    }
    for (const [key, phone, owner] of [["Plomberie", "+33240000001", u.closer.id], ["Salon", "+33240000002", u.closer.id], ["Garage", "+33240000003", u.owner.id]] as const) {
      const company = await prisma.company.create({ data: { workspaceId: ws, name: key, phone } })
      id[key] = (await prisma.lead.create({ data: { workspaceId: ws, companyId: company.id, ownerId: owner, status: "NEW" } })).id
    }
  })

  const call = (o: Partial<Call> = {}): Call => ({
    externalId: "out_1",
    direction: "OUTBOUND",
    extension: "100",
    number: "33240000001",
    startedAt: new Date(Date.now() - 60_000),
    durationSec: 42,
    disposition: "answered",
    recordingId: null,
    ...o,
  })
  const calls = (leadId: string) => prisma.activity.findMany({ where: { leadId, kind: "CALL" }, orderBy: { createdAt: "asc" } })
  const lead = (key: string) => prisma.lead.findUniqueOrThrow({ where: { id: id[key] } })

  it("files an answered call on the fiche and the closer, waiting for his word, and counts it as a contact", async () => {
    const r = await tel.recordCall(ws, call())
    expect(r).toMatchObject({ created: true, leadId: id.Plomberie })
    const row = await prisma.phoneCall.findUniqueOrThrow({ where: { id: r.id } })
    expect(row).toMatchObject({ userId: u.closer.id, number: "+33240000001", durationSec: 42, direction: "OUTBOUND" })

    const [activity] = await calls(id.Plomberie)
    expect(activity).toMatchObject({ actorId: u.closer.id, actorKind: "USER", data: { phoneCallId: r.id, durationSec: 42, disposition: "answered", pending: true } })
    expect((activity.data as { outcome?: string }).outcome).toBeUndefined()
    expect(await lead("Plomberie")).toMatchObject({ status: "CONTACTED", lastContactedAt: expect.any(Date) })
    expect(await prisma.activity.count({ where: { leadId: id.Plomberie, kind: "STATUS_CHANGE" } })).toBe(1)
  })

  it("only refreshes the facts when the same call comes twice", async () => {
    await tel.recordCall(ws, call({ durationSec: 40 }))
    const again = await tel.recordCall(ws, call({ durationSec: 44, recordingId: "rec_1" }))
    expect(again.created).toBe(false)
    expect(await prisma.phoneCall.findMany()).toEqual([expect.objectContaining({ durationSec: 44, recordingId: "rec_1" })])
    expect(await calls(id.Plomberie)).toHaveLength(1)
  })

  it("keeps one activity when the closer logs the call the PBX reported: his word completes it", async () => {
    await tel.recordCall(ws, call())
    await leads.addActivity(u.closer, id.Plomberie, { kind: "CALL", outcome: "reached", body: "Intéressé, rappeler jeudi" })
    const [activity] = await calls(id.Plomberie)
    expect(await calls(id.Plomberie)).toHaveLength(1)
    expect(activity).toMatchObject({ body: "Intéressé, rappeler jeudi", data: { outcome: "reached", pending: false, durationSec: 42 } })
    expect((await lead("Plomberie")).status).toBe("REPLIED")
    expect(await desk.deskStats(u.closer)).toMatchObject({ calls: 1, reached: 1 })
  })

  it("adds the PBX's facts to a call the closer logged before it was reported", async () => {
    await leads.addActivity(u.closer, id.Plomberie, { kind: "CALL", outcome: "voicemail" })
    const r = await tel.recordCall(ws, call({ disposition: "answered", durationSec: 25 }))
    const all = await calls(id.Plomberie)
    expect(all).toHaveLength(1)
    expect(all[0].data).toMatchObject({ outcome: "voicemail", phoneCallId: r.id, durationSec: 25 })
    expect(await prisma.activity.count({ where: { leadId: id.Plomberie, kind: "STATUS_CHANGE" } })).toBe(1)
  })

  it("writes « Pas de réponse » itself, and a wrong number without a contact", async () => {
    await tel.recordCall(ws, call({ externalId: "out_2", number: "33240000002", disposition: "no answer", durationSec: 0 }))
    expect((await calls(id.Salon))[0].data).toMatchObject({ outcome: "no_answer" })
    expect((await lead("Salon")).status).toBe("CONTACTED")

    await tel.recordCall(ws, call({ externalId: "out_3", number: "0240000003", extension: "101", disposition: "unallocated number", durationSec: 0 }))
    expect((await calls(id.Garage))[0].data).toMatchObject({ outcome: "wrong_number" })
    expect(await lead("Garage")).toMatchObject({ status: "NEW", lastContactedAt: null })
  })

  it("keeps a call to an unknown number and a failure on our side, off every fiche", async () => {
    expect(await tel.recordCall(ws, call({ externalId: "out_4", number: "33699999999" }))).toMatchObject({ created: true, leadId: null })
    await tel.recordCall(ws, call({ externalId: "out_5", disposition: "no money", durationSec: 0 }))
    expect(await prisma.phoneCall.count()).toBe(2)
    expect(await prisma.activity.count({ where: { kind: "CALL" } })).toBe(0)
  })

  it("files a missed incoming call without changing the fiche, and an answered one as a reply", async () => {
    await tel.recordCall(ws, call({ externalId: "in_1", direction: "INBOUND", extension: null, number: "33240000002", disposition: "no answer", durationSec: 0 }))
    const [missed] = await calls(id.Salon)
    expect(missed).toMatchObject({ actorId: null, actorKind: "SYSTEM", body: "Appel entrant manqué" })
    expect((await lead("Salon")).status).toBe("NEW")

    await tel.recordCall(ws, call({ externalId: "in_2", direction: "INBOUND", extension: "100", number: "33240000002", disposition: "answered", durationSec: 90 }))
    expect((await lead("Salon")).status).toBe("REPLIED")
  })

  it("files a call on the caller's own fiche when two fiches share the number", async () => {
    const company = await prisma.company.create({ data: { workspaceId: ws, name: "Plomberie bis", phone: "+33240000001" } })
    const theirs = await prisma.lead.create({ data: { workspaceId: ws, companyId: company.id, ownerId: u.other.id } })
    expect((await tel.recordCall(ws, call({ externalId: "out_6", extension: "101" }))).leadId).toBe(theirs.id)
    expect((await tel.recordCall(ws, call({ externalId: "out_7", extension: "100" }))).leadId).toBe(id.Plomberie)
  })

  it("gives a recording's link to the caller and managers, not to another closer, and says when there is none", async () => {
    const r = await tel.recordCall(ws, call({ externalId: "out_8", number: "33240000003" }))
    await expect(tel.recordingLink(u.closer, r.id)).rejects.toMatchObject({ status: 404, message: "Cet appel n’a pas été enregistré." })
    expect(await tel.attachRecording("out_8", "1762693392.27")).toBe(true)

    process.env.ZADARMA_API_KEY = "key"
    process.env.ZADARMA_API_SECRET = "test-secret"
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ status: "success", link: "https://api.zadarma.com/v1/pbx/record/download/x.mp3" })))
    vi.stubGlobal("fetch", fetch)
    expect(await tel.recordingLink(u.closer, r.id)).toEqual({ url: "https://api.zadarma.com/v1/pbx/record/download/x.mp3" })
    expect(String(fetch.mock.calls[0][0])).toBe("https://api.zadarma.com/v1/pbx/record/request/?call_id=1762693392.27&lifetime=1800")
    expect((fetch.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toMatch(/^key:/)
    expect(await tel.recordingLink(u.owner, r.id)).toHaveProperty("url")
    // The garage belongs to the owner: the other closer neither made the call nor may read the fiche.
    await expect(tel.recordingLink(u.other, r.id)).rejects.toMatchObject({ status: 404, message: "Appel introuvable." })
  })

  it("files at night the calls no notification brought, and corrects the others", async () => {
    await tel.recordCall(ws, call({ externalId: "out_a", durationSec: 10 }))
    process.env.ZADARMA_API_KEY = "key"
    process.env.ZADARMA_API_SECRET = "test-secret"
    const stats = (type: string) =>
      type === "out"
        ? `{"status":"success","stats":[{"call_id":1.5,"sip":100,"callstart":"2026-11-09 14:03:12","destination":"33240000001","disposition":"answered","seconds":42,"is_recorded":true,"pbx_call_id":"out_a"},{"call_id":2.5,"sip":100,"callstart":"2026-11-09 14:10:00","destination":"33240000002","disposition":"busy","seconds":0,"is_recorded":false,"pbx_call_id":"out_b"}]}`
        : `{"status":"success","stats":[]}`
    const fetch = vi.fn(async (u: string) => new Response(stats(new URL(u).searchParams.get("call_type")!)))
    vi.stubGlobal("fetch", fetch)

    expect(await tel.syncCalls(ws)).toEqual({ seen: 2, filed: 1, truncated: false })
    expect(await prisma.phoneCall.findUniqueOrThrow({ where: { provider_externalId: { provider: "zadarma", externalId: "out_a" } } })).toMatchObject({ durationSec: 42, recordingId: "1.5" })
    expect((await calls(id.Salon))[0].data).toMatchObject({ outcome: "no_answer" })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("takes the signed notification of a call's end through the route", async () => {
    process.env.ZADARMA_API_SECRET = "test-secret"
    const fields = { event: "NOTIFY_OUT_END", call_start: "2026-11-09 14:03:12", pbx_call_id: "out_w", internal: "100", destination: "33240000001", duration: "37", disposition: "answered", status_code: "16", is_recorded: "1", call_id_with_rec: "1762693392.9" }
    const req = () =>
      new Request("https://cleads.fr/api/webhooks/zadarma", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Signature: zadarma.signWebhook(fields, "test-secret") }, body: new URLSearchParams(fields).toString() })
    const res = await webhook.POST(req())
    expect(await res.json()).toEqual({ filed: true, matched: true })
    expect(await prisma.phoneCall.findFirstOrThrow()).toMatchObject({ externalId: "out_w", userId: u.closer.id, leadId: id.Plomberie, durationSec: 37, recordingId: "1762693392.9", startedAt: new Date("2026-11-09T13:03:12Z") })
    expect(await (await webhook.POST(req())).json()).toEqual({ filed: false, matched: true })
  })

  describe("members' extensions", () => {
    const change = (body: unknown) => teamSchemas.memberChangeSchema.parse(body)

    it("lets the owner give an extension, his own included, once per workspace, and take it back", async () => {
      await expect(team.updateMember(u.owner, u.owner.id, change({ zadarmaExtension: "102" }))).resolves.toMatchObject({ zadarmaExtension: "102" })
      await expect(team.updateMember(u.owner, u.owner.id, change({ zadarmaExtension: "100" }))).rejects.toMatchObject({ status: 409, message: "Le poste 100 est déjà celui de closer Test." })
      await expect(team.updateMember(u.owner, u.closer.id, change({ zadarmaExtension: null }))).resolves.toMatchObject({ zadarmaExtension: null })
      expect(await prisma.auditLog.count({ where: { action: "team.extension_changed" } })).toBe(2)
      // Changing one's own role is still refused.
      await expect(team.updateMember(u.owner, u.owner.id, change({ role: "MANAGER" }))).rejects.toMatchObject({ status: 409 })
    })

    it("accepts digits only", () => {
      expect(() => change({ zadarmaExtension: "1a0" })).toThrow("Un poste Zadarma s’écrit en chiffres, comme 100")
      expect(() => change({})).toThrow("Aucun changement demandé")
    })
  })
})
