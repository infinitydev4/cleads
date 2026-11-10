"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Grid3x3, Headphones, Mic, MicOff, Pause, Phone, PhoneOff, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useElapsed, useWebphone } from "@/components/crm/webphone/webphone-provider"
import { addDays, dayKey } from "@/lib/crm/day"
import { formatPhone } from "@/lib/crm/normalize"
import { cn } from "@/lib/utils"
import { CALL_OUTCOMES, type CallOutcome } from "@/features/activity/rules"
import type { LeadDetail } from "@/features/leads/types"
import { clock, spoken } from "@/features/telephony/webphone-state"
import { api } from "./leads/api"

const initials = (name: string) => name.replace(/\(.*?\)/g, "").split(/[\s·—-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?"

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"]
const FOLLOW_UPS = [
  { id: "1", label: "Demain", days: 1 },
  { id: "3", label: "Dans 3 jours", days: 3 },
] as const

/**
 * The call on the fiche (E32 lot 2, maquette « Appel dans le navigateur »): the phone in the browser when the member has
 * a line, the computer's own phone otherwise; then what came of it, in one place, whichever phone was used.
 */
export function CallPanel({ lead, name, phone, contactName, autoCall, onSaved }: {
  lead: LeadDetail
  name: string
  phone: string
  contactName: string | null
  autoCall?: boolean
  onSaved: (lead: LeadDetail) => void
}) {
  const web = useWebphone()
  const [manual, setManual] = useState(false)
  const target = { leadId: lead.id, name: contactName ? `${contactName} · ${name}` : name, number: phone }
  const ours = web?.call?.leadId === lead.id
  const live = web && ours && (web.phase === "ringing" || web.phase === "live")
  const ended = web?.ended?.leadId === lead.id ? web.ended : null
  const line = web && (web.phase === "ready" || web.phase === "ringing" || web.phase === "live" || web.phase === "incoming")
  const busyElsewhere = web && !ours && (web.phase === "ringing" || web.phase === "live" || web.phase === "incoming")
  const started = useRef(false)

  useEffect(() => {
    if (autoCall && !started.current && web?.phase === "ready") {
      started.current = true
      web.dial(target)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCall, web?.phase])

  if (ended || manual) {
    return <AfterCall lead={lead} ended={ended} onDone={(updated) => { setManual(false); web?.dismiss(); if (updated) onSaved(updated) }} />
  }
  if (live) return <LiveCall />

  if (web?.micBlocked && line) {
    return (
      <section role="alert" className="space-y-3 rounded-2xl border border-warning/30 bg-warning-subtle p-5">
        <p className="text-base font-extrabold text-warning">Cleads n’a pas accès à ton micro</p>
        <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-foreground/85">
          <li>Clique sur le cadenas à gauche de l’adresse cleads.fr.</li>
          <li>Mets « Microphone » sur « Autoriser ».</li>
          <li>Vérifie que ton casque est choisi comme micro, puis réessaie.</li>
        </ol>
        <div className="flex flex-wrap gap-2.5">
          <Button className="min-h-12 rounded-xl bg-sidebar px-5 font-extrabold text-sidebar-foreground hover:bg-sidebar/90" onClick={() => web.dial(target)}>Réessayer</Button>
          <Button asChild variant="outline" className="min-h-12 rounded-xl px-5 font-bold"><a href={`tel:${phone}`} onClick={() => setManual(true)}>Appeler avec mon téléphone</a></Button>
        </div>
      </section>
    )
  }

  if (line) {
    return (
      <div className="space-y-2.5">
        {web.failure?.leadId === lead.id && <p role="alert" className="rounded-xl border border-warning/30 bg-warning-subtle px-3 py-2.5 text-sm font-semibold text-warning">{web.failure.message}</p>}
        <button
          onClick={() => web.dial(target)}
          disabled={!!busyElsewhere}
          className="flex min-h-[54px] w-full items-center justify-center gap-2.5 whitespace-nowrap rounded-2xl bg-primary px-5 text-base font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          <Phone className="h-5 w-5" aria-hidden="true" /> {busyElsewhere ? `Appel en cours avec ${web.call?.name}` : `Appeler ${formatPhone(phone)}`}
        </button>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><Headphones className="h-4 w-4 text-success" aria-hidden="true" /><span className="font-semibold text-foreground">{web.device ?? "Casque ou micro de l’ordinateur"}</span></span>
          <span>Appel depuis le navigateur</span>
        </p>
      </div>
    )
  }

  // No line in the browser (no extension, keys not set, still loading): the computer's own phone, as before.
  return (
    <div className="space-y-2">
      <a href={`tel:${phone}`} onClick={() => setManual(true)} className="flex min-h-[52px] w-full items-center justify-center gap-2.5 whitespace-nowrap rounded-2xl bg-primary px-5 text-base font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Phone className="h-5 w-5" aria-hidden="true" /> Appeler {formatPhone(phone)}
      </a>
      {web?.unavailable && <p className="text-[13px] text-muted-foreground">{web.unavailable}</p>}
    </div>
  )
}

/** The call while it rings and once picked up: timer, recording notice, microphone, hold, keypad, hang up. */
function LiveCall() {
  const web = useWebphone()!
  const elapsed = useElapsed(web.since)
  const [keys, setKeys] = useState(false)
  const [typed, setTyped] = useState("")
  const ringing = web.phase === "ringing"

  useEffect(() => {
    web.dock(true)
    return () => web.dock(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const control = (on: boolean) => cn("flex min-h-[52px] items-center justify-center gap-2 rounded-xl border px-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", on ? "border-transparent bg-primary text-primary-foreground" : "border-white/15 bg-white/5 text-white hover:bg-white/10")

  return (
    <section aria-label="Appel en cours" className="space-y-4 rounded-2xl bg-sidebar p-5 text-sidebar-foreground">
      <div className="flex flex-wrap items-center gap-4">
        <span aria-hidden="true" className={cn("grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full font-extrabold", ringing ? "animate-pulse bg-primary text-primary-foreground" : "bg-white/10 text-primary")}>{initials(web.call?.name ?? "?")}</span>
        <span className="min-w-0 flex-1" aria-live="polite">
          <span className="block truncate text-[17px] font-bold text-white">{web.call?.name}</span>
          <span className="block text-sm text-sidebar-foreground/80">{ringing ? `${web.placed ? "Ça sonne…" : "Connexion…"} ${formatPhone(web.call?.number)}` : <>En ligne · <span role="timer" className="font-bold tabular-nums text-white">{clock(elapsed)}</span></>}</span>
        </span>
        {ringing && <Button onClick={web.hangup} className="min-h-[52px] rounded-full bg-destructive px-6 font-extrabold text-white hover:bg-destructive/90">Raccrocher</Button>}
      </div>
      {!ringing && (
        <>
          <p className="rounded-xl bg-white/5 px-3 py-2.5 text-[13px] leading-relaxed text-sidebar-foreground/85">Si tes appels sont enregistrés, dis-le au début : « Je vous précise que cet appel est enregistré pour la qualité de notre service. »</p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <button onClick={web.toggleMute} aria-pressed={web.muted} className={control(web.muted)}>{web.muted ? <MicOff className="h-4 w-4" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}{web.muted ? "Micro coupé" : "Couper le micro"}</button>
            <button onClick={web.toggleHold} aria-pressed={web.held} className={control(web.held)}>{web.held ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}{web.held ? "Reprendre" : "En attente"}</button>
            <button onClick={() => setKeys(!keys)} aria-expanded={keys} className={control(keys)}><Grid3x3 className="h-4 w-4" aria-hidden="true" />Clavier</button>
            <button onClick={web.hangup} className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-destructive text-sm font-extrabold text-white hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><PhoneOff className="h-4 w-4" aria-hidden="true" />Raccrocher</button>
          </div>
          {keys && (
            <div className="space-y-2">
              <div role="group" aria-label="Clavier" className="mx-auto grid w-fit grid-cols-3 gap-2">
                {KEYS.map((k) => (
                  <button key={k} onClick={() => { web.dtmf(k); setTyped((t) => (t + k).slice(-12)) }} className="h-12 w-16 rounded-xl bg-white/10 text-lg font-bold text-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{k}</button>
                ))}
              </div>
              <p className="text-center text-[13px] tabular-nums text-sidebar-foreground/70">{typed || "Tape un chiffre pour un serveur vocal"}</p>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/** What came of the call: its outcome, a note, a follow-up, then the next prospect. */
function AfterCall({ lead, ended, onDone }: { lead: LeadDetail; ended: { answered: boolean; durationSec: number } | null; onDone: (lead?: LeadDetail) => void }) {
  const [outcome, setOutcome] = useState<CallOutcome | null>(ended && !ended.answered ? "no_answer" : null)
  const [note, setNote] = useState("")
  const [follow, setFollow] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!outcome) return toast.error("Choisis comment s’est passé l’appel.")
    setBusy(true)
    try {
      const days = FOLLOW_UPS.find((f) => f.id === follow)?.days
      const body = { kind: "CALL", outcome, ...(note.trim() ? { body: note.trim() } : {}), ...(days ? { followUp: { dueDay: addDays(dayKey(new Date()), days) } } : {}) }
      const updated = await api<LeadDetail>(`/api/leads/${lead.id}/activities`, { method: "POST", body: JSON.stringify(body) })
      toast.success(`Appel noté : ${CALL_OUTCOMES[outcome].toLowerCase()}${days ? ", relance planifiée" : ""}.`)
      onDone(updated)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  const pill = (on: boolean) => cn("min-h-10 rounded-full border px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-sidebar bg-sidebar text-sidebar-foreground" : "bg-background hover:bg-accent")

  return (
    <section aria-label="Résultat de l’appel" className="space-y-3.5 rounded-2xl border border-info/20 bg-info-subtle/60 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-base font-extrabold">{ended ? `Appel terminé · ${ended.answered ? `${spoken(ended.durationSec)} · décroché` : "pas décroché"}` : "Appel passé avec ton téléphone"}</p>
        {ended?.answered && <span className="text-[13px] text-muted-foreground">L’enregistrement arrive dans l’historique</span>}
      </div>
      <p className="text-sm font-bold text-foreground/80">Comment ça s’est passé ?</p>
      <div role="group" aria-label="Résultat" className="flex flex-wrap gap-2">
        {(Object.entries(CALL_OUTCOMES) as [CallOutcome, string][]).map(([value, label]) => (
          <button key={value} type="button" aria-pressed={outcome === value} onClick={() => setOutcome(value)} className={pill(outcome === value)}>{label}</button>
        ))}
      </div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={4000} aria-label="Note de l’appel" placeholder="Ce qu’il faut retenir (facultatif)" className="block w-full resize-y rounded-xl border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm font-bold text-foreground/80">Relance</span>
        {FOLLOW_UPS.map((f) => (
          <button key={f.id} type="button" aria-pressed={follow === f.id} onClick={() => setFollow(follow === f.id ? null : f.id)} className={pill(follow === f.id)}>{f.label}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={save} loading={busy} className="min-h-12 rounded-xl bg-sidebar px-5 font-extrabold text-sidebar-foreground hover:bg-sidebar/90">Enregistrer l’appel</Button>
        <Button variant="ghost" onClick={() => onDone()} disabled={busy}>Plus tard</Button>
      </div>
    </section>
  )
}

/** Listens to a recording kept at Zadarma: the link is asked for on the first play and lasts half an hour. */
export function RecordingPlayer({ callId, durationSec, label }: { callId: string; durationSec: number; label: string }) {
  const audio = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pos, setPos] = useState(0)
  const [length, setLength] = useState(durationSec)

  useEffect(() => () => audio.current?.pause(), [])

  async function toggle() {
    if (audio.current && !audio.current.paused) return audio.current.pause()
    if (!audio.current) {
      setLoading(true)
      try {
        const { url } = await api<{ url: string }>(`/api/calls/${callId}/recording`)
        const a = new Audio(url)
        a.addEventListener("timeupdate", () => setPos(a.currentTime))
        a.addEventListener("loadedmetadata", () => Number.isFinite(a.duration) && a.duration > 0 && setLength(a.duration))
        a.addEventListener("play", () => setPlaying(true))
        a.addEventListener("pause", () => setPlaying(false))
        a.addEventListener("ended", () => setPlaying(false))
        audio.current = a
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Échec")
        return
      } finally {
        setLoading(false)
      }
    }
    await audio.current.play().catch(() => toast.error("Lecture impossible dans ce navigateur."))
  }

  const ratio = length ? Math.min(1, pos / length) : 0
  return (
    <div className="flex items-center gap-3 rounded-xl bg-secondary/60 px-3 py-2">
      <button onClick={toggle} aria-label={playing ? "Mettre en pause" : label} disabled={loading} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sidebar text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
        {playing ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4 translate-x-px" aria-hidden="true" />}
      </button>
      <span aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-border"><span className="block h-full rounded-full bg-sidebar transition-[width]" style={{ width: `${ratio * 100}%` }} /></span>
      <span className="text-xs font-semibold tabular-nums text-muted-foreground">{pos > 0 ? `${clock(pos)} / ${clock(length)}` : clock(length)}</span>
    </div>
  )
}
