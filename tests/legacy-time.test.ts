import { describe, expect, it } from "vitest"
import { legacyWallClockToInstant, parseMinutes, subtractBreak, wallClockToUtc } from "@/features/legacy/time"

describe("wall clock to instant (Europe/Paris)", () => {
  it("winter is UTC+1, summer UTC+2", () => {
    expect(wallClockToUtc({ year: 2030, month: 1, day: 14, hour: 14, minute: 0 }, "Europe/Paris").toISOString()).toBe("2030-01-14T13:00:00.000Z")
    expect(wallClockToUtc({ year: 2030, month: 7, day: 14, hour: 14, minute: 0 }, "Europe/Paris").toISOString()).toBe("2030-07-14T12:00:00.000Z")
  })
  it("follows the changeover days (2026-10-25 clocks go back, 2027-03-28 forward)", () => {
    expect(wallClockToUtc({ year: 2026, month: 10, day: 25, hour: 1, minute: 59 }, "Europe/Paris").toISOString()).toBe("2026-10-24T23:59:00.000Z")
    expect(wallClockToUtc({ year: 2026, month: 10, day: 25, hour: 4, minute: 0 }, "Europe/Paris").toISOString()).toBe("2026-10-25T03:00:00.000Z")
    expect(wallClockToUtc({ year: 2027, month: 3, day: 28, hour: 1, minute: 59 }, "Europe/Paris").toISOString()).toBe("2027-03-28T00:59:00.000Z")
    expect(wallClockToUtc({ year: 2027, month: 3, day: 28, hour: 4, minute: 0 }, "Europe/Paris").toISOString()).toBe("2027-03-28T02:00:00.000Z")
  })
  it("works for other zones", () => {
    expect(wallClockToUtc({ year: 2030, month: 1, day: 14, hour: 9, minute: 30 }, "Asia/Dubai").toISOString()).toBe("2030-01-14T05:30:00.000Z")
    expect(wallClockToUtc({ year: 2030, month: 1, day: 14, hour: 9, minute: 0 }, "UTC").toISOString()).toBe("2030-01-14T09:00:00.000Z")
  })
  it("reads the old floating dates: the stored UTC digits are the wall clock", () => {
    expect(legacyWallClockToInstant(new Date("2030-01-14T14:00:00Z"), "Europe/Paris").toISOString()).toBe("2030-01-14T13:00:00.000Z")
  })
})

describe("minutes of the day", () => {
  it("parses valid times and refuses the rest", () => {
    expect(parseMinutes("09:30")).toBe(570)
    expect(parseMinutes("9:05")).toBe(545)
    expect(parseMinutes("24:00")).toBe(1440)
    for (const bad of ["", "25:00", "12:60", "abc", null, undefined, "12h30"]) expect(parseMinutes(bad as string)).toBeNull()
  })
})

describe("break handling", () => {
  const day = { start: 540, end: 1080 }
  it("splits a day around a lunch break", () => {
    expect(subtractBreak(day, { start: 720, end: 840 })).toEqual([{ start: 540, end: 720 }, { start: 840, end: 1080 }])
  })
  it("keeps the day when there is no overlapping break", () => {
    expect(subtractBreak(day, null)).toEqual([day])
    expect(subtractBreak(day, { start: 1200, end: 1260 })).toEqual([day])
  })
  it("handles a break at an edge or covering the whole day", () => {
    expect(subtractBreak(day, { start: 480, end: 600 })).toEqual([{ start: 600, end: 1080 }])
    expect(subtractBreak(day, { start: 1000, end: 1200 })).toEqual([{ start: 540, end: 1000 }])
    expect(subtractBreak(day, { start: 500, end: 1100 })).toEqual([])
  })
  it("ignores an empty working day", () => {
    expect(subtractBreak({ start: 600, end: 600 }, null)).toEqual([])
  })
})
