"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Flame, Globe, ListChecks, Loader2, PhoneCall, Sparkles, type LucideIcon } from "lucide-react"
import { EmptyState } from "@/components/crm/empty-state"
import { formatDateTime } from "@/lib/crm/format"
import { leadStatus } from "@/lib/crm/status"
import { cn } from "@/lib/utils"
import type { FocusFilter } from "@/features/leads/schemas"
import type { LeadDetail, LeadList, LeadListRow } from "@/features/leads/types"
import type { DeskStats } from "@/features/leads/desk"
import { api } from "./leads/api"
import type { Assignee } from "./leads/filter-bar"
import { PriorityBadge, SiteIndicator } from "./leads/indicators"
import { LeadDetailView } from "./leads/lead-detail-view"

type Segment = "all" | FocusFilter

const SEGMENTS: { id: Segment; label: string; icon: LucideIcon }[] = [
  { id: "all", label: "Toute ma file", icon: ListChecks },
  { id: "hot", label: "À appeler en premier", icon: Flame },
  { id: "callback", label: "À rappeler", icon: PhoneCall },
  { id: "nosite", label: "Sans site", icon: Globe },
  { id: "fresh", label: "Jamais contactés", icon: Sparkles },
]

/** Where a fiche stands on the way to a meeting: contacted, answered, qualified (four steps, the last a meeting). */
const STEP: Record<string, number> = { NEW: 0, CONTACTED: 1, REPLIED: 2, QUALIFIED: 3, DISQUALIFIED: 0, DO_NOT_CONTACT: 0 }

function when(r: LeadListRow): { text: string; late: boolean } {
  if (r.next?.dueAt) return { text: r.next.late ? `En retard · ${formatDateTime(r.next.dueAt)}` : formatDateTime(r.next.dueAt), late: r.next.late }
  if (r.priority === 1) return { text: "Maintenant", late: false }
  return { text: r.lastContactedAt ? "Relancer" : "À découvrir", late: false }
}

/**
 * The closer's cockpit (9 November 2026, maquette « Cockpit closer CLEADS »): his day at a glance, his call file
 * ranked by priority, and the fiche open beside it on the call — why now, the script, the objections, qualifying.
 */
export function CloserDesk({ firstName, initial, counts, stats, assignees, currentUserId }: {
  firstName: string | null
  initial: LeadList
  counts: Record<FocusFilter, number>
  stats: DeskStats
  assignees: Assignee[]
  currentUserId: string
}) {
  const router = useRouter()
  const [segment, setSegment] = useState<Segment>("all")
  const [list, setList] = useState<{ segment: Segment; rows: LeadListRow[]; total: number }>({ segment: "all", rows: initial.rows, total: initial.total })
  const [loading, setLoading] = useState(false)
  const rows = useMemo(() => [...list.rows].sort((a, b) => a.priority - b.priority || b.score - a.score), [list.rows])
  const [selectedId, setSelectedId] = useState<string | null>(rows[0]?.id ?? null)
  const [detail, setDetail] = useState<{ id: string; lead?: LeadDetail; error?: string } | null>(null)
  const panel = useRef<HTMLDivElement>(null)

  const load = useCallback(async (seg: Segment) => {
    setLoading(true)
    try {
      const next = await api<LeadList>(`/api/leads?pageSize=100${seg === "all" ? "" : `&focus=${seg}`}`)
      setList({ segment: seg, rows: next.rows, total: next.total })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    api<LeadDetail>(`/api/leads/${selectedId}`).then((lead) => !cancelled && setDetail({ id: selectedId, lead })).catch((e) => !cancelled && setDetail({ id: selectedId, error: e.message }))
    return () => { cancelled = true }
  }, [selectedId])

  function pick(seg: Segment) {
    setSegment(seg)
    load(seg).catch(() => undefined)
  }
  function open(id: string) {
    setSelectedId(id)
    // On a phone the fiche sits under the file: bring it into view.
    if (window.matchMedia("(max-width: 1023px)").matches) requestAnimationFrame(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "start" }))
  }
  function changed(next: LeadDetail) {
    setDetail({ id: next.id, lead: next })
    load(segment).catch(() => undefined)
    router.refresh()
  }

  const current = detail?.id === selectedId ? detail : null
  const progress = Math.min(100, Math.round((stats.calls / stats.goal) * 100))
  const ready = counts.hot

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 basis-80">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.03em]">
            {`Bonjour${firstName ? ` ${firstName}` : ""}, ${ready > 0 ? `${ready} appel${ready > 1 ? "s" : ""} prioritaire${ready > 1 ? "s" : ""} t’attend${ready > 1 ? "ent" : ""}` : "ta file est à jour"}`}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Classés par priorité : ouvre une fiche, lis pourquoi appeler, appelle, note le résultat.</p>
          <div className="mt-3 max-w-sm space-y-1.5">
            <div className="flex justify-between text-xs font-semibold text-muted-foreground"><span>Objectif du jour</span><span className="tabular-nums">{stats.calls} / {stats.goal} appels</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Appels du jour" aria-valuenow={stats.calls} aria-valuemin={0} aria-valuemax={stats.goal}>
              <div className="h-full rounded-full bg-sidebar transition-[width]" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
        <dl className="grid flex-1 basis-[420px] grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Appels aujourd’hui" value={stats.calls} />
          <Kpi label="Joints" value={stats.reached} hint={stats.calls ? `sur ${stats.calls}` : undefined} />
          <Kpi label="Rendez-vous à venir" value={stats.meetings} />
          <Kpi label="Ventes du mois" value={stats.wonThisMonth} />
        </dl>
      </header>

      <div role="group" aria-label="File d’appels" className="flex flex-wrap gap-2">
        {SEGMENTS.map((s) => {
          const on = segment === s.id
          const count = s.id === "all" ? (list.segment === "all" ? list.total : initial.total) : counts[s.id]
          return (
            <button
              key={s.id}
              onClick={() => pick(s.id)}
              aria-pressed={on}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "border-sidebar bg-sidebar text-sidebar-foreground shadow-sm" : "bg-card hover:bg-accent"
              )}
            >
              <s.icon className="h-4 w-4" aria-hidden="true" />
              {s.label}
              <span className={cn("rounded-full px-2 text-xs tabular-nums", on ? "bg-primary text-primary-foreground" : "bg-secondary")}>{count}</span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <section aria-label="File d’appels" className={cn("min-w-0 flex-[999_1_560px] overflow-hidden rounded-2xl border bg-card shadow-card transition-opacity", loading && "opacity-60")} aria-busy={loading}>
          {rows.length === 0 ? (
            <div className="p-6">
              <EmptyState art="target" title={segment === "all" ? "Aucune fiche ne t’est encore attribuée" : "Rien dans ce segment"} description={segment === "all" ? "Ton manager t’attribue tes fiches : elles apparaîtront ici, classées par priorité." : "Choisis un autre segment, ou « Toute ma file »."} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[600px]">
                <div className="grid grid-cols-[44px_minmax(0,2fr)_108px_minmax(0,1.4fr)_136px] gap-3 border-b px-4 py-3 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                  <span className="sr-only">Priorité</span><span aria-hidden="true">P</span><span>Prospect</span><span>Site web</span><span>Opportunité</span><span>Suivi</span>
                </div>
                <ul>
                  {rows.map((r) => {
                    const active = r.id === selectedId
                    const w = when(r)
                    const step = STEP[r.status] ?? 0
                    return (
                      <li key={r.id}>
                        <button
                          onClick={() => open(r.id)}
                          aria-current={active ? "true" : undefined}
                          className={cn(
                            "grid min-h-16 w-full grid-cols-[44px_minmax(0,2fr)_108px_minmax(0,1.4fr)_136px] items-center gap-3 border-b border-l-[3px] border-l-transparent px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                            active && "border-l-info bg-info-subtle/60"
                          )}
                        >
                          <span><PriorityBadge priority={r.priority} /></span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold">{r.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">{[r.city, r.sector].filter(Boolean).join(" · ") || "—"}{r.signal ? ` · ${r.signal}` : ""}</span>
                          </span>
                          <SiteIndicator state={r.site} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">{r.offer?.name ?? "À découvrir"}</span>
                            <span className="block truncate text-xs text-muted-foreground">{r.offer?.price ?? "Lance l’audit depuis la fiche"}</span>
                          </span>
                          <span className="min-w-0 space-y-1">
                            <span className="flex items-center gap-1">
                              {[0, 1, 2, 3].map((i) => <span key={i} aria-hidden="true" className={cn("h-1.5 w-4 rounded-full", i < step ? "bg-sidebar" : "bg-muted")} />)}
                              <span className="ml-1 truncate text-xs text-muted-foreground">{leadStatus[r.status].label}</span>
                            </span>
                            <span className={cn("block truncate text-xs font-semibold", w.late ? "text-destructive-text" : "text-foreground")} title={r.next?.title}>{w.text}</span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>
          )}
        </section>

        <aside ref={panel} aria-label="Fiche prospect" className="min-w-0 flex-[1_1_420px] scroll-mt-4 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto">
          <div className="rounded-2xl bg-muted/50 p-3 sm:p-4">
            {!selectedId && <p className="py-12 text-center text-sm text-muted-foreground">Choisis un prospect dans ta file.</p>}
            {selectedId && current?.error && <p role="alert" className="rounded-lg bg-destructive-subtle p-3 text-sm font-medium text-destructive-text">{current.error}</p>}
            {selectedId && !current && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Chargement de la fiche" /></div>}
            {current?.lead && <LeadDetailView key={current.lead.id} lead={current.lead} assignees={assignees} currentUserId={currentUserId} onChange={changed} />}
          </div>
        </aside>
      </div>
    </div>
  )
}

function Kpi({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 shadow-card">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-2xl font-extrabold tabular-nums tracking-tight">{value}{hint && <span className="ml-1 text-xs font-medium text-muted-foreground">{hint}</span>}</dd>
    </div>
  )
}
