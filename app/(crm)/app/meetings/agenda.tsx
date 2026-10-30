"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, CalendarClock, ChevronLeft, ChevronRight, Settings2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/crm/status-badge"
import { EmptyState } from "@/components/crm/empty-state"
import { addDays, dayKey, startOfDay, weekday } from "@/lib/crm/day"
import { meetingStatus } from "@/lib/crm/status"
import { cn } from "@/lib/utils"
import type { MeetingView } from "@/features/meetings/service"
import { MEETING_TYPE_LABELS } from "@/features/meetings/rules"
import { api } from "../leads/api"
import { MeetingPanel } from "./meeting-panel"

interface Host {
  id: string
  name: string
}

interface Props {
  hosts: Host[]
  initialToClose: MeetingView[]
  currentUserId: string
  canFilterHosts: boolean
  canManageAvailability: boolean
  canAct: boolean
  canOutcome: boolean
  isManager: boolean
}

const TZ = "Europe/Paris"
const mondayOf = (key: string) => addDays(key, -((weekday(key) + 6) % 7))
const hour = (iso: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
const dayTitle = (key: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${key}T12:00:00Z`))

export function Agenda({ hosts, initialToClose, currentUserId, canFilterHosts, canManageAvailability, canAct, canOutcome, isManager }: Props) {
  const today = dayKey(new Date())
  const [monday, setMonday] = useState(mondayOf(today))
  const [hostId, setHostId] = useState("")
  const key = `${monday}|${hostId}`
  const [loaded, setLoaded] = useState<{ key: string; meetings: MeetingView[] } | null>(null)
  // The week on screen is the one asked for; while another loads, skeletons show instead of stale days.
  const meetings = loaded?.key === key ? loaded.meetings : null
  const [toClose, setToClose] = useState(initialToClose)
  const [openId, setOpenId] = useState<string | null>(null)

  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    const from = startOfDay(monday).toISOString()
    const to = startOfDay(addDays(monday, 7)).toISOString()
    Promise.all([
      api<{ meetings: MeetingView[] }>(`/api/meetings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${hostId ? `&hostId=${hostId}` : ""}`),
      api<{ meetings: MeetingView[] }>("/api/meetings?toClose=1"),
    ])
      .then(([week, owed]) => {
        if (!alive) return
        setLoaded({ key: `${monday}|${hostId}`, meetings: week.meetings })
        setToClose(owed.meetings)
      })
      .catch((e) => alive && toast.error(e instanceof Error ? e.message : "Impossible de charger l’agenda"))
    return () => {
      alive = false
    }
  }, [monday, hostId, tick])

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday])
  const byDay = useMemo(() => {
    const map = new Map<string, MeetingView[]>()
    for (const m of meetings ?? []) map.set(dayKey(new Date(m.startsAt)), [...(map.get(dayKey(new Date(m.startsAt))) ?? []), m])
    return map
  }, [meetings])
  const open = [...(meetings ?? []), ...toClose].find((m) => m.id === openId) ?? null
  const weekLabel = `${new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", month: "long" }).format(new Date(`${days[0]}T12:00:00Z`))} au ${new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${days[6]}T12:00:00Z`))}`

  return (
    <div className="space-y-6">
      {toClose.length > 0 && (
        <section aria-labelledby="to-close" className="rounded-2xl border border-warning/40 bg-warning/10 p-4">
          <h2 id="to-close" className="flex items-center gap-2 text-sm font-bold"><AlertTriangle className="h-4 w-4" aria-hidden="true" /> {toClose.length} rendez-vous à clôturer</h2>
          <p className="mt-1 text-sm text-muted-foreground">Indiquez comment ils se sont passés : sans résultat, l’opportunité ne bouge pas.</p>
          <ul className="mt-3 divide-y divide-warning/20">
            {toClose.slice(0, 8).map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => setOpenId(m.id)} className="flex min-h-[2.75rem] w-full flex-wrap items-center gap-x-3 gap-y-1 py-2 text-left text-sm hover:underline">
                  <span className="font-medium">{m.leadName}</span>
                  <span className="first-letter:uppercase text-muted-foreground">{dayTitle(dayKey(new Date(m.startsAt)))}, {hour(m.startsAt)}</span>
                  <span className="text-muted-foreground">avec {m.hostName}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1" role="group" aria-label="Semaine">
          <Button variant="outline" size="icon" onClick={() => setMonday(addDays(monday, -7))} aria-label="Semaine précédente"><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setMonday(mondayOf(today))}>Cette semaine</Button>
          <Button variant="outline" size="icon" onClick={() => setMonday(addDays(monday, 7))} aria-label="Semaine suivante"><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <p className="text-sm font-medium" aria-live="polite">{weekLabel}</p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canFilterHosts && hosts.length > 1 && (
            <label className="flex items-center gap-2 text-sm">
              <span className="sr-only sm:not-sr-only">Closer</span>
              <select value={hostId} onChange={(e) => setHostId(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
                <option value="">Toute l’équipe</option>
                {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </label>
          )}
          {canManageAvailability && (
            <Button asChild variant="outline" size="sm"><Link href="/app/meetings/availability"><Settings2 className="h-4 w-4" aria-hidden="true" /> Mes disponibilités</Link></Button>
          )}
        </div>
      </div>

      {meetings === null ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7" aria-busy="true">{days.map((d) => <div key={d} className="h-40 animate-pulse rounded-xl bg-muted/50" />)}</div>
      ) : meetings.length === 0 && toClose.length === 0 ? (
        <EmptyState
          art="target"
          title="Aucun rendez-vous cette semaine"
          description={canAct ? "Planifiez-en un depuis la fiche d’un prospect (« Rendez-vous »), ou partagez votre page de réservation." : "Les rendez-vous de l’équipe apparaîtront ici."}
          action={canManageAvailability ? <Button asChild><Link href="/app/meetings/availability"><CalendarClock className="h-4 w-4" aria-hidden="true" /> Régler mes disponibilités</Link></Button> : undefined}
        />
      ) : (
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {days.map((d) => {
            const list = byDay.get(d) ?? []
            const isToday = d === today
            return (
              <li key={d} className={cn("min-h-[6rem] rounded-xl border bg-card p-3", isToday && "border-primary ring-1 ring-primary/40", list.length === 0 && "hidden sm:block")}>
                <h3 className={cn("mb-2 flex flex-wrap items-baseline gap-x-2 text-xs font-bold uppercase tracking-wide text-muted-foreground", isToday && "text-foreground")}>
                  {new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "short", day: "numeric" }).format(new Date(`${d}T12:00:00Z`))}
                  {isToday && <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">Aujourd’hui</span>}
                </h3>
                {list.length === 0 ? <p className="text-xs text-muted-foreground">—</p> : (
                  <ul className="space-y-2">
                    {list.map((m) => (
                      <li key={m.id}>
                        <button type="button" onClick={() => setOpenId(m.id)} className={cn("w-full rounded-lg border p-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", m.needsOutcome && "border-warning/60 bg-warning/10", m.status === "CANCELED" || m.status === "RESCHEDULED" ? "opacity-60" : "")}>
                          <span className="block font-semibold tabular-nums">{hour(m.startsAt)}–{hour(m.endsAt)}</span>
                          <span className="block truncate">{m.leadName}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                            <StatusBadge map={meetingStatus} value={m.status} />
                            {m.needsOutcome && <span className="font-medium text-foreground">résultat à saisir</span>}
                            <span>{canFilterHosts ? m.hostName : MEETING_TYPE_LABELS[m.type]}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ol>
      )}

      <MeetingPanel
        key={open?.id ?? "none"}
        meeting={open}
        onClose={() => setOpenId(null)}
        onChanged={() => setTick((t) => t + 1)}
        currentUserId={currentUserId}
        canAct={canAct && (isManager || open?.hostId === currentUserId || hosts.length > 1)}
        canOutcome={canOutcome && (isManager || open?.hostId === currentUserId)}
        isManager={isManager}
      />
    </div>
  )
}
