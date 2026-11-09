"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Phone, Search } from "lucide-react"
import { EmptyState } from "@/components/crm/empty-state"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { formatDateTime } from "@/lib/crm/format"
import { leadStatus } from "@/lib/crm/status"
import { cn } from "@/lib/utils"
import type { FocusFilter } from "@/features/leads/schemas"
import type { LeadDetail, LeadList, LeadListRow } from "@/features/leads/types"
import type { DeskStats } from "@/features/leads/desk"
import { api } from "./leads/api"
import { SiteIndicator } from "./leads/indicators"
import { CloserFiche, initialsOf } from "./closer-fiche"

type Segment = "all" | FocusFilter

const SEGMENTS: { id: Segment; label: string }[] = [
  { id: "all", label: "Toute ma file" },
  { id: "hot", label: "À appeler en premier" },
  { id: "callback", label: "À rappeler" },
  { id: "nosite", label: "Sans site" },
  { id: "fresh", label: "Jamais contactés" },
]

/** Where a fiche stands on the way to a meeting: contacted, answered, qualified (the fourth step is the meeting). */
const STEP: Record<string, number> = { NEW: 0, CONTACTED: 1, REPLIED: 2, QUALIFIED: 3, DISQUALIFIED: 0, DO_NOT_CONTACT: 0 }

const PRIO_STYLE = { 1: "bg-warning-subtle text-warning", 2: "bg-info-subtle text-info", 3: "bg-secondary text-muted-foreground" } as const

function next(r: LeadListRow): { text: string; tone: "late" | "soon" | "now" | "calm" } {
  if (r.next?.dueAt) return r.next.late ? { text: `En retard · ${formatDateTime(r.next.dueAt)}`, tone: "late" } : { text: `Rappel · ${formatDateTime(r.next.dueAt)}`, tone: "soon" }
  if (r.priority === 1) return { text: "Maintenant", tone: "now" }
  return { text: r.lastContactedAt ? "Relancer" : "À découvrir", tone: "calm" }
}

/**
 * The closer's cockpit (9 November 2026, maquette « Ma journée v2 »): his day in a dark band, his call file across the
 * whole width, ranked by priority, and the fiche in a drawer from the right, on the call.
 */
export function CloserDesk({ firstName, today, initial, counts, stats, currentUserId }: {
  firstName: string | null
  today: string
  initial: LeadList
  counts: Record<FocusFilter, number>
  stats: DeskStats
  currentUserId: string
}) {
  const router = useRouter()
  const [segment, setSegment] = useState<Segment>("all")
  const [list, setList] = useState<{ rows: LeadListRow[]; total: number }>({ rows: initial.rows, total: initial.total })
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState("")
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ id: string; lead?: LeadDetail; error?: string } | null>(null)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...list.rows]
      .filter((r) => !q || [r.name, r.city, r.sector, r.contactName].some((v) => v?.toLowerCase().includes(q)))
      .sort((a, b) => a.priority - b.priority || b.score - a.score)
  }, [list.rows, query])

  const load = useCallback(async (seg: Segment) => {
    setLoading(true)
    try {
      const r = await api<LeadList>(`/api/leads?pageSize=100${seg === "all" ? "" : `&focus=${seg}`}`)
      setList({ rows: r.rows, total: r.total })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!openId) return
    let cancelled = false
    api<LeadDetail>(`/api/leads/${openId}`).then((lead) => !cancelled && setDetail({ id: openId, lead })).catch((e) => !cancelled && setDetail({ id: openId, error: e.message }))
    return () => { cancelled = true }
  }, [openId])

  function pick(seg: Segment) {
    setSegment(seg)
    load(seg).catch(() => undefined)
  }
  function changed(lead: LeadDetail) {
    setDetail({ id: lead.id, lead })
    load(segment).catch(() => undefined)
    router.refresh()
  }

  const current = detail?.id === openId ? detail : null
  const progress = Math.min(100, Math.round((stats.calls / stats.goal) * 100))

  return (
    <div className="space-y-6">
      <section aria-label="Ta journée" className="flex flex-wrap items-center gap-x-10 gap-y-6 rounded-3xl bg-sidebar px-7 py-7 text-sidebar-foreground shadow-card">
        <div className="min-w-0 flex-[1_1_340px] space-y-2">
          <p className="text-sm font-semibold capitalize text-sidebar-foreground/70">{today}</p>
          <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.035em] text-white sm:text-[30px]">
            {`Bonjour${firstName ? ` ${firstName}` : ""}, `}
            {counts.hot > 0 ? `${counts.hot} appel${counts.hot > 1 ? "s" : ""} prioritaire${counts.hot > 1 ? "s" : ""} t’attend${counts.hot > 1 ? "ent" : ""}.` : "ta file est à jour."}
          </h1>
          <p className="text-sm text-sidebar-foreground/80">Ouvre une fiche, lis pourquoi appeler, appelle, note le résultat.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="grid h-[84px] w-[84px] place-items-center rounded-full" style={{ background: `conic-gradient(hsl(var(--primary)) 0 ${progress}%, hsl(var(--sidebar-foreground) / 0.15) ${progress}% 100%)` }} role="img" aria-label={`${stats.calls} appels sur un objectif de ${stats.goal}`}>
            <div className="grid h-[66px] w-[66px] place-items-center rounded-full bg-sidebar text-center">
              <span className="text-lg font-extrabold leading-none text-white">{stats.calls}<span className="mt-0.5 block text-[11px] font-semibold text-sidebar-foreground/70">sur {stats.goal}</span></span>
            </div>
          </div>
          <span className="max-w-[120px] text-sm text-sidebar-foreground/80">Appels du jour, objectif indicatif</span>
        </div>
        <dl className="grid flex-[1_1_380px] grid-cols-3 gap-3">
          <Stat label="Joints" value={stats.reached} />
          <Stat label="Rendez-vous à venir" value={stats.meetings} />
          <Stat label="Ventes du mois" value={stats.wonThisMonth} />
        </dl>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Segments de ma file" className="flex flex-1 flex-wrap gap-2">
          {SEGMENTS.map((s) => {
            const on = segment === s.id
            const count = s.id === "all" ? initial.total : counts[s.id]
            return (
              <button key={s.id} onClick={() => pick(s.id)} aria-pressed={on} className={cn("inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-sidebar bg-sidebar text-sidebar-foreground" : "bg-card hover:bg-accent")}>
                {s.label}
                <span className={cn("rounded-full px-2 text-xs tabular-nums", on ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")}>{count}</span>
              </button>
            )
          })}
        </div>
        <label className="flex min-h-11 flex-[0_1_220px] items-center gap-2 rounded-xl border bg-card px-3.5 text-sm text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
          <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher dans ma file" aria-label="Chercher dans ma file" className="min-w-0 flex-1 bg-transparent text-foreground outline-none" />
        </label>
      </div>

      <section aria-label="File d’appels" aria-busy={loading} className={cn("overflow-hidden rounded-3xl border bg-card shadow-card transition-opacity", loading && "opacity-60")}>
        {rows.length === 0 ? (
          <div className="p-8">
            <EmptyState art="target" title={segment === "all" && !query ? "Aucune fiche ne t’est encore attribuée" : "Rien ici"} description={segment === "all" && !query ? "Ton manager t’attribue tes fiches : elles apparaîtront ici, classées par priorité." : "Change de segment ou efface la recherche."} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[940px]">
              <div className="grid grid-cols-[minmax(0,2.6fr)_150px_minmax(0,1.7fr)_170px_190px_64px] gap-4 border-b px-6 py-4 text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
                <span>Prospect</span><span>Site web</span><span>Opportunité</span><span>Avancement</span><span>Prochaine action</span><span className="sr-only">Appeler</span>
              </div>
              <ul>
                {rows.map((r) => {
                  const active = r.id === openId
                  const n = next(r)
                  const step = STEP[r.status] ?? 0
                  return (
                    <li key={r.id} className={cn("grid min-h-[76px] grid-cols-[minmax(0,2.6fr)_150px_minmax(0,1.7fr)_170px_190px_64px] items-center gap-4 border-b border-l-[3px] px-6 py-4 transition-colors last:border-b-0", active ? "border-l-info bg-info-subtle/50" : "border-l-transparent hover:bg-accent/50")}>
                      <button onClick={() => setOpenId(r.id)} className="col-span-5 grid grid-cols-subgrid items-center gap-4 text-left focus-visible:rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Ouvrir la fiche ${r.name}`}>
                        <span className="flex min-w-0 items-center gap-3.5">
                          <span aria-hidden="true" className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl text-sm font-extrabold", active ? "bg-sidebar text-primary" : "bg-secondary text-secondary-foreground")}>{initialsOf(r.name)}</span>
                          <span className="min-w-0 space-y-0.5">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="truncate text-[15px] font-bold">{r.name}</span>
                              <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-extrabold", PRIO_STYLE[r.priority])}>P{r.priority}</span>
                            </span>
                            <span className="block truncate text-sm text-muted-foreground">{[r.city, r.sector].filter(Boolean).join(" · ") || "—"}</span>
                            {r.signal && <span className="block truncate text-xs font-semibold text-info">{r.signal}</span>}
                          </span>
                        </span>
                        <span><SiteIndicator state={r.site} className="rounded-full bg-secondary/70 px-3 py-1" /></span>
                        <span className="min-w-0 space-y-0.5">
                          <span className="block truncate text-sm font-semibold">{r.offer?.name ?? "À découvrir"}</span>
                          <span className="block truncate text-sm text-muted-foreground">{r.offer?.price ?? (r.phone ? "Prépare l’appel depuis la fiche" : "Pas de téléphone")}</span>
                        </span>
                        <span className="space-y-1.5">
                          <span className="flex gap-1" aria-hidden="true">{[0, 1, 2, 3].map((i) => <span key={i} className={cn("h-1.5 w-6 rounded-full", i < step ? "bg-sidebar" : "bg-muted")} />)}</span>
                          <span className="block text-sm text-muted-foreground">{leadStatus[r.status].label}</span>
                        </span>
                        <span className={cn("truncate text-sm font-bold", n.tone === "late" ? "text-destructive-text" : n.tone === "soon" ? "text-warning" : n.tone === "now" ? "text-foreground" : "text-muted-foreground")} title={r.next?.title}>{n.text}</span>
                      </button>
                      <span className="flex justify-end">
                        {r.phone ? (
                          <a href={`tel:${r.phone}`} onClick={() => setOpenId(r.id)} aria-label={`Appeler ${r.name}`} className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            <Phone className="h-[18px] w-[18px]" aria-hidden="true" />
                          </a>
                        ) : null}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        )}
      </section>

      <Sheet open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[620px] sm:rounded-l-3xl [&>button.absolute]:hidden">
          <SheetTitle className="sr-only">{current?.lead?.company?.name ?? "Fiche prospect"}</SheetTitle>
          <SheetDescription className="sr-only">La fiche du prospect, tournée vers l’appel.</SheetDescription>
          {current?.error && <p role="alert" className="m-6 rounded-lg bg-destructive-subtle p-3 text-sm font-medium text-destructive-text">{current.error}</p>}
          {openId && !current && <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Chargement de la fiche" /></div>}
          {current?.lead && <CloserFiche key={current.lead.id} lead={current.lead} currentUserId={currentUserId} onChange={changed} onClose={() => setOpenId(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white/5 px-4 py-3.5">
      <dt className="text-xs font-semibold text-sidebar-foreground/70">{label}</dt>
      <dd className="mt-1 text-2xl font-extrabold tabular-nums text-white">{value}</dd>
    </div>
  )
}
