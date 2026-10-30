import { addDays, isDayKey, weekday } from "@/lib/crm/day"

/**
 * Open slots of a host. Everything here is a pure function of its inputs: instants are UTC `Date`s, calendar days are
 * "YYYY-MM-DD" keys read in an IANA timezone, and nothing looks at the clock or the database. That is what makes the
 * daylight-saving and overlap cases testable.
 */

const formatters = new Map<string, Intl.DateTimeFormat>()
function formatter(tz: string) {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    formatters.set(tz, f)
  }
  return f
}

/** Wall-clock reading of an instant in a timezone. */
export function zonedParts(d: Date, tz: string) {
  const p = Object.fromEntries(formatter(tz).formatToParts(d).map((x) => [x.type, Number(x.value)])) as Record<string, number>
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute }
}

export function isValidTimezone(tz: string): boolean {
  try {
    formatter(tz).format(new Date())
    return true
  } catch {
    return false
  }
}

/** Calendar day ("2026-03-29") of an instant in a timezone. */
export function dayKeyIn(d: Date, tz: string): string {
  const p = zonedParts(d, tz)
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`
}

/**
 * The instant at which a wall clock reads `minute` minutes after midnight on `day` in `tz`.
 * Returns null when that time does not exist (the hour skipped when clocks go forward). When it exists twice (clocks go
 * back) the first occurrence is returned. `minute` may be 1440 for the end of the day.
 */
export function zonedToUtc(day: string, minute: number, tz: string): Date | null {
  const [y, m, d] = day.split("-").map(Number)
  const wall = Date.UTC(y, m - 1, d, 0, minute) // the wall clock written as if it were UTC
  const offsetAt = (t: number) => {
    const p = zonedParts(new Date(t), tz)
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(t / 60000) * 60000
  }
  // The offset can only be one of the two around the instant: try both and keep what reads back as the wanted time.
  const candidates = new Set([offsetAt(wall - 24 * 3600_000), offsetAt(wall + 24 * 3600_000), offsetAt(wall)])
  const readsBack = (t: number) => {
    const p = zonedParts(new Date(t), tz)
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) === wall
  }
  const hits = [...candidates].map((off) => wall - off).filter(readsBack)
  if (hits.length === 0) return null
  return new Date(Math.min(...hits))
}

export interface WeeklyWindow {
  /** 0 = Sunday ... 6 = Saturday. */
  weekday: number
  startMinute: number
  endMinute: number
  active?: boolean
}

export interface DayException {
  /** Calendar day in the host's timezone. */
  date: string
  available: boolean
  startMinute?: number | null
  endMinute?: number | null
}

export interface BusyInterval {
  start: Date
  end: Date
}

export interface SlotRequest {
  timezone: string
  rules: WeeklyWindow[]
  exceptions?: DayException[]
  busy?: BusyInterval[]
  /** First instant (inclusive) and last instant (exclusive) of the range asked for. */
  from: Date
  to: Date
  durationMin: number
  /** Distance between the starts of two offered slots; defaults to the duration. */
  stepMin?: number
  /** Free time kept before and after every busy interval. */
  bufferMin?: number
  minNoticeMin?: number
  horizonDays?: number
  now: Date
}

export interface Slot {
  start: Date
  end: Date
}

/** Working windows of a day, merged: two rules that touch or overlap become one so a slot is never offered twice. */
export function windowsOfDay(day: string, req: Pick<SlotRequest, "rules" | "exceptions">): [number, number][] {
  const ex = req.exceptions?.find((e) => e.date === day)
  let raw: [number, number][]
  if (ex) {
    raw = ex.available && ex.startMinute != null && ex.endMinute != null && ex.endMinute > ex.startMinute ? [[ex.startMinute, ex.endMinute]] : []
  } else {
    const wd = weekday(day)
    raw = req.rules.filter((r) => r.weekday === wd && r.active !== false && r.endMinute > r.startMinute).map((r) => [r.startMinute, r.endMinute] as [number, number])
  }
  raw.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const w of raw) {
    const last = merged[merged.length - 1]
    if (last && w[0] <= last[1]) last[1] = Math.max(last[1], w[1])
    else merged.push([...w])
  }
  return merged
}

export function computeSlots(req: SlotRequest): Slot[] {
  const { timezone: tz, durationMin, now } = req
  const step = Math.max(5, req.stepMin ?? durationMin)
  const buffer = Math.max(0, req.bufferMin ?? 0)
  const earliest = Math.max(req.from.getTime(), now.getTime() + (req.minNoticeMin ?? 0) * 60_000)
  const latest = Math.min(req.to.getTime(), req.horizonDays != null ? now.getTime() + req.horizonDays * 86_400_000 : Infinity)
  if (durationMin <= 0 || earliest >= latest) return []

  const busy = (req.busy ?? []).map((b) => [b.start.getTime() - buffer * 60_000, b.end.getTime() + buffer * 60_000] as const)
  const slots: Slot[] = []

  // One day of margin on each side: a window in a far timezone can start the day before in UTC.
  let day = addDays(dayKeyIn(new Date(earliest), tz), -1)
  const lastDay = addDays(dayKeyIn(new Date(Math.min(latest, 8.64e15 - 1)), tz), 1)
  for (let guard = 0; day <= lastDay && guard < 400; day = addDays(day, 1), guard++) {
    for (const [a, b] of windowsOfDay(day, req)) {
      const winStart = zonedToUtc(day, a, tz)
      const winEnd = zonedToUtc(day, b, tz) ?? zonedToUtc(day, b + 60, tz) // an end inside the skipped hour closes at the jump
      if (!winStart || !winEnd) continue
      for (let t = winStart.getTime(); t + durationMin * 60_000 <= winEnd.getTime(); t += step * 60_000) {
        const end = t + durationMin * 60_000
        if (t < earliest || end > latest) continue
        if (busy.some(([bs, be]) => t < be && end > bs)) continue
        slots.push({ start: new Date(t), end: new Date(end) })
      }
    }
  }
  slots.sort((x, y) => x.start.getTime() - y.start.getTime())
  return slots.filter((s, i) => i === 0 || s.start.getTime() !== slots[i - 1].start.getTime())
}

/** Is exactly this slot among the open ones? The server checks it again at booking time. */
export function isSlotOpen(req: SlotRequest, start: Date): boolean {
  const end = new Date(start.getTime() + req.durationMin * 60_000)
  return computeSlots({ ...req, from: new Date(start.getTime() - 1), to: new Date(end.getTime() + 1) }).some((s) => s.start.getTime() === start.getTime())
}

// ── Validation of what a host enters ────────────────────────────────────────────────────────────────────────────

export type RuleProblem = string | null

/** Weekly hours typed by a host: at most 3 windows a day, on 5-minute marks, not overlapping. */
export function validateWindows(windows: WeeklyWindow[]): RuleProblem {
  for (const w of windows) {
    if (!Number.isInteger(w.weekday) || w.weekday < 0 || w.weekday > 6) return "Jour de la semaine invalide."
    if (!Number.isInteger(w.startMinute) || !Number.isInteger(w.endMinute) || w.startMinute < 0 || w.endMinute > 1440) return "Horaire invalide."
    if (w.startMinute % 5 || w.endMinute % 5) return "Les horaires se règlent par pas de 5 minutes."
    if (w.endMinute <= w.startMinute) return "La fin doit être après le début."
  }
  for (let d = 0; d < 7; d++) {
    const day = windows.filter((w) => w.weekday === d).sort((a, b) => a.startMinute - b.startMinute)
    if (day.length > 3) return "Trois plages par jour au maximum."
    for (let i = 1; i < day.length; i++) if (day[i].startMinute < day[i - 1].endMinute) return "Deux plages d’un même jour se chevauchent."
  }
  return null
}

export function validateException(e: DayException): RuleProblem {
  if (!isDayKey(e.date)) return "Date invalide."
  if (!e.available) return null
  if (e.startMinute == null || e.endMinute == null) return "Indiquez les heures d’ouverture de ce jour."
  return validateWindows([{ weekday: 0, startMinute: e.startMinute, endMinute: e.endMinute }])
}

export const minuteLabel = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
export const parseMinute = (s: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!m) return null
  const v = Number(m[1]) * 60 + Number(m[2])
  return Number(m[1]) <= 24 && Number(m[2]) < 60 && v <= 1440 ? v : null
}
