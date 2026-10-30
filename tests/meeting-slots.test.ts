import { describe, expect, it } from "vitest"
import { computeSlots, dayKeyIn, isSlotOpen, minuteLabel, parseMinute, validateException, validateWindows, zonedToUtc, type SlotRequest } from "@/features/meetings/slots"

const PARIS = "Europe/Paris"
const iso = (s: { start: Date }) => s.start.toISOString()
/** Monday to Friday, 9:00 to 12:00 and 14:00 to 18:00. */
const weekdays = [1, 2, 3, 4, 5].flatMap((weekday) => [
  { weekday, startMinute: 9 * 60, endMinute: 12 * 60 },
  { weekday, startMinute: 14 * 60, endMinute: 18 * 60 },
])

const base = (over: Partial<SlotRequest> = {}): SlotRequest => ({
  timezone: PARIS,
  rules: weekdays,
  from: new Date("2026-06-01T00:00:00Z"),
  to: new Date("2026-06-02T00:00:00Z"), // Monday 1 June 2026 (summer time, UTC+2)
  durationMin: 30,
  now: new Date("2026-05-20T08:00:00Z"),
  ...over,
})

describe("zonedToUtc", () => {
  it("reads the wall clock in winter and summer", () => {
    expect(zonedToUtc("2026-01-15", 9 * 60, PARIS)!.toISOString()).toBe("2026-01-15T08:00:00.000Z")
    expect(zonedToUtc("2026-07-15", 9 * 60, PARIS)!.toISOString()).toBe("2026-07-15T07:00:00.000Z")
  })
  it("returns nothing for the hour that does not exist when clocks go forward", () => {
    // 29 March 2026: 02:00 jumps to 03:00 in Paris.
    expect(zonedToUtc("2026-03-29", 2 * 60 + 30, PARIS)).toBeNull()
    expect(zonedToUtc("2026-03-29", 3 * 60, PARIS)!.toISOString()).toBe("2026-03-29T01:00:00.000Z")
  })
  it("takes the first occurrence of the hour that happens twice when clocks go back", () => {
    // 25 October 2026: 03:00 goes back to 02:00; 02:30 happens at 00:30Z (summer) and 01:30Z (winter).
    expect(zonedToUtc("2026-10-25", 2 * 60 + 30, PARIS)!.toISOString()).toBe("2026-10-25T00:30:00.000Z")
  })
  it("accepts the end of the day", () => {
    expect(zonedToUtc("2026-06-01", 1440, PARIS)!.toISOString()).toBe("2026-06-01T22:00:00.000Z")
  })
  it("works in other timezones, including half-hour offsets", () => {
    expect(zonedToUtc("2026-06-01", 9 * 60, "Asia/Kolkata")!.toISOString()).toBe("2026-06-01T03:30:00.000Z")
    expect(zonedToUtc("2026-06-01", 9 * 60, "America/New_York")!.toISOString()).toBe("2026-06-01T13:00:00.000Z")
  })
})

describe("dayKeyIn", () => {
  it("gives the calendar day where the host lives, not in UTC", () => {
    expect(dayKeyIn(new Date("2026-06-01T22:30:00Z"), PARIS)).toBe("2026-06-02")
    expect(dayKeyIn(new Date("2026-06-01T22:30:00Z"), "UTC")).toBe("2026-06-01")
  })
})

describe("computeSlots", () => {
  it("offers the working windows of the day, in UTC", () => {
    const slots = computeSlots(base())
    expect(slots).toHaveLength(14)
    expect(iso(slots[0])).toBe("2026-06-01T07:00:00.000Z") // 09:00 Paris
    expect(iso(slots[5])).toBe("2026-06-01T09:30:00.000Z") // 11:30, the last before lunch
    expect(iso(slots[6])).toBe("2026-06-01T12:00:00.000Z") // 14:00 after the break
    expect(slots[13].end.toISOString()).toBe("2026-06-01T16:00:00.000Z") // 18:00 ends the day
  })

  it("offers nothing on a day without rules", () => {
    expect(computeSlots(base({ from: new Date("2026-06-06T00:00:00Z"), to: new Date("2026-06-08T00:00:00Z") }))).toEqual([]) // Saturday and Sunday
  })

  it("keeps the same local hours across the change to summer time", () => {
    const sat = computeSlots(base({ rules: [{ weekday: 0, startMinute: 9 * 60, endMinute: 10 * 60 }], from: new Date("2026-03-28T00:00:00Z"), to: new Date("2026-03-30T00:00:00Z"), now: new Date("2026-03-01T00:00:00Z") }))
    // Sunday 29 March 2026 is the day clocks go forward: 09:00 local is 07:00Z (UTC+2), not 08:00Z.
    expect(sat.map(iso)).toEqual(["2026-03-29T07:00:00.000Z", "2026-03-29T07:30:00.000Z"])
  })

  it("counts the real length of a 25-hour day when clocks go back", () => {
    // Sunday 25 October 2026, window 00:00 to 06:00 local lasts 7 real hours: 14 half-hour slots.
    const slots = computeSlots(base({ rules: [{ weekday: 0, startMinute: 0, endMinute: 6 * 60 }], from: new Date("2026-10-24T00:00:00Z"), to: new Date("2026-10-26T00:00:00Z"), now: new Date("2026-10-01T00:00:00Z") }))
    expect(slots).toHaveLength(14)
    expect(iso(slots[0])).toBe("2026-10-24T22:00:00.000Z")
    expect(slots[13].end.toISOString()).toBe("2026-10-25T05:00:00.000Z")
  })

  it("loses the skipped hour on a 23-hour day when clocks go forward", () => {
    // Sunday 29 March 2026, window 00:00 to 06:00 local lasts 5 real hours: 10 slots, none inside 02:00-03:00.
    const slots = computeSlots(base({ rules: [{ weekday: 0, startMinute: 0, endMinute: 6 * 60 }], from: new Date("2026-03-28T00:00:00Z"), to: new Date("2026-03-30T00:00:00Z"), now: new Date("2026-03-01T00:00:00Z") }))
    expect(slots).toHaveLength(10)
    expect(iso(slots[0])).toBe("2026-03-28T23:00:00.000Z") // 00:00 local, still UTC+1
    expect(slots[9].end.toISOString()).toBe("2026-03-29T04:00:00.000Z") // 06:00 local, now UTC+2
  })

  it("does not offer a slot that overlaps a booked meeting, buffer included", () => {
    const busy = [{ start: new Date("2026-06-01T08:00:00Z"), end: new Date("2026-06-01T08:30:00Z") }] // 10:00-10:30 Paris
    const without = computeSlots(base({ busy })).map(iso)
    expect(without).not.toContain("2026-06-01T08:00:00.000Z")
    expect(without).toContain("2026-06-01T07:30:00.000Z") // 09:30-10:00 ends exactly when the meeting starts
    expect(without).toContain("2026-06-01T08:30:00.000Z")
    const withBuffer = computeSlots(base({ busy, bufferMin: 10 })).map(iso)
    expect(withBuffer).not.toContain("2026-06-01T07:30:00.000Z")
    expect(withBuffer).not.toContain("2026-06-01T08:30:00.000Z")
    expect(withBuffer).toContain("2026-06-01T07:00:00.000Z")
    expect(withBuffer).toContain("2026-06-01T09:00:00.000Z")
  })

  it("removes every slot a long meeting covers, whatever its start", () => {
    const busy = [{ start: new Date("2026-06-01T07:20:00Z"), end: new Date("2026-06-01T09:10:00Z") }]
    const left = computeSlots(base({ busy })).map(iso)
    for (const t of ["2026-06-01T07:00:00.000Z", "2026-06-01T07:30:00.000Z", "2026-06-01T08:00:00.000Z", "2026-06-01T08:30:00.000Z", "2026-06-01T09:00:00.000Z"]) expect(left).not.toContain(t)
    expect(left).toContain("2026-06-01T09:30:00.000Z")
  })

  it("applies the minimum notice and the booking horizon", () => {
    const now = new Date("2026-06-01T07:50:00Z") // 09:50 Paris
    const slots = computeSlots(base({ now, minNoticeMin: 120 })).map(iso)
    // 11:50 Paris is the earliest allowed start: 11:30 is too soon, 12:00-14:00 is the break, so the day resumes at 14:00.
    expect(slots[0]).toBe("2026-06-01T12:00:00.000Z")
    expect(computeSlots(base({ now, horizonDays: 0 }))).toEqual([])
    const far = computeSlots(base({ from: new Date("2026-06-01T00:00:00Z"), to: new Date("2026-06-30T00:00:00Z"), now: new Date("2026-06-01T00:00:00Z"), horizonDays: 3 }))
    expect(far.every((s) => s.end.getTime() <= new Date("2026-06-04T00:00:00Z").getTime())).toBe(true)
  })

  it("lets an exception close a day or open it with other hours", () => {
    const closed = computeSlots(base({ exceptions: [{ date: "2026-06-01", available: false }] }))
    expect(closed).toEqual([])
    const special = computeSlots(base({ exceptions: [{ date: "2026-06-01", available: true, startMinute: 10 * 60, endMinute: 11 * 60 }] }))
    expect(special.map(iso)).toEqual(["2026-06-01T08:00:00.000Z", "2026-06-01T08:30:00.000Z"])
    const saturday = computeSlots(base({ from: new Date("2026-06-06T00:00:00Z"), to: new Date("2026-06-07T00:00:00Z"), exceptions: [{ date: "2026-06-06", available: true, startMinute: 600, endMinute: 660 }] }))
    expect(saturday).toHaveLength(2)
  })

  it("merges touching or overlapping rules instead of offering a slot twice", () => {
    const slots = computeSlots(base({ rules: [{ weekday: 1, startMinute: 540, endMinute: 600 }, { weekday: 1, startMinute: 570, endMinute: 660 }] }))
    expect(slots.map(iso)).toEqual(["2026-06-01T07:00:00.000Z", "2026-06-01T07:30:00.000Z", "2026-06-01T08:00:00.000Z", "2026-06-01T08:30:00.000Z"])
  })

  it("ignores inactive rules and honours a step shorter than the duration", () => {
    expect(computeSlots(base({ rules: [{ weekday: 1, startMinute: 540, endMinute: 600, active: false }] }))).toEqual([])
    const stepped = computeSlots(base({ rules: [{ weekday: 1, startMinute: 540, endMinute: 600 }], stepMin: 15 }))
    expect(stepped.map(iso)).toEqual(["2026-06-01T07:00:00.000Z", "2026-06-01T07:15:00.000Z", "2026-06-01T07:30:00.000Z"])
  })

  it("serves a host whose day starts before the range does in UTC", () => {
    // Tokyo is UTC+9: Monday 00:00-01:00 there is Sunday 15:00Z, a day earlier in UTC than the host's Monday.
    const slots = computeSlots(base({ timezone: "Asia/Tokyo", rules: [{ weekday: 1, startMinute: 0, endMinute: 60 }], from: new Date("2026-05-31T12:00:00Z"), to: new Date("2026-05-31T18:00:00Z") }))
    expect(slots.map(iso)).toEqual(["2026-05-31T15:00:00.000Z", "2026-05-31T15:30:00.000Z"])
  })

  it("is deterministic and sorted", () => {
    const a = computeSlots(base({ from: new Date("2026-06-01T00:00:00Z"), to: new Date("2026-06-08T00:00:00Z") }))
    const b = computeSlots(base({ from: new Date("2026-06-01T00:00:00Z"), to: new Date("2026-06-08T00:00:00Z") }))
    expect(a.map(iso)).toEqual(b.map(iso))
    expect(a.map((s) => s.start.getTime())).toEqual([...a.map((s) => s.start.getTime())].sort((x, y) => x - y))
  })
})

describe("isSlotOpen", () => {
  it("accepts an offered slot and refuses one that is taken, off-grid or outside the hours", () => {
    const req = base({ busy: [{ start: new Date("2026-06-01T08:00:00Z"), end: new Date("2026-06-01T08:30:00Z") }] })
    expect(isSlotOpen(req, new Date("2026-06-01T07:00:00Z"))).toBe(true)
    expect(isSlotOpen(req, new Date("2026-06-01T08:00:00Z"))).toBe(false)
    expect(isSlotOpen(req, new Date("2026-06-01T07:10:00Z"))).toBe(false)
    expect(isSlotOpen(req, new Date("2026-06-01T03:00:00Z"))).toBe(false)
  })
})

describe("validation of hours typed by a host", () => {
  it("accepts a normal week and refuses overlaps, reversed hours and odd minutes", () => {
    expect(validateWindows(weekdays)).toBeNull()
    expect(validateWindows([{ weekday: 1, startMinute: 600, endMinute: 540 }])).toMatch(/après le début/)
    expect(validateWindows([{ weekday: 1, startMinute: 540, endMinute: 660 }, { weekday: 1, startMinute: 600, endMinute: 720 }])).toMatch(/chevauchent/)
    expect(validateWindows([{ weekday: 1, startMinute: 541, endMinute: 600 }])).toMatch(/5 minutes/)
    expect(validateWindows([{ weekday: 7, startMinute: 540, endMinute: 600 }])).toMatch(/jour/i)
    expect(validateWindows([{ weekday: 1, startMinute: 0, endMinute: 100 }, { weekday: 1, startMinute: 100, endMinute: 200 }, { weekday: 1, startMinute: 300, endMinute: 400 }, { weekday: 1, startMinute: 500, endMinute: 600 }])).toMatch(/Trois/)
  })
  it("validates a day exception", () => {
    expect(validateException({ date: "2026-06-01", available: false })).toBeNull()
    expect(validateException({ date: "2026-06-31", available: false })).toMatch(/Date/)
    expect(validateException({ date: "2026-06-01", available: true })).toMatch(/heures/)
    expect(validateException({ date: "2026-06-01", available: true, startMinute: 600, endMinute: 660 })).toBeNull()
  })
  it("prints and parses times", () => {
    expect(minuteLabel(570)).toBe("09:30")
    expect(parseMinute("9:30")).toBe(570)
    expect(parseMinute("24:00")).toBe(1440)
    expect(parseMinute("25:00")).toBeNull()
    expect(parseMinute("abc")).toBeNull()
  })
})
