/** Days in the team's timezone. Tasks are due on a day, not at a time: "overdue" means before today began in Paris. */
export const TEAM_TZ = "Europe/Paris"

const parts = (d: Date) =>
  Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TEAM_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(d).map((p) => [p.type, Number(p.value)])) as Record<string, number>

/** Calendar date ("2026-03-29") of an instant, in Paris. */
export function dayKey(d: Date): string {
  const p = parts(d)
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`
}

/** The instant a Paris calendar day begins (midnight local), correct across the changes to and from summer time. */
export function startOfDay(key: string): Date {
  const [y, m, d] = key.split("-").map(Number)
  const guess = Date.UTC(y, m - 1, d)
  // Paris is UTC+1 or +2: try both offsets and keep the one that lands on local midnight.
  for (const offset of [2, 1, 0]) {
    const t = new Date(guess - offset * 3600_000)
    const p = parts(t)
    if (p.year === y && p.month === m && p.day === d && p.hour === 0 && p.minute === 0) return t
  }
  return new Date(guess - 3600_000)
}

/** Calendar day shifted by `days` (can cross months and years). */
export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Day of week of a calendar day, 0 = Sunday. */
export const weekday = (key: string) => new Date(`${key}T12:00:00Z`).getUTCDay()

export interface DayBounds {
  today: string
  start: Date
  end: Date
}

export function dayBounds(now = new Date()): DayBounds {
  const today = dayKey(now)
  return { today, start: startOfDay(today), end: startOfDay(addDays(today, 1)) }
}

export const isDayKey = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().startsWith(s)

/** Quick postponements offered in the file: tomorrow, in three days, next Monday, in a week. */
export function snoozeTargets(today: string): { id: "tomorrow" | "three_days" | "monday" | "week"; label: string; day: string }[] {
  const untilMonday = ((8 - weekday(today)) % 7) || 7
  return [
    { id: "tomorrow", label: "Demain", day: addDays(today, 1) },
    { id: "three_days", label: "Dans 3 jours", day: addDays(today, 3) },
    { id: "monday", label: "Lundi prochain", day: addDays(today, untilMonday) },
    { id: "week", label: "Dans une semaine", day: addDays(today, 7) },
  ]
}
