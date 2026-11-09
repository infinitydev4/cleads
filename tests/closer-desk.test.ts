// The closer's desk (9 November 2026): the rules that decide a row's site sign and its call priority.
import { describe, expect, it } from "vitest"
import { COLD_SCORE, HOT_SCORE, WEAK_SITE_BELOW, priorityOf, siteState } from "@/features/leads/insights"

describe("the site sign", () => {
  it("tells no site, a site to improve, a correct one and a site nobody audited", () => {
    expect(siteState(null, null)).toBe("none")
    expect(siteState("", 90)).toBe("none")
    expect(siteState("https://a.example", null)).toBe("unknown")
    // A social or directory page is not a site, audited or not.
    expect(siteState("https://www.facebook.com/plomberie.martin", null)).toBe("social")
    expect(siteState("instagram.com/abc_elec", 90)).toBe("social")
    expect(siteState("https://www.pagesjaunes.fr/pros/123", null)).toBe("social")
    expect(siteState("https://a.example", WEAK_SITE_BELOW - 1)).toBe("weak")
    expect(siteState("https://a.example", WEAK_SITE_BELOW)).toBe("ok")
  })
})

describe("the call priority", () => {
  const base = { status: "CONTACTED" as const, score: 60, hasPhone: true, blocked: false, dueToday: false, recentSignal: false }

  it("puts first a callback, a reply, a recent signal or a strong fiche never called", () => {
    expect(priorityOf({ ...base, dueToday: true })).toBe(1)
    expect(priorityOf({ ...base, status: "REPLIED" })).toBe(1)
    expect(priorityOf({ ...base, recentSignal: true })).toBe(1)
    expect(priorityOf({ ...base, status: "NEW", score: HOT_SCORE })).toBe(1)
    expect(priorityOf({ ...base, status: "CONTACTED", score: HOT_SCORE })).toBe(2)
  })

  it("lets wait a fiche without phone, out of the game or weak, whatever else it has", () => {
    expect(priorityOf({ ...base, hasPhone: false, dueToday: true })).toBe(3)
    expect(priorityOf({ ...base, status: "DO_NOT_CONTACT" })).toBe(3)
    expect(priorityOf({ ...base, status: "DISQUALIFIED", recentSignal: true })).toBe(3)
    expect(priorityOf({ ...base, blocked: true, status: "REPLIED" })).toBe(3)
    expect(priorityOf({ ...base, score: COLD_SCORE - 1 })).toBe(3)
    expect(priorityOf(base)).toBe(2)
  })
})
