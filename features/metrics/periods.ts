import { addDays, dayKey, isDayKey, startOfDay, weekday } from "@/lib/crm/day"

/**
 * The periods of the reports (E10, D55): calendar weeks (Monday to Sunday) and months, in Paris time, so that a month's
 * statement reads as is. The 3D view and the campaigns keep their rolling 7, 30 or 90 days (definitions.ts).
 */
export type PeriodKind = "semaine" | "mois"

export interface ReportPeriod {
  kind: PeriodKind
  /** Monday of the week ("2026-11-02") or the month ("2026-11"). */
  key: string
  /** Paris midnight at the start, inclusive. */
  from: Date
  /** Paris midnight after the end, exclusive. */
  to: Date
  label: string
}

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/

const split = (day: string) => day.split("-").map(Number) as [number, number, number]
const dayLabel = (day: string) => {
  const [, m, d] = split(day)
  return `${d === 1 ? "1er" : d} ${MONTHS[m - 1]}`
}

/** Monday of the week a day belongs to. */
export const mondayOf = (day: string) => addDays(day, -((weekday(day) + 6) % 7))

export function weekPeriod(monday: string): ReportPeriod {
  const sunday = addDays(monday, 6)
  const [y1, m1, d1] = split(monday)
  const [y2, m2] = split(sunday)
  // "du 2 au 8 novembre 2026", "du 26 octobre au 1er novembre 2026", "du 29 décembre 2025 au 4 janvier 2026".
  const start = y1 !== y2 ? `${dayLabel(monday)} ${y1}` : m1 !== m2 ? dayLabel(monday) : d1 === 1 ? "1er" : String(d1)
  return { kind: "semaine", key: monday, from: startOfDay(monday), to: startOfDay(addDays(monday, 7)), label: `Semaine du ${start} au ${dayLabel(sunday)} ${y2}` }
}

export function monthPeriod(key: string): ReportPeriod {
  const [y, m] = key.split("-").map(Number)
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`
  const label = `${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)} ${y}`
  return { kind: "mois", key, from: startOfDay(`${key}-01`), to: startOfDay(`${next}-01`), label }
}

export function currentPeriod(kind: PeriodKind, now = new Date()): ReportPeriod {
  const today = dayKey(now)
  return kind === "semaine" ? weekPeriod(mondayOf(today)) : monthPeriod(today.slice(0, 7))
}

/** The period just before (-1) or after (+1). */
export function shiftPeriod(p: ReportPeriod, by: -1 | 1): ReportPeriod {
  if (p.kind === "semaine") return weekPeriod(addDays(p.key, 7 * by))
  const [y, m] = p.key.split("-").map(Number)
  const index = y * 12 + (m - 1) + by
  return monthPeriod(`${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`)
}

/** A period that has not begun yet has nothing to show. */
export const isFuture = (p: ReportPeriod, now = new Date()) => p.from.getTime() > now.getTime()

/**
 * Reads `?periode=semaine|mois&du=…` from the address. Anything unreadable, or a period still to come, gives the current
 * month; a day inside a week stands for its week.
 */
export function parseReportPeriod(params: { periode?: string | null; du?: string | null }, now = new Date()): ReportPeriod {
  const kind: PeriodKind = params.periode === "semaine" ? "semaine" : "mois"
  const du = params.du ?? ""
  let period: ReportPeriod | null = null
  if (kind === "semaine" && isDayKey(du)) period = weekPeriod(mondayOf(du))
  if (kind === "mois" && MONTH_KEY.test(du)) period = monthPeriod(du)
  if (!period || isFuture(period, now)) return currentPeriod(kind, now)
  return period
}

export const periodQuery = (p: ReportPeriod) => `periode=${p.kind}&du=${p.key}`
