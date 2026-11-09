/**
 * The phone in the browser (E32 lot 2), as a pure state machine: what Zadarma's WebRTC library reports
 * (getStatusMessage) and what the closer does move it from one phase to the next. The provider
 * (components/crm/webphone) only runs it, so the rules are tested without a browser.
 */
export type WebphonePhase = "off" | "loading" | "ready" | "ringing" | "live" | "incoming"

export interface CallTarget {
  leadId: string | null
  name: string
  /** Canonical number (+33…). */
  number: string
}

export interface EndedCall extends CallTarget {
  answered: boolean
  durationSec: number
  endedAt: number
}

export interface WebphoneState {
  phase: WebphonePhase
  /** Why the phone cannot be used, in words for the closer. */
  unavailable: string | null
  micBlocked: boolean
  /** The microphone the browser will use, as it names it ("Jabra Evolve2 30"). */
  device: string | null
  muted: boolean
  held: boolean
  call: CallTarget | null
  /** When the other side picked up (ms). */
  since: number | null
  ended: EndedCall | null
}

export const initialWebphone: WebphoneState = { phase: "off", unavailable: null, micBlocked: false, device: null, muted: false, held: false, call: null, since: null, ended: null }

export type WebphoneEvent =
  | { type: "loading" }
  | { type: "unavailable"; message: string }
  | { type: "registered" }
  | { type: "device"; label: string | null }
  | { type: "mic_blocked" }
  | { type: "dial"; target: CallTarget }
  /** A status message from Zadarma's library, with its parameters. */
  | { type: "status"; message: string; params?: { caller?: string; callername?: string }; at: number }
  /** The library's end-of-call callback, or the closer hanging up. */
  | { type: "end"; at: number }
  | { type: "mute"; on: boolean }
  | { type: "hold"; on: boolean }
  | { type: "dismiss" }

/** How the library spells the end of a call. */
const ENDINGS = ["canceled", "rejected", "busy"]

function finish(s: WebphoneState, at: number): WebphoneState {
  if (s.phase === "incoming" && !s.since) return { ...s, phase: "ready", call: null }
  if (!s.call || (s.phase !== "ringing" && s.phase !== "live")) return s
  const answered = s.phase === "live" && s.since != null
  return { ...s, phase: "ready", muted: false, held: false, since: null, call: null, ended: { ...s.call, answered, durationSec: answered ? Math.max(0, Math.round((at - (s.since ?? at)) / 1000)) : 0, endedAt: at } }
}

export function webphoneReducer(s: WebphoneState, e: WebphoneEvent): WebphoneState {
  switch (e.type) {
    case "loading":
      return { ...s, phase: "loading", unavailable: null }
    case "unavailable":
      return { ...initialWebphone, unavailable: e.message }
    case "registered":
      return s.phase === "loading" || s.phase === "off" ? { ...s, phase: "ready" } : s
    case "device":
      return { ...s, device: e.label }
    case "mic_blocked":
      return { ...s, micBlocked: true, phase: s.phase === "ringing" ? "ready" : s.phase, call: s.phase === "ringing" ? null : s.call }
    case "dial":
      if (s.phase !== "ready") return s
      return { ...s, phase: "ringing", micBlocked: false, call: e.target, since: null, ended: null, muted: false, held: false }
    case "mute":
      return s.phase === "live" ? { ...s, muted: e.on } : s
    case "hold":
      return s.phase === "live" ? { ...s, held: e.on } : s
    case "dismiss":
      return { ...s, ended: null }
    case "end":
      return finish(s, e.at)
    case "status": {
      const m = e.message
      if (m === "BROWSER_NOT_SUPPORTED") return { ...initialWebphone, unavailable: "Ce navigateur ne permet pas d’appeler : utilise Chrome, Edge ou Firefox à jour." }
      if (m === "noMicrophone") return webphoneReducer(s, { type: "mic_blocked" })
      if (m === "registered") return webphoneReducer(s, { type: "registered" })
      if (m === "confirmed" || m === "accepted") return s.phase === "ringing" || s.phase === "incoming" ? { ...s, phase: "live", since: s.since ?? e.at } : s
      if (m === "hold" || m === "unhold") return webphoneReducer(s, { type: "hold", on: m === "hold" })
      if (m === "incoming") {
        if (s.phase !== "ready") return s
        const number = e.params?.caller ?? ""
        return { ...s, phase: "incoming", call: { leadId: null, name: e.params?.callername || number || "Numéro masqué", number }, since: null, ended: null }
      }
      if (ENDINGS.includes(m)) return finish(s, e.at)
      return s
    }
  }
}

/** Zadarma dials international numbers without the plus: "+33240…" becomes "33240…". */
export const dialString = (number: string) => number.replace(/[^\d+*#]/g, "").replace(/^\+/, "")

/** "02:41", or "1:02:41" past an hour. */
export function clock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const hh = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0")
  const ss = String(s % 60).padStart(2, "0")
  return hh ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`
}

/** "4 min 12", "48 s", "1 h 07". */
export function spoken(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  if (s < 60) return `${s} s`
  if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")}`
  return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`
}
