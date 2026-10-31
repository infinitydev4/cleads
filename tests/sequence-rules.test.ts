import { describe, expect, it } from "vitest"
import { HEALTH, WINDOW, inSendWindow, mailboxHealth, nextWindowStart, scheduleAt } from "@/features/outreach/sequence-rules"
import { dayKey, startOfDay, weekday } from "@/lib/crm/day"

// 2026-11-02 is a Monday. Paris is UTC+1 in November.
const paris = (day: string, h: number, m = 0) => new Date(startOfDay(day).getTime() + (h * 60 + m) * 60_000)
const minutes = (d: Date) => Math.round((d.getTime() - startOfDay(dayKey(d)).getTime()) / 60_000)

describe("send window", () => {
  it("is open on weekdays between 9:00 and 17:30 (Paris) only", () => {
    expect(inSendWindow(paris("2026-11-02", 8, 59))).toBe(false)
    expect(inSendWindow(paris("2026-11-02", 9))).toBe(true)
    expect(inSendWindow(paris("2026-11-02", 17, 29))).toBe(true)
    expect(inSendWindow(paris("2026-11-02", 17, 30))).toBe(false)
    expect(inSendWindow(paris("2026-11-07", 11))).toBe(false) // Saturday
    expect(inSendWindow(paris("2026-11-08", 11))).toBe(false) // Sunday
  })

  it("finds the next opening", () => {
    expect(nextWindowStart(paris("2026-11-02", 7))).toEqual(paris("2026-11-02", 9))
    expect(nextWindowStart(paris("2026-11-02", 12))).toEqual(paris("2026-11-02", 12))
    expect(nextWindowStart(paris("2026-11-02", 18))).toEqual(paris("2026-11-03", 9))
    expect(nextWindowStart(paris("2026-11-06", 18))).toEqual(paris("2026-11-09", 9)) // Friday evening -> Monday
  })
})

describe("scheduling", () => {
  it("sends the first step a few minutes on when the window is open, otherwise after it opens", () => {
    const open = paris("2026-11-02", 10)
    for (let i = 0; i < 50; i++) {
      const t = scheduleAt(open, 0)
      expect(t.getTime() - open.getTime()).toBeGreaterThanOrEqual(5 * 60_000)
      expect(inSendWindow(t)).toBe(true)
    }
    for (let i = 0; i < 50; i++) {
      const t = scheduleAt(paris("2026-11-06", 20), 0) // Friday night
      expect(dayKey(t)).toBe("2026-11-09")
      expect(inSendWindow(t)).toBe(true)
    }
  })

  it("puts later steps on a random weekday minute inside the window, rolling weekends to Monday", () => {
    const seen = new Set<number>()
    for (let i = 0; i < 80; i++) {
      const t = scheduleAt(paris("2026-11-02", 14), 3)
      expect(dayKey(t)).toBe("2026-11-05")
      expect(minutes(t)).toBeGreaterThanOrEqual(WINDOW.openMinute)
      expect(minutes(t)).toBeLessThan(WINDOW.closeMinute)
      seen.add(minutes(t))
    }
    expect(seen.size).toBeGreaterThan(20) // not one fixed minute
    const weekend = scheduleAt(paris("2026-11-05", 10), 3) // Thursday + 3 = Sunday
    expect(weekday(dayKey(weekend))).toBe(1)
  })

  it("is deterministic with a given random source", () => {
    expect(scheduleAt(paris("2026-11-02", 10), 2, () => 0)).toEqual(paris("2026-11-04", 9))
  })
})

describe("mailbox health", () => {
  it("says nothing on a small sample, even with bounces", () => {
    expect(mailboxHealth({ sent: 10, bounced: 5, optOuts: 3 })).toMatchObject({ level: "few", reason: null })
  })
  it("is fine, warns, then pauses on bounces", () => {
    expect(mailboxHealth({ sent: 100, bounced: 1, optOuts: 0 }).level).toBe("ok")
    expect(mailboxHealth({ sent: 100, bounced: 3, optOuts: 0 }).level).toBe("warn")
    const p = mailboxHealth({ sent: 100, bounced: 5, optOuts: 0 })
    expect(p.level).toBe("pause")
    expect(p.reason).toContain("5,0 % de rebonds")
  })
  it("pauses on opt-outs too", () => {
    expect(mailboxHealth({ sent: 100, bounced: 0, optOuts: 4 }).level).toBe("warn")
    expect(mailboxHealth({ sent: 100, bounced: 0, optOuts: 8 }).level).toBe("pause")
  })
  it("starts judging at the minimum sample", () => {
    expect(mailboxHealth({ sent: HEALTH.minSample, bounced: 1, optOuts: 0 }).level).toBe("pause")
  })
})
