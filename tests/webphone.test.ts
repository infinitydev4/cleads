// The phone in the browser (E32 lot 2): how Zadarma's status messages and the closer's actions move the call from one
// phase to the next, and the small formats it shows. No browser: the provider only runs this reducer.
import { describe, expect, it } from "vitest"
import { clock, dialString, initialWebphone, spoken, webphoneReducer, type WebphoneEvent, type WebphoneState } from "@/features/telephony/webphone-state"

const target = { leadId: "lead_1", name: "Claire Dubois · Saint Algue", number: "+33240367761" }
const run = (events: WebphoneEvent[], from: WebphoneState = initialWebphone) => events.reduce(webphoneReducer, from)
const ready = run([{ type: "loading" }, { type: "registered" }])
const status = (message: string, at: number, params?: { caller?: string; callername?: string }): WebphoneEvent => ({ type: "status", message, at, params })

describe("the phone in the browser", () => {
  it("rings, connects, counts the talk from the pick-up, and ends answered", () => {
    const live = run([{ type: "dial", target }, status("outgoing", 1_000), status("confirmed", 5_000)], ready)
    expect(live).toMatchObject({ phase: "live", since: 5_000, call: target })
    const ended = run([status("canceled", 65_400)], live)
    expect(ended).toMatchObject({ phase: "ready", call: null, since: null, ended: { ...target, answered: true, durationSec: 60 } })
  })

  it("ends unanswered when nobody picks up or the line is busy", () => {
    expect(run([{ type: "dial", target }, status("busy", 9_000)], ready).ended).toMatchObject({ answered: false, durationSec: 0 })
    expect(run([{ type: "dial", target }, { type: "end", at: 9_000 }], ready).ended).toMatchObject({ answered: false })
  })

  it("counts an end once, whether the library or the closer says it first", () => {
    const live = run([{ type: "dial", target }, status("confirmed", 0)], ready)
    const once = run([{ type: "end", at: 30_000 }], live)
    expect(run([status("canceled", 45_000)], once)).toBe(once)
  })

  it("dials only from a ready line", () => {
    expect(run([{ type: "dial", target }], initialWebphone).phase).toBe("off")
    const ringing = run([{ type: "dial", target }], ready)
    expect(run([{ type: "dial", target: { ...target, leadId: "lead_2" } }], ringing).call?.leadId).toBe("lead_1")
  })

  it("answers an incoming call, and goes back to ready when it is refused", () => {
    const incoming = run([status("incoming", 0, { caller: "33240000002", callername: "Salon" })], ready)
    expect(incoming).toMatchObject({ phase: "incoming", call: { name: "Salon", number: "33240000002", leadId: null } })
    expect(run([status("accepted", 2_000)], incoming)).toMatchObject({ phase: "live", since: 2_000 })
    expect(run([status("canceled", 2_000)], incoming)).toMatchObject({ phase: "ready", call: null, ended: null })
  })

  it("explains a refused microphone and drops the ringing call", () => {
    const blocked = run([{ type: "dial", target }, status("noMicrophone", 0)], ready)
    expect(blocked).toMatchObject({ micBlocked: true, phase: "ready", call: null })
    expect(run([{ type: "dial", target }], blocked).micBlocked).toBe(false)
  })

  it("mutes and holds only a live call", () => {
    expect(run([{ type: "mute", on: true }], ready).muted).toBe(false)
    const live = run([{ type: "dial", target }, status("confirmed", 0)], ready)
    expect(run([{ type: "mute", on: true }, status("hold", 1)], live)).toMatchObject({ muted: true, held: true })
    expect(run([{ type: "mute", on: true }, { type: "end", at: 1_000 }], live)).toMatchObject({ muted: false, held: false })
  })

  it("rings only once Zadarma has taken the call, and says so when it never does", () => {
    const connecting = run([{ type: "dial", target }], ready)
    expect(connecting).toMatchObject({ phase: "ringing", placed: false })
    expect(run([status("outgoing", 500)], connecting).placed).toBe(true)
    const failed = run([{ type: "failed", message: "L’appel n’est pas parti" }], connecting)
    expect(failed).toMatchObject({ phase: "ready", call: null, ended: null, failure: { leadId: "lead_1", message: "L’appel n’est pas parti" } })
    // A call Zadarma took ends as an unanswered call, never as a failure.
    expect(run([status("outgoing", 500), { type: "failed", message: "x" }], connecting).phase).toBe("ringing")
    expect(run([{ type: "dial", target }], failed).failure).toBeNull()
  })

  it("dials the number Zadarma expects, whatever the fiche holds", () => {
    expect(dialString("+33240367761")).toBe("33240367761")
    expect(dialString("06 12 34 56 78")).toBe("33612345678")
    expect(dialString("0033 6 00 00 00 01")).toBe("33600000001")
    expect(dialString("+213 555 12 34 56")).toBe("213555123456")
  })

  it("says why there is no line", () => {
    expect(run([{ type: "unavailable", message: "Aucun poste" }], ready)).toMatchObject({ phase: "off", unavailable: "Aucun poste" })
    expect(run([status("BROWSER_NOT_SUPPORTED", 0)], ready).unavailable).toMatch(/Chrome, Edge ou Firefox/)
  })

  it("dials without the plus, and tells times the way the closer reads them", () => {
    expect(dialString("+33 2 40 36 77 61")).toBe("33240367761")
    expect(clock(161)).toBe("02:41")
    expect(clock(3_725)).toBe("1:02:05")
    expect(spoken(48)).toBe("48 s")
    expect(spoken(252)).toBe("4 min 12")
    expect(spoken(4_020)).toBe("1 h 07")
  })
})
