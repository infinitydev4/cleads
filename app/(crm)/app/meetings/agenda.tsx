"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { CalendarClock, ChevronLeft, ChevronRight, Settings2 } from "lucide-react"
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
  /** The member's own bookable hours, summed up beside the week (maquette « Rendez-vous v2 »). */
  availability?: { windows: { weekday: number; startMinute: number; endMinute: number }[]; publicUrl: string | null; enabled: boolean } | null
}

const WEEKDAYS = [["Lundi", 1], ["Mardi", 2], ["Mercredi", 3], ["Jeudi", 4], ["Vendredi", 5], ["Samedi", 6], ["Dimanche", 0]] as const
const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`

const TZ = "Europe/Paris"
const mondayOf = (key: string) => addDays(key, -((weekday(key) + 6) % 7))
const hour = (iso: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
const dayTitle = (key: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${key}T12:00:00Z`))

export function Agenda({ hosts, initialToClose, currentUserId, canFilterHosts, canManageAvailability, canAct, canOutcome, isManager, availability }: Props) {
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
  // « Dans 2 h 10 » stays true while the page stays open.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

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

  const upcoming = (meetings ?? []).filter((m) => new Date(m.startsAt).getTime() > now && (m.status === "SCHEDULED" || m.status === "CONFIRMED")).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const nextUp = upcoming[0] ?? null
  const inMin = nextUp ? Math.round((new Date(nextUp.startsAt).getTime() - now) / 60_000) : 0
  const inText = inMin < 60 ? `dans ${inMin} min` : inMin < 24 * 60 ? `dans ${Math.floor(inMin / 60)} h ${String(inMin % 60).padStart(2, "0")}` : dayTitle(dayKey(new Date(nextUp!.startsAt)))
  const todayCount = (meetings ?? []).filter((m) => dayKey(new Date(m.startsAt)) === today && m.status !== "CANCELED" && m.status !== "RESCHEDULED").length

  return (
    <div className="space-y-6">
      <section aria-label="Prochain rendez-vous" className="flex flex-wrap items-center gap-x-9 gap-y-5 rounded-3xl bg-sidebar p-6 text-sidebar-foreground shadow-card">
        <div className="min-w-[280px] flex-1 space-y-2">
          {nextUp ? (
            <>
              <p className="text-sm font-semibold text-sidebar-foreground/70 first-letter:uppercase">Prochain rendez-vous · {inText}</p>
              <p className="text-[26px] font-extrabold leading-tight tracking-[-0.03em] text-white">{MEETING_TYPE_LABELS[nextUp.type]} avec {nextUp.contactName ?? nextUp.leadName}{nextUp.contactName ? ` — ${nextUp.leadName}` : ""}</p>
              <p className="text-sm text-sidebar-foreground/80"><span className="first-letter:uppercase">{dayTitle(dayKey(new Date(nextUp.startsAt)))}</span>, {hour(nextUp.startsAt)}–{hour(nextUp.endsAt)}{canFilterHosts ? ` · ${nextUp.hostName}` : ""}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-sidebar-foreground/70">Cette semaine</p>
              <p className="text-[26px] font-extrabold leading-tight tracking-[-0.03em] text-white">Aucun rendez-vous à venir.</p>
              <p className="text-sm text-sidebar-foreground/80">Un appel réussi se termine par « Rendez-vous » depuis la fiche.</p>
            </>
          )}
        </div>
        {nextUp && (
          <div className="flex flex-wrap gap-2.5">
            {nextUp.videoUrl && <Button asChild className="min-h-12 rounded-2xl px-5 font-extrabold"><a href={nextUp.videoUrl} target="_blank" rel="noreferrer">Rejoindre</a></Button>}
            <Button variant="outline" onClick={() => setOpenId(nextUp.id)} className="min-h-12 rounded-2xl border-white/15 bg-transparent px-5 font-bold text-white hover:bg-white/10 hover:text-white">Préparer</Button>
          </div>
        )}
        <dl className="grid min-w-[300px] flex-1 grid-cols-3 gap-2.5">
          <BandStat label="Aujourd’hui" value={todayCount} />
          <BandStat label="Cette semaine" value={(meetings ?? []).filter((m) => m.status !== "CANCELED" && m.status !== "RESCHEDULED").length} />
          <BandStat label="À clôturer" value={toClose.length} tone={toClose.length ? "text-orange-300" : "text-white"} />
        </dl>
      </section>

      {toClose.length > 0 && (
        <section aria-labelledby="to-close" className="space-y-3 rounded-3xl border bg-card p-5 shadow-card">
          <h2 id="to-close" className="flex items-center gap-2.5 text-base font-extrabold"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-orange-500" /> À clôturer : comment ça s’est passé ?</h2>
          <p className="text-sm text-muted-foreground">Sans résultat, l’opportunité ne bouge pas.</p>
          <ul className="space-y-2">
            {toClose.slice(0, 8).map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50/70 px-4 py-3 dark:border-orange-900/50 dark:bg-orange-950/20">
                <span className="min-w-[220px] flex-1">
                  <span className="block text-[15px] font-bold">{m.leadName}</span>
                  <span className="block text-sm text-muted-foreground"><span className="first-letter:uppercase">{dayTitle(dayKey(new Date(m.startsAt)))}</span>, {hour(m.startsAt)} · avec {m.hostName}</span>
                </span>
                <Button onClick={() => setOpenId(m.id)} className="min-h-11 rounded-full bg-sidebar px-5 font-bold text-sidebar-foreground hover:bg-sidebar/90">Indiquer le résultat</Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-start gap-5">
        <section aria-label="Semaine" className="min-w-0 flex-[999_1_640px] space-y-4 rounded-3xl border bg-card p-5 shadow-card">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5" role="group" aria-label="Semaine">
              <Button variant="outline" size="icon" className="h-11 w-11 rounded-xl" onClick={() => setMonday(addDays(monday, -7))} aria-label="Semaine précédente"><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" className="h-11 rounded-xl font-bold" onClick={() => setMonday(mondayOf(today))}>Cette semaine</Button>
              <Button variant="outline" size="icon" className="h-11 w-11 rounded-xl" onClick={() => setMonday(addDays(monday, 7))} aria-label="Semaine suivante"><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <p className="ml-1 text-[15px] font-extrabold" aria-live="polite">{weekLabel}</p>
            {canFilterHosts && hosts.length > 1 && (
              <label className="ml-auto flex items-center gap-2 text-sm">
                <span className="sr-only sm:not-sr-only">Closer</span>
                <select value={hostId} onChange={(e) => setHostId(e.target.value)} className="h-11 rounded-xl border bg-background px-3 text-sm font-semibold">
                  <option value="">Toute l’équipe</option>
                  {hosts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </label>
            )}
          </div>

          {meetings === null ? (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7" aria-busy="true">{days.map((d) => <div key={d} className="h-56 animate-pulse rounded-2xl bg-muted/50" />)}</div>
          ) : meetings.length === 0 && toClose.length === 0 ? (
            <EmptyState
              art="target"
              title="Aucun rendez-vous cette semaine"
              description={canAct ? "Planifie-en un depuis la fiche d’un prospect (« Rendez-vous »), ou partage ta page de réservation." : "Les rendez-vous de l’équipe apparaîtront ici."}
              action={canManageAvailability ? <Button asChild><Link href="/app/meetings/availability"><CalendarClock className="h-4 w-4" aria-hidden="true" /> Régler mes disponibilités</Link></Button> : undefined}
            />
          ) : (
            <ol className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {days.map((d, i) => {
                const list = byDay.get(d) ?? []
                const isToday = d === today
                return (
                  <li key={d} className={cn("min-h-[15rem] space-y-2 rounded-2xl border p-2.5", isToday ? "border-info/40 bg-info-subtle/50" : i > 4 ? "border-transparent bg-muted/30" : "border-transparent bg-muted/50", list.length === 0 && "hidden sm:block")}>
                    <h3 className={cn("px-0.5 text-xs font-extrabold uppercase tracking-[0.05em]", isToday ? "text-info" : "text-muted-foreground")}>
                      {new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "short", day: "numeric" }).format(new Date(`${d}T12:00:00Z`))}{isToday && " · aujourd’hui"}
                    </h3>
                    <ul className="space-y-2">
                      {list.map((m) => {
                        const off = m.status === "CANCELED" || m.status === "RESCHEDULED"
                        const accent = m.needsOutcome ? "border-l-orange-500" : m.id === nextUp?.id ? "border-l-primary" : m.status === "CONFIRMED" ? "border-l-success" : "border-l-border"
                        return (
                          <li key={m.id}>
                            <button type="button" onClick={() => setOpenId(m.id)} className={cn("w-full space-y-1 rounded-xl border-l-[3px] bg-card p-2.5 text-left text-sm shadow-card transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", accent, off && "opacity-60")}>
                              <span className="block font-extrabold tabular-nums">{hour(m.startsAt)}–{hour(m.endsAt)}</span>
                              <span className="block truncate font-semibold">{m.leadName}</span>
                              <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                                {m.needsOutcome ? <span className="rounded-full bg-orange-100 px-2 py-0.5 font-bold text-orange-800 dark:bg-orange-950/40 dark:text-orange-200">À clôturer</span> : <StatusBadge map={meetingStatus} value={m.status} />}
                                <span>{canFilterHosts ? m.hostName : MEETING_TYPE_LABELS[m.type]}</span>
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                )
              })}
            </ol>
          )}
        </section>

        {canManageAvailability && (
          <aside aria-label="Mes disponibilités" className="flex-[1_1_280px] space-y-3 rounded-3xl border bg-card p-5 shadow-card">
            <h2 className="text-base font-extrabold">Mes disponibilités</h2>
            <p className="text-sm text-muted-foreground">{availability?.enabled ? "Ce que les prospects peuvent réserver depuis ton lien." : "Ta page de réservation n’est pas encore ouverte."}</p>
            <dl className="divide-y text-sm">
              {WEEKDAYS.map(([label, wd]) => {
                const windows = (availability?.windows ?? []).filter((w) => w.weekday === wd)
                return (
                  <div key={label} className="flex items-center justify-between gap-3 py-2.5">
                    <dt className="font-semibold">{label}</dt>
                    <dd className={cn("text-right text-[13px]", windows.length ? "font-semibold text-foreground/85" : "text-muted-foreground")}>{windows.length ? windows.map((w) => `${hm(w.startMinute)} – ${hm(w.endMinute)}`).join(" · ") : "Fermé"}</dd>
                  </div>
                )
              })}
            </dl>
            <Button asChild className="min-h-11 w-full rounded-xl bg-sidebar font-bold text-sidebar-foreground hover:bg-sidebar/90"><Link href="/app/meetings/availability"><Settings2 className="h-4 w-4" aria-hidden="true" /> Modifier mes créneaux</Link></Button>
            {availability?.publicUrl && (
              <Button variant="outline" className="min-h-11 w-full rounded-xl font-bold" onClick={() => navigator.clipboard.writeText(availability.publicUrl!).then(() => toast.success("Lien de réservation copié"), () => toast.error("Copie impossible"))}>Copier mon lien de réservation</Button>
            )}
          </aside>
        )}
      </div>

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

function BandStat({ label, value, tone = "text-white" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-2xl bg-white/5 px-4 py-3">
      <dt className="text-xs font-semibold text-sidebar-foreground/70">{label}</dt>
      <dd className={cn("mt-1 text-2xl font-extrabold tabular-nums", tone)}>{value}</dd>
    </div>
  )
}
