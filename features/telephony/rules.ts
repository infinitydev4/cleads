import type { CallOutcome } from "@/features/activity/rules"
import { TEAM_TZ } from "@/lib/crm/day"
import { zonedToUtc } from "@/features/meetings/slots"

/** What a call reported by the PBX means on the fiche (E32). */
export interface ReportedCall {
  /** pbx_call_id. */
  externalId: string
  direction: "OUTBOUND" | "INBOUND"
  /** The member's PBX extension that placed or answered it; null for a missed incoming call. */
  extension: string | null
  /** The other party, as the PBX wrote it. */
  number: string
  startedAt: Date
  durationSec: number
  disposition: string
  recordingId: string | null
}

/**
 * The outcome the PBX already knows. A call nobody picked up is « Pas de réponse »; a number that does not exist is a
 * wrong number. A picked-up call has none: only the person knows whether it was the right person or a voicemail.
 */
export function outcomeOf(disposition: string): CallOutcome | null {
  switch (disposition.trim().toLowerCase()) {
    case "busy":
    case "cancel":
    case "no answer":
      return "no_answer"
    case "unallocated number":
      return "wrong_number"
    default:
      return null
  }
}

/** Whether the call was really placed. Failures on our side (credit, limits, network) are kept, but not shown on the fiche. */
export function reachedTheLine(disposition: string): boolean {
  return ["answered", "busy", "cancel", "no answer", "unallocated number"].includes(disposition.trim().toLowerCase())
}

export const answered = (disposition: string) => disposition.trim().toLowerCase() === "answered"

/**
 * Zadarma writes times as "YYYY-MM-DD HH:MM:SS" in the account's time zone, without saying which: ZADARMA_TIMEZONE when
 * the account is not set to Paris. Null when the text is not a time.
 */
export function pbxTime(text: string | null | undefined, tz = process.env.ZADARMA_TIMEZONE || TEAM_TZ): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec((text ?? "").trim())
  if (!m) return null
  const at = zonedToUtc(m[1], Number(m[2]) * 60 + Number(m[3]), tz)
  return at ? new Date(at.getTime() + Number(m[4] ?? 0) * 1000) : null
}

/** The other way round, for the statistics' bounds. */
export function pbxTimeText(d: Date, tz = process.env.ZADARMA_TIMEZONE || TEAM_TZ): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(d)
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "00"
  return `${v("year")}-${v("month")}-${v("day")} ${v("hour")}:${v("minute")}:${v("second")}`
}

/** A member's extension: digits only, as the PBX numbers them (100, 101…). */
export const EXTENSION_RE = /^\d{2,6}$/
