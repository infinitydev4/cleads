import { describe, expect, it } from "vitest"
import { addDays, dayBounds, dayKey, isDayKey, snoozeTargets, startOfDay } from "@/lib/crm/day"
import { activitySchema, canAssignTaskTo, canChangeTask, canDeleteTask, createTaskSchema } from "@/features/activity/rules"

describe("days in Paris", () => {
  it("starts a day at local midnight, winter and summer", () => {
    expect(startOfDay("2026-01-15").toISOString()).toBe("2026-01-14T23:00:00.000Z")
    expect(startOfDay("2026-07-15").toISOString()).toBe("2026-07-14T22:00:00.000Z")
  })

  it("survives the changes of hour: a 23-hour and a 25-hour day", () => {
    const spring = dayBounds(new Date("2026-03-29T10:00:00Z"))
    expect(spring.start.toISOString()).toBe("2026-03-28T23:00:00.000Z")
    expect((spring.end.getTime() - spring.start.getTime()) / 3600_000).toBe(23)
    const autumn = dayBounds(new Date("2026-10-25T10:00:00Z"))
    expect(autumn.start.toISOString()).toBe("2026-10-24T22:00:00.000Z")
    expect((autumn.end.getTime() - autumn.start.getTime()) / 3600_000).toBe(25)
  })

  it("puts late evening UTC on the next Paris day", () => {
    expect(dayKey(new Date("2026-06-10T22:30:00Z"))).toBe("2026-06-11")
    expect(dayKey(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01")
  })

  it("adds days across months and years", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02")
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
  })

  it("rejects dates that do not exist", () => {
    expect(isDayKey("2026-02-30")).toBe(false)
    expect(isDayKey("2026-2-3")).toBe(false)
    expect(isDayKey("2026-02-28")).toBe(true)
  })

  it("offers next Monday, never today, whatever the weekday", () => {
    // 2026-11-02 is a Monday: "next Monday" is the 9th, not today.
    expect(snoozeTargets("2026-11-02").find((t) => t.id === "monday")!.day).toBe("2026-11-09")
    expect(snoozeTargets("2026-11-06").find((t) => t.id === "monday")!.day).toBe("2026-11-09") // Friday
    expect(snoozeTargets("2026-11-08").find((t) => t.id === "monday")!.day).toBe("2026-11-09") // Sunday
  })
})

describe("task rules", () => {
  const sdr = { id: "s", role: "SDR" as const }
  it("lets a SDR give a task to themselves or to whoever holds the fiche, nobody else", () => {
    expect(canAssignTaskTo(sdr, "s", [])).toBe(true)
    expect(canAssignTaskTo(sdr, "c1", ["s", "c1"])).toBe(true)
    expect(canAssignTaskTo(sdr, "c2", ["s", "c1"])).toBe(false)
  })
  it("lets managers and owners give a task to anyone", () => {
    expect(canAssignTaskTo({ id: "m", role: "MANAGER" }, "c2", [])).toBe(true)
    expect(canAssignTaskTo({ id: "o", role: "OWNER" }, "c2", [])).toBe(true)
  })
  it("keeps viewers out and lets assignee, author or fiche writer change a task", () => {
    const task = { assigneeId: "a", createdById: "b" }
    expect(canChangeTask({ id: "a", role: "CLOSER" }, task, false)).toBe(true)
    expect(canChangeTask({ id: "b", role: "SDR" }, task, false)).toBe(true)
    expect(canChangeTask({ id: "x", role: "SDR" }, task, false)).toBe(false)
    expect(canChangeTask({ id: "x", role: "SDR" }, task, true)).toBe(true)
    expect(canChangeTask({ id: "a", role: "VIEWER" }, task, true)).toBe(false)
  })
  it("limits deletion to the author and managers", () => {
    expect(canDeleteTask({ id: "b", role: "SDR" }, { createdById: "b" })).toBe(true)
    expect(canDeleteTask({ id: "a", role: "CLOSER" }, { createdById: "b" })).toBe(false)
    expect(canDeleteTask({ id: "m", role: "MANAGER" }, { createdById: "b" })).toBe(true)
  })
})

describe("input schemas", () => {
  it("needs text for a note, and an outcome or text for a call", () => {
    expect(activitySchema.safeParse({ kind: "NOTE", body: "  " }).success).toBe(false)
    expect(activitySchema.safeParse({ kind: "CALL" }).success).toBe(false)
    expect(activitySchema.safeParse({ kind: "CALL", outcome: "voicemail" }).success).toBe(true)
    expect(activitySchema.safeParse({ kind: "CALL", body: "Répondeur" }).success).toBe(true)
  })
  it("refuses an unknown outcome, a negative or absurd duration, a note with call fields", () => {
    expect(activitySchema.safeParse({ kind: "CALL", outcome: "maybe" }).success).toBe(false)
    expect(activitySchema.safeParse({ kind: "CALL", outcome: "reached", durationMin: -1 }).success).toBe(false)
    expect(activitySchema.safeParse({ kind: "CALL", outcome: "reached", durationMin: 9999 }).success).toBe(false)
    expect(activitySchema.safeParse({ kind: "NOTE", body: "x", outcome: "reached" }).success).toBe(false)
  })
  it("trims titles and rejects empty ones and impossible dates", () => {
    expect(createTaskSchema.parse({ title: "  Rappeler  " }).title).toBe("Rappeler")
    expect(createTaskSchema.safeParse({ title: " " }).success).toBe(false)
    expect(createTaskSchema.safeParse({ title: "x", dueDay: "2026-13-01" }).success).toBe(false)
  })
})
