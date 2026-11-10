"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { Phone, PhoneOff } from "lucide-react"
import { clock, dialString, initialWebphone, webphoneReducer, type CallTarget, type WebphoneState } from "@/features/telephony/webphone-state"

/** Zadarma's WebRTC library, loaded from its servers: the loader adds JsSIP, DetectRTC and the API itself. */
const LOADER = "https://my.zadarma.com/webphoneWebRTCWidget/v9/js/loader-phone-lib.js"

interface ZadarmaApi {
  init(options: Record<string, unknown>): string
  reg(sip: string): void
  /** false when the line was closed, a string when the library is in error, nothing once the call is on its way. */
  call(number: string): unknown
  cancel(): void
  answer(): void
  micSwitch(state: "on" | "off"): void
  hold(): void
  unhold(): void
  sendDTMF(digit: string): void
}
declare global {
  interface Window {
    ZadarmaWebphoneAPI?: new () => ZadarmaApi
    DetectRTC?: unknown
    JsSIP?: unknown
  }
}

export interface Webphone extends WebphoneState {
  /** Starts a call; false when it could not (no line, microphone refused, a call already going). */
  dial(target: CallTarget): Promise<boolean>
  hangup(): void
  answer(): void
  toggleMute(): void
  toggleHold(): void
  dtmf(digit: string): void
  dismiss(): void
  retry(): void
  /** A fiche showing the call says so, and the floating bar steps aside. */
  dock(on: boolean): void
}

const WebphoneContext = createContext<Webphone | null>(null)

/** The phone in the browser, or null outside the provider (the fiche then falls back to the computer's own phone). */
export const useWebphone = () => useContext(WebphoneContext)

function loadLibrary(): Promise<void> {
  if (window.ZadarmaWebphoneAPI && window.DetectRTC && window.JsSIP) return Promise.resolve()
  if (!document.querySelector(`script[src="${LOADER}"]`)) {
    const s = document.createElement("script")
    s.src = LOADER
    s.async = true
    document.body.appendChild(s)
  }
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const wait = setInterval(() => {
      if (window.ZadarmaWebphoneAPI && window.DetectRTC && window.JsSIP) {
        clearInterval(wait)
        resolve()
      } else if (Date.now() - started > 20_000) {
        clearInterval(wait)
        reject(new Error("timeout"))
      }
    }, 200)
  })
}

/** How long Zadarma has to take a call before the closer is told it did not leave. */
const PLACE_TIMEOUT_MS = 15_000
const NOT_PLACED = "L’appel n’est pas parti : Zadarma ne répond pas. Vérifie ta connexion, puis réessaie."

const KEY_REFUSED = "Zadarma refuse la clé du téléphone web : vérifie que cleads.fr est autorisé dans l’intégration WebRTC de Zadarma."

type Session = { ready: boolean; key?: string; sip?: string; message?: string }
type Line = { key: string; sip: string }

async function fetchSession(fresh: boolean): Promise<Session | null> {
  const res = await fetch(`/api/telephony/webphone${fresh ? "?fresh=1" : ""}`, { cache: "no-store" }).catch(() => null)
  return res ? ((await res.json().catch(() => null)) as Session | null) : null
}

/**
 * Whether Zadarma still knows the key for this extension: the question its library asks before every call, then fails in
 * silence when the answer is no. Zadarma's refusal in its own words, or null (also when it cannot be asked: the call
 * then goes ahead as before).
 */
function keyRefusal({ key, sip }: Line): Promise<string | null> {
  return new Promise((resolve) => {
    const callback = `__cleadsZadarma${Math.random().toString(36).slice(2)}`
    const script = document.createElement("script")
    const done = (refusal: string | null) => {
      clearTimeout(timer)
      delete (window as unknown as Record<string, unknown>)[callback]
      script.remove()
      resolve(refusal)
    }
    const timer = setTimeout(() => done(null), 8_000)
    ;(window as unknown as Record<string, unknown>)[callback] = (data: { domain?: string; error?: { content?: string } } | null) =>
      done(data?.domain ? null : data?.error?.content || "Le widget avec la clé et le numéro SIP n’est pas trouvé.")
    script.onerror = () => done(null)
    script.src = `https://api.zadarma.com/sys/webrtc/get_webphone_data.php?integrationType=site&key=${encodeURIComponent(key)}&sipId=${encodeURIComponent(sip)}&language=fr&jsonpCallback=${callback}`
    document.body.appendChild(script)
  })
}

/**
 * A key Zadarma accepts for the member's extension: the one the page has, or a fresh one from the server when Zadarma
 * dropped it (a newer key, a change to the WebRTC integration). The reason for the closer when there is none.
 */
async function workingLine(line: Line | null): Promise<{ line: Line; renewed: boolean } | { message: string }> {
  if (line && !(await keyRefusal(line))) return { line, renewed: false }
  const session = await fetchSession(!!line)
  if (!session?.ready || !session.key || !session.sip) return { message: session?.message ?? "Le téléphone web ne répond pas : l’appel passe par ton téléphone." }
  const fresh = { key: session.key, sip: session.sip }
  const refusal = await keyRefusal(fresh)
  if (!refusal) return { line: fresh, renewed: true }
  console.warn("[Cleads téléphone] clé refusée par Zadarma :", refusal)
  return { message: KEY_REFUSED }
}

/** Asks for the microphone before dialling, so that a refusal is explained instead of a silent call. */
async function microphone(): Promise<{ ok: true; label: string | null } | { ok: false }> {
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const label = stream.getAudioTracks()[0]?.label || null
    stream.getTracks().forEach((t) => t.stop())
    return { ok: true, label: label?.replace(/^(Par défaut|Default) - /i, "") ?? null }
  } catch {
    return { ok: false }
  }
}

/**
 * Registers the member's Zadarma extension in the browser (E32 lot 2, maquette « Appel dans le navigateur ») and keeps
 * the call alive across pages. Members without an extension, or before the keys are set, get no line and the fiche
 * dials with the computer's own phone, as before. A floating bar shows a call no fiche is showing, and incoming calls.
 */
export function WebphoneProvider({ children }: { children: React.ReactNode }) {
  const [state, send] = useReducer(webphoneReducer, initialWebphone)
  const apiRef = useRef<ZadarmaApi | null>(null)
  const lineRef = useRef<Line | null>(null)
  const [docked, setDocked] = useState(0)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function start() {
      send({ type: "loading" })
      const session = await fetchSession(false)
      if (cancelled) return
      if (!session?.ready || !session.key || !session.sip) return send({ type: "unavailable", message: session?.message ?? "Le téléphone web ne répond pas : l’appel passe par ton téléphone." })
      try {
        await loadLibrary()
      } catch {
        if (!cancelled) send({ type: "unavailable", message: "Le téléphone Zadarma n’a pas pu se charger : vérifie ta connexion, puis recharge la page." })
        return
      }
      if (cancelled || !window.ZadarmaWebphoneAPI) return
      const checked = await workingLine({ key: session.key, sip: session.sip })
      if (cancelled) return
      if (!("line" in checked)) return send({ type: "unavailable", message: checked.message })
      const api = apiRef.current ?? new window.ZadarmaWebphoneAPI()
      apiRef.current = api
      if (open(api, checked.line) === "BROWSER_NOT_SUPPORTED") return
      send({ type: "registered" })
    }
    start()
    return () => {
      cancelled = true
    }
  }, [attempt])

  /** Opens the line with this key; again with a fresh key when Zadarma dropped the old one. */
  function open(api: ZadarmaApi, line: Line) {
    lineRef.current = line
    const result = api.init({
      type: "site",
      key: line.key,
      sip: line.sip,
      language: "fr",
      getStatusMessage: (message: string, params?: { caller?: string; callername?: string }) => {
        // Kept in the console: what the library said is the first thing to read when a closer reports a call problem.
        // eslint-disable-next-line no-console
        console.info("[Cleads téléphone]", message, params ?? "")
        send({ type: "status", message, params, at: Date.now() })
      },
      getSipsCallback: () => {},
      callbackGetPrice: () => {},
      callbackEndCall: () => send({ type: "end", at: Date.now() }),
    })
    if (result !== "BROWSER_NOT_SUPPORTED") api.reg(line.sip)
    return result
  }

  const dial = useCallback(
    async (target: CallTarget) => {
      const api = apiRef.current
      if (!api || state.phase !== "ready") return false
      const mic = await microphone()
      if (!mic.ok) {
        send({ type: "mic_blocked" })
        return false
      }
      send({ type: "device", label: mic.label })
      send({ type: "dial", target })
      // Zadarma can drop the page's key at any time; its library would then never place the call, and say nothing.
      const checked = await workingLine(lineRef.current)
      if (!("line" in checked)) {
        send({ type: "failed", message: checked.message })
        return false
      }
      if (checked.renewed) open(api, checked.line)
      const number = dialString(target.number)
      // eslint-disable-next-line no-console
      console.info("[Cleads téléphone] appel", number)
      const result = api.call(number)
      if (result === false || typeof result === "string") {
        send({ type: "failed", message: NOT_PLACED })
        return false
      }
      return true
    },
    [state.phase]
  )

  // A call Zadarma never takes would otherwise say « Connexion… » forever.
  const waiting = state.phase === "ringing" && !state.placed
  useEffect(() => {
    if (!waiting) return
    const timer = setTimeout(() => {
      apiRef.current?.cancel()
      send({ type: "failed", message: NOT_PLACED })
    }, PLACE_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [waiting])

  const value = useMemo<Webphone>(
    () => ({
      ...state,
      dial,
      hangup: () => {
        apiRef.current?.cancel()
        send({ type: "end", at: Date.now() })
      },
      answer: () => apiRef.current?.answer(),
      toggleMute: () => {
        apiRef.current?.micSwitch(state.muted ? "on" : "off")
        send({ type: "mute", on: !state.muted })
      },
      toggleHold: () => {
        if (state.held) apiRef.current?.unhold()
        else apiRef.current?.hold()
        send({ type: "hold", on: !state.held })
      },
      dtmf: (digit: string) => apiRef.current?.sendDTMF(digit),
      dismiss: () => send({ type: "dismiss" }),
      retry: () => setAttempt((n) => n + 1),
      dock: (on: boolean) => setDocked((n) => Math.max(0, n + (on ? 1 : -1))),
    }),
    [state, dial]
  )

  return (
    <WebphoneContext.Provider value={value}>
      {children}
      {(state.phase === "incoming" || ((state.phase === "ringing" || state.phase === "live") && docked === 0)) && <FloatingCall phone={value} />}
    </WebphoneContext.Provider>
  )
}

/** The call when no fiche shows it: who, how long, and the buttons that matter. */
function FloatingCall({ phone }: { phone: Webphone }) {
  const elapsed = useElapsed(phone.since)
  const incoming = phone.phase === "incoming"
  return (
    <div role="region" aria-label={incoming ? "Appel entrant" : "Appel en cours"} className="fixed bottom-5 left-1/2 z-[60] flex w-[min(520px,calc(100%-32px))] -translate-x-1/2 items-center gap-3 rounded-2xl bg-sidebar p-3 pl-4 text-sidebar-foreground shadow-2xl">
      <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Phone className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1" aria-live="polite">
        <span className="block truncate text-sm font-bold text-white">{phone.call?.name}</span>
        <span className="block text-xs text-sidebar-foreground/75">{incoming ? "Appel entrant" : phone.phase === "ringing" ? (phone.placed ? "Ça sonne…" : "Connexion…") : <span className="tabular-nums">En ligne · {clock(elapsed)}</span>}</span>
      </span>
      {incoming && (
        <button onClick={phone.answer} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">Décrocher</button>
      )}
      <button onClick={phone.hangup} aria-label={incoming ? "Refuser l’appel" : "Raccrocher"} className="grid h-11 min-w-11 place-items-center rounded-xl bg-destructive px-3 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
        <PhoneOff className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}

/** Seconds since `since`, ticking every second while set. */
export function useElapsed(since: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (since == null) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [since])
  return since == null ? 0 : Math.max(0, Math.floor((now - since) / 1000))
}
