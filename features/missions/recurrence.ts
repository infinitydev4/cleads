import type { Recurrence } from "./schemas"

/**
 * When a recurring mission comes back (E28, D35): every day or on some days of the week, at a time of Paris. Hours run
 * from 6 to 21, so a time never falls inside a change of time (they happen around 2 or 3 at night). Shared by the
 * server and the panel.
 */
const TZ = "Europe/Paris"
const DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]

const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" })
const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

/** Paris's wall clock at an instant. */
function paris(at: Date) {
  const p = Object.fromEntries(parts.formatToParts(at).map((x) => [x.type, x.value]))
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), hour: Number(p.hour), minute: Number(p.minute), second: Number(p.second), weekday: WEEKDAYS[p.weekday] }
}

/** Minutes Paris is ahead of UTC at an instant. */
function offsetAt(at: Date): number {
  const p = paris(at)
  return Math.round((Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute, p.second) - Math.floor(at.getTime() / 1000) * 1000) / 60_000)
}

/** The instant of a Paris date and time. */
export function parisTime(y: number, m: number, d: number, hour: number, minute: number): Date {
  const wall = Date.UTC(y, m - 1, d, hour, minute)
  const first = new Date(wall - offsetAt(new Date(wall)) * 60_000)
  return new Date(wall - offsetAt(first) * 60_000)
}

/** The next time strictly after `after`. */
export function nextOccurrence(r: Recurrence, after: Date): Date {
  const days = r.frequency === "weekly" ? new Set(r.days?.length ? r.days : [1]) : null
  const today = paris(after)
  for (let i = 0; i < 9; i++) {
    const day = new Date(Date.UTC(today.y, today.m - 1, today.d + i, 12))
    const weekday = ((day.getUTCDay() + 6) % 7) + 1
    if (days && !days.has(weekday)) continue
    const at = parisTime(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), r.hour, r.minute ?? 0)
    if (at > after) return at
  }
  throw new Error("Récurrence sans jour")
}

const time = (r: Recurrence) => `${r.hour} h${r.minute ? ` ${String(r.minute).padStart(2, "0")}` : ""}`

function list(words: string[]): string {
  return words.length > 1 ? `${words.slice(0, -1).join(", ")} et ${words.at(-1)}` : (words[0] ?? "")
}

/** « Chaque jour à 8 h », « Chaque lundi et jeudi à 9 h 30 », « Du lundi au vendredi à 8 h ». */
export function describeRecurrence(r: Recurrence): string {
  if (r.frequency === "daily") return `Chaque jour à ${time(r)}`
  const days = [...new Set(r.days?.length ? r.days : [1])].sort((a, b) => a - b)
  if (days.length === 7) return `Chaque jour à ${time(r)}`
  if (days.join() === "1,2,3,4,5") return `Du lundi au vendredi à ${time(r)}`
  return `Chaque ${list(days.map((d) => DAYS[d - 1]))} à ${time(r)}`
}

const moment = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: TZ })
export const formatParis = (at: Date | string) => moment.format(typeof at === "string" ? new Date(at) : at)
