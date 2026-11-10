"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Pause, Play, X } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { AiCallDetail } from "@/features/ai-caller/service"
import { FACT_LABELS, HOOK_LABELS, OUTCOME_LABELS, euros } from "@/features/ai-caller/rules"
import { api } from "../leads/api"

const when = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })
const stamp = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`

/** E33: one call of the agent (mockup artboard 17): result, recording, what it learnt, transcript. */
export function CallSheet({ callId, onClose }: { callId: string | null; onClose: () => void }) {
  // What was loaded, for which call: switching calls shows the skeleton until the new one arrives.
  const [loaded, setLoaded] = useState<{ id: string; call: AiCallDetail | null; error: string | null } | null>(null)
  const call = loaded?.id === callId ? loaded.call : null
  const error = loaded?.id === callId ? loaded.error : null

  useEffect(() => {
    if (!callId) return
    let stale = false
    api<AiCallDetail>(`/api/ai-caller/calls/${callId}`)
      .then((c) => !stale && setLoaded({ id: callId, call: c, error: null }))
      .catch((e) => !stale && setLoaded({ id: callId, call: null, error: e instanceof Error ? e.message : "Appel introuvable." }))
    return () => {
      stale = true
    }
  }, [callId])

  return (
    <Sheet open={!!callId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[660px] sm:rounded-l-3xl [&>button.absolute]:hidden">
        <SheetTitle className="sr-only">{call ? `Appel avec ${call.company}` : "Appel de l’agent IA"}</SheetTitle>
        <SheetDescription className="sr-only">Le résultat de l’appel, son enregistrement et sa transcription.</SheetDescription>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 pb-6 pt-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-extrabold uppercase tracking-[0.06em] text-muted-foreground">Appel de l’agent IA{call?.startedAt ? ` · ${stamp.format(new Date(call.startedAt))}` : ""}</p>
              <h2 className="truncate text-2xl font-extrabold tracking-[-0.03em]">{call?.company ?? (error ? "Appel introuvable" : "Chargement…")}</h2>
              {call?.meta && <p className="text-sm text-muted-foreground">{call.meta}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Fermer" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {error && <p className="rounded-2xl bg-destructive-subtle px-4 py-3 text-sm text-destructive-text">{error}</p>}
          {!call && !error && (
            <div className="space-y-3">
              <Skeleton className="h-32 rounded-2xl" />
              <Skeleton className="h-16 rounded-2xl" />
              <Skeleton className="h-48 rounded-2xl" />
            </div>
          )}
          {call && <CallBody call={call} />}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Result({ call }: { call: AiCallDetail }) {
  const pending = call.status === "QUEUED" || call.status === "DIALING"
  const label = pending ? (call.status === "DIALING" ? "En cours" : "En attente") : call.status === "CANCELED" ? "Annulé" : OUTCOME_LABELS[call.outcome ?? "FAILED"]
  const line = call.meeting
    ? `${when.format(new Date(call.meeting.startsAt))} · ${call.format === "meet" ? "Google Meet" : "Téléphone"} avec ${call.meeting.hostName}`
    : pending
      ? call.status === "DIALING"
        ? "L’agent est en ligne avec le prospect. Le compte rendu arrive à la fin de l’appel."
        : "L’appel partira pendant les heures d’appel, quand une ligne sera libre."
      : call.outcome === "CALLBACK"
        ? "Une tâche de rappel a été créée sur la fiche."
        : call.outcome === "DO_NOT_CALL"
          ? "La fiche est passée en « ne pas contacter » : plus aucun appel ni email."
          : call.error ?? (call.summary ? null : "Aucun échange utile pendant cet appel.")
  return (
    <section aria-label="Résultat" className="space-y-3 rounded-2xl bg-sidebar px-5 py-5 text-sidebar-foreground">
      <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold", call.outcome === "MEETING" ? "bg-primary text-primary-foreground" : "bg-white/10 text-white")}>{label}</span>
      {line && <p className="text-lg font-extrabold leading-snug tracking-[-0.02em] text-white">{line}</p>}
      {call.meeting && <p className="text-[13px] text-sidebar-foreground/80">Le prospect reçoit la confirmation par email s’il a une adresse · {call.meeting.hostName} est prévenu · opportunité au pipeline</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        <Link href={`/app/leads/${call.leadId}`} className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">Ouvrir la fiche</Link>
        {call.meeting && (
          <Link href="/app/meetings" className="inline-flex min-h-11 items-center rounded-xl border border-sidebar-foreground/25 px-4 text-sm font-bold text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">Voir le rendez-vous</Link>
        )}
      </div>
    </section>
  )
}

const BARS = [10, 18, 26, 14, 30, 22, 12, 34, 28, 16, 24, 36, 20, 12, 26, 32, 18, 10, 22, 30, 14, 26, 34, 20, 12, 18, 28, 36, 24, 14, 30, 22, 16, 26, 12, 20, 32, 18, 10, 24, 30, 16, 22, 28, 14, 20, 12, 8]

function Player({ callId, duration }: { callId: string; duration: number }) {
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [at, setAt] = useState(0)
  const [failed, setFailed] = useState(false)
  const [length, setLength] = useState<number | null>(null)
  const total = length ?? duration
  const done = total ? Math.round((at / total) * BARS.length) : 0

  async function toggle() {
    const a = audio.current
    if (!a) return
    if (playing) return a.pause()
    try {
      await a.play()
    } catch {
      setFailed(true)
    }
  }

  return (
    <section aria-label="Enregistrement" className="flex items-center gap-4 rounded-2xl bg-secondary/70 px-4 py-3">
      <audio ref={audio} src={`/api/ai-caller/calls/${callId}/audio`} preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)} onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setLength(e.currentTarget.duration)} onError={() => setFailed(true)} />
      <button type="button" onClick={toggle} disabled={failed} aria-label={playing ? "Mettre l’écoute en pause" : "Écouter l’appel"} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-sidebar text-white hover:bg-sidebar/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
        {playing ? <Pause className="h-5 w-5" aria-hidden="true" /> : <Play className="h-5 w-5 translate-x-px" aria-hidden="true" />}
      </button>
      <div aria-hidden="true" className="flex h-10 min-w-0 flex-1 items-center gap-[3px]">
        {BARS.map((h, i) => (
          <span key={i} className={cn("min-w-[2px] flex-1 rounded-full transition-colors", i < done ? "bg-sidebar" : "bg-muted-foreground/30")} style={{ height: h }} />
        ))}
      </div>
      <span className="text-[13px] font-semibold tabular-nums text-muted-foreground">{failed ? "Indisponible" : `${clock(at)} / ${clock(total)}`}</span>
    </section>
  )
}

function CallBody({ call }: { call: AiCallDetail }) {
  const facts = Object.entries(FACT_LABELS)
    .map(([k, label]) => ({ label, value: call.facts[k] }))
    .filter((f) => f.value)
  return (
    <>
      <Result call={call} />
      {call.hasAudio && <Player callId={call.id} duration={call.durationSec} />}
      {call.summary && <p className="rounded-2xl border px-4 py-3 text-sm leading-relaxed">{call.summary}</p>}
      {facts.length > 0 && (
        <section aria-label="Ce que l’agent a appris" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {facts.map((f) => (
            <div key={f.label} className="space-y-1 rounded-2xl border px-4 py-3">
              <p className="text-xs font-bold text-muted-foreground">{f.label}</p>
              <p className="text-sm font-semibold">{f.value}</p>
            </div>
          ))}
        </section>
      )}
      <section aria-label="Transcription" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-extrabold">Transcription</h3>
          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-secondary-foreground">Accroche : {HOOK_LABELS[call.hook]?.toLowerCase() ?? call.hook}</span>
        </div>
        {call.transcript.length === 0 ? (
          <p className="rounded-2xl bg-secondary/60 px-4 py-6 text-center text-sm text-muted-foreground">Pas de transcription pour cet appel.</p>
        ) : (
          <ol className="flex flex-col gap-2.5">
            {call.transcript.map((t, i) => {
              const agent = t.role === "agent"
              return (
                <li key={i} className={cn("flex max-w-[86%] flex-col gap-1", agent ? "items-start self-start" : "items-end self-end")}>
                  <span className="text-[11px] font-bold text-muted-foreground">{agent ? "Agent IA" : "Prospect"} · {clock(t.at)}</span>
                  <span className={cn("rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed", agent ? "rounded-tl-md bg-secondary" : "rounded-tr-md bg-sidebar text-white")}>{t.text}</span>
                </li>
              )
            })}
          </ol>
        )}
      </section>
      <p className="border-t pt-4 text-[13px] text-muted-foreground">
        Coût estimé de l’appel : <strong className="text-foreground">{euros(call.costMicros)}</strong> · essai {call.attempt} · chiffres tirés de l’audit de la fiche
      </p>
    </>
  )
}
