"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { EmptyState } from "@/components/crm/empty-state"
import { cn } from "@/lib/utils"
import type { FocusFilter } from "@/features/leads/schemas"
import type { LeadDetail, LeadList, LeadListRow } from "@/features/leads/types"
import type { DeskStats } from "@/features/leads/desk"
import { api } from "./leads/api"
import { CallFileList, CloserSheet } from "./call-file"

type Segment = "all" | FocusFilter

const SEGMENTS: { id: Segment; label: string }[] = [
  { id: "all", label: "Toute ma file" },
  { id: "hot", label: "À appeler en premier" },
  { id: "callback", label: "À rappeler" },
  { id: "nosite", label: "Sans site" },
  { id: "fresh", label: "Jamais contactés" },
]

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
  // E32 lot 2: with a line in the browser, the row's phone opens the fiche and dials from there.
  const [autoCallId, setAutoCallId] = useState<string | null>(null)
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
          <CallFileList rows={rows} activeId={openId} onOpen={setOpenId} onCall={(id) => { setAutoCallId(id); setOpenId(id) }} />
        )}
      </section>

      <CloserSheet openId={openId} lead={current?.lead ?? null} error={current?.error ?? null} currentUserId={currentUserId} autoCall={!!autoCallId && autoCallId === openId} onChange={changed} onClose={() => { setOpenId(null); setAutoCallId(null) }} />
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
