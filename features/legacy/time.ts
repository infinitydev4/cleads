/** Time helpers for reading the old back-office dates. No dependency on the app: used by a CLI script too. */

function offsetMs(utcMs: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(utcMs))
      .map((p) => [p.type, p.value])
  )
  const asIfUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
  return asIfUtc - Math.floor(utcMs / 1000) * 1000
}

/**
 * The instant at which a wall clock reads `year-month-day hour:minute` in an IANA time zone.
 * In the hour that repeats when clocks go back, the first occurrence is returned; a time that does not
 * exist (clocks going forward) resolves to the instant just after the gap.
 */
export function wallClockToUtc(wall: { year: number; month: number; day: number; hour: number; minute: number }, timeZone: string): Date {
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute)
  let utc = naive - offsetMs(naive, timeZone)
  utc = naive - offsetMs(utc, timeZone)
  return new Date(utc)
}

/**
 * The old booking code stored the date the visitor picked with its wall-clock digits written as if they were UTC
 * (`convertToUTC`). Reading them back as wall clock in the business time zone gives the real instant.
 */
export function legacyWallClockToInstant(stored: Date, timeZone: string): Date {
  return wallClockToUtc(
    {
      year: stored.getUTCFullYear(),
      month: stored.getUTCMonth() + 1,
      day: stored.getUTCDate(),
      hour: stored.getUTCHours(),
      minute: stored.getUTCMinutes(),
    },
    timeZone
  )
}

/** "09:30" to 570. Returns null for anything that is not a valid time of day. */
export function parseMinutes(hhmm: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm?.trim() ?? "")
  if (!m) return null
  const [h, min] = [Number(m[1]), Number(m[2])]
  return h <= 24 && min < 60 && h * 60 + min <= 1440 ? h * 60 + min : null
}

export type Interval = { start: number; end: number }

/** A working interval minus a break: zero, one or two intervals. */
export function subtractBreak(work: Interval, brk: Interval | null): Interval[] {
  if (work.end <= work.start) return []
  if (!brk || brk.end <= work.start || brk.start >= work.end) return [work]
  const out: Interval[] = []
  if (brk.start > work.start) out.push({ start: work.start, end: brk.start })
  if (brk.end < work.end) out.push({ start: brk.end, end: work.end })
  return out
}
