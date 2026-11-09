// Zadarma telephony (E32): request and webhook signatures, numbers, times, statistics, and the webhook route's guards.
// No database: the route cases stop before filing anything. The expected signatures were computed apart, in Python
// (urlencode with quote_plus, hmac sha1 hex digest, base64), as Zadarma's PHP client does.
import { afterEach, describe, expect, it } from "vitest"
import { authorization, canonicalNumber, queryString, signWebhook, verifyWebhook } from "@/lib/telephony/zadarma"
import { outcomeOf, pbxTime, pbxTimeText, reachedTheLine } from "@/features/telephony/rules"
import { parseStats, statCalls } from "@/features/telephony/service"
import * as webhook from "@/app/api/webhooks/zadarma/route"

const saved = { ...process.env }
afterEach(() => {
  process.env = { ...saved }
})

describe("signatures", () => {
  it("signs a request like Zadarma's PHP client: sorted query, md5 of it, hex HMAC in base64", () => {
    const query = queryString({ version: 2, start: "2026-11-09 00:00:00", end: "2026-11-10 23:59:59", call_type: "out" })
    expect(query).toBe("call_type=out&end=2026-11-10+23%3A59%3A59&start=2026-11-09+00%3A00%3A00&version=2")
    expect(authorization("/v1/statistics/pbx/", query, "key", "test-secret")).toBe("key:NzhmY2ZhZGIzMmVmY2I3NGVhZWU3MDRmMTNiNTU0Zjc1NWYwYWFiYQ==")
  })

  it("encodes like PHP's urlencode, where encodeURIComponent would leave !*'()~", () => {
    expect(queryString({ a: "x*y~z!(1)'" })).toBe("a=x%2Ay%7Ez%21%281%29%27")
  })

  const end = { event: "NOTIFY_OUT_END", internal: "200", destination: "33612345678", call_start: "2026-11-09 14:03:12", duration: "42", disposition: "answered", pbx_call_id: "out_1" }

  it("accepts a notification signed with the secret over its event's fields", () => {
    expect(signWebhook(end, "test-secret")).toBe("ZTRmOWNkM2U4MmQ3NTdmZGRkY2NkMjQ0NTQxMjQzZmFlN2ZmYmRjYw==")
    expect(verifyWebhook(new URLSearchParams(end), signWebhook(end, "test-secret"), "test-secret")).toBe(true)
  })

  it("refuses another secret, a changed signed field, a missing signature and an unknown event", () => {
    const sig = signWebhook(end, "test-secret")
    expect(verifyWebhook(new URLSearchParams(end), sig, "other")).toBe(false)
    expect(verifyWebhook(new URLSearchParams({ ...end, destination: "33699999999" }), sig, "test-secret")).toBe(false)
    expect(verifyWebhook(new URLSearchParams(end), null, "test-secret")).toBe(false)
    expect(verifyWebhook(new URLSearchParams({ ...end, event: "NOTIFY_SOMETHING" }), sig, "test-secret")).toBe(false)
  })
})

describe("numbers, outcomes and times", () => {
  it("makes the PBX's numbers canonical like the fiches'", () => {
    expect(canonicalNumber("33612345678")).toBe("+33612345678")
    expect(canonicalNumber("+33 6 12 34 56 78")).toBe("+33612345678")
    expect(canonicalNumber("0612345678")).toBe("+33612345678")
    expect(canonicalNumber("0033612345678")).toBe("+33612345678")
    expect(canonicalNumber("447700900123")).toBe("+447700900123")
    expect(canonicalNumber("100")).toBe("100")
    expect(canonicalNumber("anonymous")).toBe("anonymous")
  })

  it("knows the outcome of a call nobody picked up, and leaves a picked-up one to the person", () => {
    expect(outcomeOf("no answer")).toBe("no_answer")
    expect(outcomeOf("busy")).toBe("no_answer")
    expect(outcomeOf("cancel")).toBe("no_answer")
    expect(outcomeOf("unallocated number")).toBe("wrong_number")
    expect(outcomeOf("answered")).toBeNull()
    expect(reachedTheLine("answered")).toBe(true)
    expect(reachedTheLine("no money")).toBe(false)
    expect(reachedTheLine("failed")).toBe(false)
  })

  it("reads the PBX's times in the account's time zone, summer and winter", () => {
    expect(pbxTime("2026-11-09 14:03:12", "Europe/Paris")?.toISOString()).toBe("2026-11-09T13:03:12.000Z")
    expect(pbxTime("2026-07-09 14:03:12", "Europe/Paris")?.toISOString()).toBe("2026-07-09T12:03:12.000Z")
    expect(pbxTime("2026-07-09 14:03:12", "Africa/Algiers")?.toISOString()).toBe("2026-07-09T13:03:12.000Z")
    expect(pbxTime("hier", "Europe/Paris")).toBeNull()
    expect(pbxTimeText(new Date("2026-11-09T13:03:12Z"), "Europe/Paris")).toBe("2026-11-09 14:03:12")
  })
})

describe("statistics", () => {
  const text = `{"status":"success","stats":[
    {"call_id":1762693392.2702773,"sip":100,"callstart":"2026-11-09 14:03:12","clid":"33240000001","destination":"33240000002","disposition":"answered","seconds":42,"is_recorded":true,"pbx_call_id":"out_a"},
    {"call_id":1762693500.1,"sip":100,"callstart":"2026-11-09 14:05:00","clid":"33240000001","destination":"33240000003","disposition":"no answer","seconds":0,"is_recorded":false,"pbx_call_id":"out_b"}]}`

  it("keeps the recording's call_id as written, beyond what a JSON number holds", () => {
    expect(parseStats(text)[0].call_id).toBe("1762693392.2702773")
  })

  it("turns rows into calls, the recording only when there is one", () => {
    const calls = statCalls(parseStats(text), "OUTBOUND")
    expect(calls).toEqual([
      { externalId: "out_a", direction: "OUTBOUND", extension: "100", number: "33240000002", startedAt: new Date("2026-11-09T13:03:12Z"), durationSec: 42, disposition: "answered", recordingId: "1762693392.2702773" },
      expect.objectContaining({ externalId: "out_b", disposition: "no answer", recordingId: null }),
    ])
  })

  it("keeps one call per pbx_call_id: the leg that was answered", () => {
    const legs = [
      { pbx_call_id: "in_x", callstart: "2026-11-09 10:00:00", clid: "33240000009", destination: "101", disposition: "no answer", seconds: 0 },
      { pbx_call_id: "in_x", callstart: "2026-11-09 10:00:00", clid: "33240000009", destination: "100", disposition: "answered", seconds: 65 },
    ]
    expect(statCalls(legs, "INBOUND")).toEqual([expect.objectContaining({ externalId: "in_x", extension: "100", number: "33240000009", durationSec: 65 })])
  })
})

describe("/api/webhooks/zadarma", () => {
  const post = (fields: Record<string, string>, signature?: string) =>
    new Request("https://cleads.fr/api/webhooks/zadarma", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", ...(signature ? { Signature: signature } : {}) }, body: new URLSearchParams(fields).toString() })

  it("echoes zd_echo so that Zadarma can save the address, and nothing that is not a token", async () => {
    const res = await webhook.GET(new Request("https://cleads.fr/api/webhooks/zadarma?zd_echo=abc123"))
    expect(await res.text()).toBe("abc123")
    expect((await webhook.GET(new Request("https://cleads.fr/api/webhooks/zadarma?zd_echo=<script>"))).status).toBe(400)
  })

  it("is closed while the secret is not set", async () => {
    delete process.env.ZADARMA_API_SECRET
    expect((await webhook.POST(post({ event: "NOTIFY_OUT_END" }))).status).toBe(503)
  })

  it("acknowledges the events it does not keep, and refuses a bad signature on those it keeps", async () => {
    process.env.ZADARMA_API_SECRET = "test-secret"
    expect((await webhook.POST(post({ event: "NOTIFY_START", caller_id: "1", called_did: "2", call_start: "x" }))).status).toBe(200)
    const fields = { event: "NOTIFY_OUT_END", internal: "100", destination: "33612345678", call_start: "2026-11-09 14:03:12", pbx_call_id: "out_1" }
    expect((await webhook.POST(post(fields))).status).toBe(403)
    expect((await webhook.POST(post(fields, signWebhook(fields, "other")))).status).toBe(403)
  })
})
