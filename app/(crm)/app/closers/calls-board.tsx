"use client"

import { useState } from "react"
import Link from "next/link"
import { PhoneIncoming, PhoneOutgoing } from "lucide-react"
import { ago, formatDateTime } from "@/lib/crm/format"
import { cn } from "@/lib/utils"
import { CALL_OUTCOMES, type CallOutcome } from "@/features/activity/rules"
import { CALL_PERIODS, type CallBoard, type CallPeriod } from "@/features/telephony/stats"
import { spoken } from "@/features/telephony/webphone-state"
import { RecordingPlayer } from "../call-panel"
import { initialsOf } from "../closer-fiche"

const OUTCOME_TONE: Record<string, string> = {
  reached: "bg-success-subtle text-success",
  callback: "bg-warning-subtle text-warning",
  voicemail: "bg-info-subtle text-info",
  no_answer: "bg-secondary text-muted-foreground",
  wrong_number: "bg-destructive-subtle text-destructive-text",
}

/**
 * The real calls of the team (E32 lot 2, maquette « Mes closers : appels et temps de parole »): totals for the period,
 * each caller's calls, pick-ups and talk time, and the last calls with what came of them and their recording.
 */
export function CallsBoard({ board }: { board: CallBoard }) {
  const [period, setPeriod] = useState<CallPeriod>("today")
  const p = board.periods[period]
  const maxTalk = Math.max(1, ...p.rows.map((r) => r.talkSec))
  const rate = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)} %` : "—")

  return (
    <section aria-labelledby="calls-title" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 id="calls-title" className="text-xl font-extrabold tracking-[-0.03em]">Appels au téléphone</h2>
          <p className="text-sm text-muted-foreground">Comptés automatiquement par le standard Zadarma.</p>
        </div>
        <div role="group" aria-label="Période" className="flex gap-1 rounded-full border bg-card p-1">
          {(Object.entries(CALL_PERIODS) as [CallPeriod, string][]).map(([id, label]) => (
            <button key={id} aria-pressed={period === id} onClick={() => setPeriod(id)} className={cn("min-h-10 rounded-full px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", period === id ? "bg-sidebar text-sidebar-foreground" : "text-foreground/80 hover:bg-accent")}>{label}</button>
          ))}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Appels" value={String(p.calls)} hint="sortants et entrants" />
        <Kpi label="Décrochés" value={`${p.answered} · ${rate(p.answered, p.calls)}`} hint="répondeurs compris" />
        <Kpi label="Temps de parole" value={spoken(p.talkSec)} hint="toute l’équipe" />
        <Kpi label="Rendez-vous pris" value={String(p.meetings)} hint="sur la période" />
      </dl>

      <div className="overflow-hidden rounded-3xl border bg-card shadow-card">
        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            <div className="grid grid-cols-[minmax(0,2fr)_100px_150px_minmax(0,1.6fr)_110px_140px] gap-4 border-b px-6 py-3.5 text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
              <span>Membre</span><span>Appels</span><span>Décrochés</span><span>Temps de parole</span><span>Moyenne</span><span>Dernier appel</span>
            </div>
            {p.rows.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">Aucun closer ni poste Zadarma : attribue un poste dans <Link href="/app/settings/team" className="font-semibold text-info hover:underline">Réglages › Équipe</Link>.</p>
            ) : (
              <ul>
                {p.rows.map((r) => {
                  const pct = r.calls ? Math.round((r.answered / r.calls) * 100) : 0
                  return (
                    <li key={r.id} className="grid min-h-[68px] grid-cols-[minmax(0,2fr)_100px_150px_minmax(0,1.6fr)_110px_140px] items-center gap-4 border-b px-6 py-3 last:border-b-0">
                      <span className="flex min-w-0 items-center gap-3">
                        <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-[13px] font-extrabold text-secondary-foreground">{initialsOf(r.name)}</span>
                        <span className="min-w-0"><span className="block truncate text-[15px] font-bold">{r.name}</span><span className="block text-xs text-muted-foreground">{r.extension ? `Poste ${r.extension}` : "Sans poste Zadarma"}</span></span>
                      </span>
                      <span className="text-base font-extrabold tabular-nums">{r.calls}</span>
                      <span className="space-y-1.5">
                        <span className="block text-sm font-bold tabular-nums">{r.answered} · {rate(r.answered, r.calls)}</span>
                        <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-secondary"><span className="block h-full rounded-full bg-success" style={{ width: `${pct}%` }} /></span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span aria-hidden="true" className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary"><span className="block h-full rounded-full bg-sidebar" style={{ width: `${Math.round((r.talkSec / maxTalk) * 100)}%` }} /></span>
                        <span className="min-w-16 text-right text-sm font-bold tabular-nums">{spoken(r.talkSec)}</span>
                      </span>
                      <span className="text-sm tabular-nums text-foreground/80">{r.answered ? spoken(r.talkSec / r.answered) : "—"}</span>
                      <span className="text-sm text-muted-foreground">{r.lastAt ? ago(r.lastAt) : "—"}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-1 rounded-3xl border bg-card p-6 shadow-card">
        <h3 className="mb-2 text-base font-extrabold">Derniers appels</h3>
        {board.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun appel encore : ils apparaissent ici dès que le standard les signale.</p>
        ) : (
          <ul>
            {board.recent.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 border-b py-3 last:border-b-0">
                <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">{c.direction === "INBOUND" ? <PhoneIncoming className="h-4 w-4" /> : <PhoneOutgoing className="h-4 w-4" />}</span>
                <span className="min-w-0 flex-[1_1_220px]">
                  {c.leadId ? <Link href={`/app/leads/${c.leadId}`} className="block truncate text-sm font-bold hover:underline">{c.leadName}</Link> : <span className="block truncate text-sm font-bold">{c.leadName}</span>}
                  <span className="block text-xs text-muted-foreground">{[c.userName ?? (c.direction === "INBOUND" ? "Appel entrant manqué" : null), formatDateTime(c.startedAt), c.durationSec ? spoken(c.durationSec) : null].filter(Boolean).join(" · ")}</span>
                </span>
                {c.outcome && c.outcome in CALL_OUTCOMES ? (
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", OUTCOME_TONE[c.outcome] ?? "bg-secondary")}>{CALL_OUTCOMES[c.outcome as CallOutcome]}</span>
                ) : (
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-muted-foreground">{c.disposition === "answered" ? "Décroché" : "Sans réponse"}</span>
                )}
                {c.recorded && <div className="w-full sm:w-64"><RecordingPlayer callId={c.id} durationSec={c.durationSec} label={`Écouter l’appel avec ${c.leadName}`} /></div>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="space-y-1 rounded-2xl border bg-card p-4 shadow-card">
      <dt className="text-[13px] font-semibold text-muted-foreground">{label}</dt>
      <dd className="text-[26px] font-extrabold tabular-nums tracking-[-0.03em]">{value}</dd>
      <dd className="text-xs text-muted-foreground">{hint}</dd>
    </div>
  )
}
