// The phone in the browser and the calls board (E32 lot 2): the member's WebRTC key, the managers' figures by period,
// and the fiche's timeline telling a reported call and its recording.
// Needs a disposable PostgreSQL with the migrations applied (never your development database):
//   TEST_DATABASE_URL=postgresql://… npx vitest run tests/webphone.integration.test.ts
// Zadarma's API is never called: fetch is replaced where a case needs an answer from it.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { resetDatabase } from "./helpers/reset-db"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip
const NOW = new Date("2026-11-20T15:00:00Z")
const MIN = 60_000
const DAY = 86_400_000

suite("phone in the browser and calls board (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let tel: typeof import("@/features/telephony/service")
  let webphone: typeof import("@/features/telephony/webphone")
  let stats: typeof import("@/features/telephony/stats")
  let leads: typeof import("@/features/leads/service")
  type U = import("@/lib/auth/guard").CurrentUser
  const u: Record<string, U> = {}
  const ws = "ws_default"
  const id: Record<string, string> = {}
  const saved = { ...process.env }

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    prisma = (await import("@/lib/prisma")).prisma
    tel = await import("@/features/telephony/service")
    webphone = await import("@/features/telephony/webphone")
    stats = await import("@/features/telephony/stats")
    leads = await import("@/features/leads/service")
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
    webphone.forgetWebphoneKeys()
    for (const [key, role, ext] of [["manager", "MANAGER", null], ["closer", "CLOSER", "100"], ["sdr", "SDR", null]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@phone.test`, name: `${key} Test`, role, workspaceId: ws, zadarmaExtension: ext } })
      u[key] = { id: x.id, workspaceId: ws, name: `${key} Test`, email: x.email!, image: null, role }
    }
    for (const [key, phone] of [["Plomberie", "+33240000001"], ["Salon", "+33240000002"]] as const) {
      const company = await prisma.company.create({ data: { workspaceId: ws, name: key, phone } })
      id[key] = (await prisma.lead.create({ data: { workspaceId: ws, companyId: company.id, ownerId: u.closer.id } })).id
    }
  })

  const keys = () => {
    process.env.ZADARMA_API_KEY = "key"
    process.env.ZADARMA_API_SECRET = "test-secret"
  }

  describe("the member's WebRTC key", () => {
    it("says why there is no line: no keys yet, then no extension", async () => {
      delete process.env.ZADARMA_API_KEY
      expect(await webphone.webphoneSession(u.closer)).toMatchObject({ ready: false, reason: "not_configured" })
      keys()
      expect(await webphone.webphoneSession(u.sdr)).toMatchObject({ ready: false, reason: "no_extension", message: expect.stringContaining("Réglages › Équipe") })
    })

    it("asks Zadarma for the key of the member's full extension, once a day", async () => {
      keys()
      let n = 0
      const fetch = vi.fn(async (url: string, _init?: RequestInit) =>
        new Response(JSON.stringify(String(url).includes("/v1/pbx/internal/") ? { status: "success", pbx_id: 123456, numbers: [100] } : { status: "success", key: `webrtc-key-${++n}` }))
      )
      const keyCalls = () => fetch.mock.calls.filter(([url]) => String(url).includes("get_key")).length
      vi.stubGlobal("fetch", fetch)
      // Équipe says "100"; the widget only knows the extension with its PBX number.
      expect(await webphone.webphoneSession(u.closer, NOW.getTime())).toEqual({ ready: true, key: "webrtc-key-1", sip: "123456-100" })
      expect(fetch.mock.calls.map(([url]) => String(url))).toEqual(["https://api.zadarma.com/v1/pbx/internal/", "https://api.zadarma.com/v1/webrtc/get_key/?sip=123456-100"])
      await webphone.webphoneSession(u.closer, NOW.getTime() + 3_600_000)
      expect(fetch).toHaveBeenCalledTimes(2)
      await webphone.webphoneSession(u.closer, NOW.getTime() + 25 * 3_600_000)
      expect(keyCalls()).toBe(2)
      // The browser found the key refused: a fresh one, kept for the next pages.
      expect(await webphone.webphoneSession(u.closer, NOW.getTime() + 26 * 3_600_000, { fresh: true })).toMatchObject({ key: "webrtc-key-3" })
      expect(await webphone.webphoneSession(u.closer, NOW.getTime() + 27 * 3_600_000)).toMatchObject({ key: "webrtc-key-3" })
      expect(keyCalls()).toBe(3)
      // The PBX number is asked once per server instance.
      expect(fetch.mock.calls.filter(([url]) => String(url).includes("/v1/pbx/internal/")).length).toBe(1)
    })

    it("explains a refusal from Zadarma", async () => {
      keys()
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "error", message: "domain" }), { status: 401 })))
      expect(await webphone.webphoneSession(u.closer)).toMatchObject({ ready: false, reason: "refused", message: expect.stringContaining("WebRTC") })
    })
  })

  const call = (externalId: string, o: Partial<import("@/features/telephony/rules").ReportedCall>) =>
    tel.recordCall(ws, { externalId, direction: "OUTBOUND", extension: "100", number: "33240000001", startedAt: new Date(NOW.getTime() - 10 * MIN), durationSec: 0, disposition: "no answer", recordingId: null, ...o })

  it("counts each member's calls, pick-ups and talk time by period, for managers only", async () => {
    await call("out_1", { disposition: "answered", durationSec: 120, recordingId: "rec_1" })
    await call("out_2", { number: "33240000002", startedAt: new Date(NOW.getTime() - 20 * MIN) })
    await call("out_3", { disposition: "answered", durationSec: 60, startedAt: new Date(NOW.getTime() - 3 * DAY) })
    await call("out_4", { disposition: "answered", durationSec: 30, startedAt: new Date(NOW.getTime() - 15 * DAY) })
    await prisma.meeting.create({ data: { workspaceId: ws, leadId: id.Plomberie, hostId: u.closer.id, startsAt: new Date(NOW.getTime() + DAY), endsAt: new Date(NOW.getTime() + DAY + 30 * MIN), type: "DISCOVERY", createdAt: new Date(NOW.getTime() - 5 * MIN) } })

    const board = await stats.callBoard(u.manager, NOW)
    expect(board.periods.today).toMatchObject({ calls: 2, answered: 1, talkSec: 120, meetings: 1 })
    expect(board.periods.today.rows).toEqual([expect.objectContaining({ id: u.closer.id, extension: "100", calls: 2, answered: 1, talkSec: 120 })])
    expect(board.periods.week).toMatchObject({ calls: 3, answered: 2, talkSec: 180 })
    expect(board.periods.month).toMatchObject({ calls: 4, talkSec: 210 })
    expect(board.recent.map((c) => c.id).length).toBe(4)
    expect(board.recent[0]).toMatchObject({ leadName: "Plomberie", userName: "closer Test", recorded: true, outcome: null })

    await expect(stats.callBoard(u.closer, NOW)).rejects.toMatchObject({ status: 403 })
  })

  it("shows what the closer made of a call on the board, and its recording on the fiche", async () => {
    await call("out_1", { disposition: "answered", durationSec: 252, recordingId: "rec_1", startedAt: new Date(Date.now() - MIN) })
    await leads.addActivity(u.closer, id.Plomberie, { kind: "CALL", outcome: "reached" })
    expect((await stats.callBoard(u.manager)).recent[0].outcome).toBe("reached")

    const fiche = await leads.getLead(u.closer, id.Plomberie)
    const reported = fiche.activities.find((a) => a.kind === "CALL")
    expect(reported).toMatchObject({ outcome: "reached", call: { direction: "OUTBOUND", durationSec: 252, recorded: true } })
    const timeline = await leads.listTimeline(u.closer, id.Plomberie, { kinds: ["CALL"] })
    expect(timeline.items[0].call?.recorded).toBe(true)
  })
})
