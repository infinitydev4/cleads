import { addDays, dayKey, startOfDay, weekday } from "@/lib/crm/day"

// Pure: when a sequence step may leave, and when a mailbox must stop sending.

// ── Send window ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Prospecting mail goes out on weekdays, during office hours in Paris: a message at 3 a.m. looks automated. */
export const WINDOW = { openMinute: 9 * 60, closeMinute: 17 * 60 + 30 } as const
export const MAX_STEPS = 4
export const MAX_DELAY_DAYS = 30

export const isBusinessDay = (key: string) => {
  const d = weekday(key)
  return d >= 1 && d <= 5
}

const minuteOfDay = (d: Date) => Math.floor((d.getTime() - startOfDay(dayKey(d)).getTime()) / 60_000)

export function inSendWindow(now: Date): boolean {
  if (!isBusinessDay(dayKey(now))) return false
  const m = minuteOfDay(now)
  return m >= WINDOW.openMinute && m < WINDOW.closeMinute
}

/** First business day on or after `key`. */
function businessDayFrom(key: string): string {
  let k = key
  while (!isBusinessDay(k)) k = addDays(k, 1)
  return k
}

const at = (key: string, minute: number) => new Date(startOfDay(key).getTime() + minute * 60_000)

/** The moment the window next opens (now, when it is open). */
export function nextWindowStart(now: Date): Date {
  const today = dayKey(now)
  if (isBusinessDay(today)) {
    const m = minuteOfDay(now)
    if (m < WINDOW.openMinute) return at(today, WINDOW.openMinute)
    if (m < WINDOW.closeMinute) return now
  }
  return at(businessDayFrom(addDays(today, 1)), WINDOW.openMinute)
}

/**
 * When a step becomes due. Step 1 (`delayDays` 0) goes out a few minutes after enrollment, or when the window next
 * opens plus up to an hour. Later steps land on a random minute of the window, `delayDays` days on (a weekend rolls
 * to Monday). The randomness spreads the day's messages instead of sending them in a burst at the same second.
 */
export function scheduleAt(from: Date, delayDays: number, rng: () => number = Math.random): Date {
  if (delayDays <= 0) {
    const soon = new Date(from.getTime() + (5 + Math.floor(rng() * 40)) * 60_000)
    if (inSendWindow(soon)) return soon
    return new Date(nextWindowStart(soon).getTime() + Math.floor(rng() * 60) * 60_000)
  }
  const day = businessDayFrom(addDays(dayKey(from), delayDays))
  return at(day, WINDOW.openMinute + Math.floor(rng() * (WINDOW.closeMinute - WINDOW.openMinute)))
}

// ── Mailbox health ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Thresholds, measured over the last `windowDays` days on real prospect messages (tests excluded).
 * Gmail and Yahoo tolerate far fewer spam complaints than this (0.3 %); an opt-out is milder than a complaint but
 * moves the same way, so it is the signal we can attribute to a mailbox. Below `minSample` messages a rate says nothing.
 */
export const HEALTH = {
  windowDays: 7,
  minSample: 20,
  bounceWarn: 0.02,
  bouncePause: 0.05,
  optOutWarn: 0.03,
  optOutPause: 0.08,
} as const

export type HealthLevel = "few" | "ok" | "warn" | "pause"

export interface HealthCounts {
  /** Prospect messages that left the mailbox (sent or bounced). */
  sent: number
  /** Permanent bounces among them. */
  bounced: number
  /** Unsubscribe-link clicks and "ne plus écrire" replies. */
  optOuts: number
}

export interface Health extends HealthCounts {
  level: HealthLevel
  bounceRate: number
  optOutRate: number
  /** Why the level is warn or pause, in a sentence a person can act on. */
  reason: string | null
}

const pct = (r: number) => `${(r * 100).toFixed(1).replace(".", ",")} %`

export function mailboxHealth(c: HealthCounts): Health {
  const bounceRate = c.sent ? c.bounced / c.sent : 0
  const optOutRate = c.sent ? c.optOuts / c.sent : 0
  const base = { ...c, bounceRate, optOutRate }
  if (c.sent < HEALTH.minSample) return { ...base, level: "few", reason: null }
  const window = `sur ${c.sent} messages en ${HEALTH.windowDays} jours`
  if (bounceRate >= HEALTH.bouncePause) return { ...base, level: "pause", reason: `${pct(bounceRate)} de rebonds ${window} (seuil ${pct(HEALTH.bouncePause)}) : vérifiez la qualité des adresses.` }
  if (optOutRate >= HEALTH.optOutPause) return { ...base, level: "pause", reason: `${pct(optOutRate)} de désinscriptions ${window} (seuil ${pct(HEALTH.optOutPause)}) : revoyez le ciblage et le texte.` }
  if (bounceRate >= HEALTH.bounceWarn) return { ...base, level: "warn", reason: `${pct(bounceRate)} de rebonds ${window} : proche du seuil de pause (${pct(HEALTH.bouncePause)}).` }
  if (optOutRate >= HEALTH.optOutWarn) return { ...base, level: "warn", reason: `${pct(optOutRate)} de désinscriptions ${window} : proche du seuil de pause (${pct(HEALTH.optOutPause)}).` }
  return { ...base, level: "ok", reason: null }
}

// ── Why an enrollment stopped ───────────────────────────────────────────────────────────────────────────────────

export const STOP_LABELS = {
  REPLIED: "a répondu",
  BOUNCED: "adresse en rebond définitif",
  UNSUBSCRIBED: "s’est désinscrit",
  COMPLAINED: "a signalé un spam",
  SUPPRESSED: "adresse dans la liste d’exclusion",
  DO_NOT_CONTACT: "marqué « ne pas contacter »",
  LEAD_CLOSED: "fiche qualifiée ou disqualifiée",
  MISSING_DATA: "adresse ou information manquante",
  SEND_FAILED: "envoi impossible",
  MANUAL: "arrêtée à la main",
} as const

export type StopReasonKey = keyof typeof STOP_LABELS
