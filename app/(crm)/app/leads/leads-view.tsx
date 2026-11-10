"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/crm/empty-state"
import type { FocusFilter, LeadFilters, LeadSort } from "@/features/leads/schemas"
import type { LeadList } from "@/features/leads/types"
import { BulkBar } from "./bulk-bar"
import { FilterBar, type Assignee } from "./filter-bar"
import { LeadPanel } from "./lead-panel"
import { LeadsTable } from "./leads-table"
import { ViewsMenu, type SavedViewDto } from "./views-menu"
import type { LeadDetail } from "@/features/leads/types"
import { api } from "./api"
import { CallFileList, CloserSheet } from "../call-file"

interface Props {
  list: LeadList
  filters: LeadFilters
  assignees: Assignee[]
  campaigns: { id: string; name: string }[]
  views: SavedViewDto[]
  currentUserId: string
  canWrite: boolean
  canAssignOthers: boolean
  canShareViews: boolean
  canImport: boolean
  canSequence: boolean
  canCampaign: boolean
  /** Only one's own fiches (the closer): no owner filter nor column. */
  ownOnly?: boolean
  focusCounts?: Record<FocusFilter, number>
  countries?: { code: string; count: number }[]
}

const EMPTY: Set<string> = new Set()

/** Filters, sorting and paging live in the URL: a link or a saved view reproduces exactly what you see. */
export function LeadsView({ list, filters, assignees, campaigns, views, currentUserId, canWrite, canAssignOthers, canShareViews, canImport, canSequence, canCampaign, ownOnly = false, focusCounts, countries }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  // The selection belongs to the page of results it was made on: a new page starts with nothing selected,
  // so a bulk action can never apply to rows you cannot see.
  const listKey = list.rows.map((r) => r.id).join(",")
  const [selection, setSelection] = useState<{ key: string; ids: Set<string> }>({ key: "", ids: new Set() })
  const selected = selection.key === listKey ? selection.ids : EMPTY
  const setSelected = (ids: Set<string>) => setSelection({ key: listKey, ids })
  const [openId, setOpenId] = useState<string | null>(null)
  // The closer's list (maquette « Mes prospects v2 »): the rows and the fiche of « Ma journée ».
  const [autoCallId, setAutoCallId] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ id: string; lead?: LeadDetail; error?: string } | null>(null)
  useEffect(() => {
    if (!ownOnly || !openId) return
    let cancelled = false
    api<LeadDetail>(`/api/leads/${openId}`).then((lead) => !cancelled && setDetail({ id: openId, lead })).catch((e) => !cancelled && setDetail({ id: openId, error: e.message }))
    return () => { cancelled = true }
  }, [ownOnly, openId])
  const current = detail?.id === openId ? detail : null
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName) || (e.target as HTMLElement).isContentEditable
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if (e.key === "c" && !typing && !e.metaKey && !e.ctrlKey && canWrite) router.push("/app/leads/new")
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [canWrite, router])

  function update(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    if (!("page" in patch)) next.delete("page")
    startTransition(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }))
  }
  const onSort = (sort: LeadSort) => update({ sort, dir: filters.sort === sort ? (filters.dir === "asc" ? "desc" : "asc") : sort === "name" ? "asc" : "desc" })
  const from = (list.page - 1) * list.pageSize + 1

  return (
    <div className="space-y-4">
      {ownOnly && focusCounts && (
        <dl aria-label="Ma base" className="grid grid-cols-2 gap-3 rounded-3xl bg-sidebar p-5 text-sidebar-foreground shadow-card lg:grid-cols-4">
          {([["À appeler en premier", focusCounts.hot], ["À rappeler", focusCounts.callback], ["Sans site", focusCounts.nosite], ["Jamais contactées", focusCounts.fresh]] as const).map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-white/5 px-4 py-3.5">
              <dt className="text-xs font-semibold text-sidebar-foreground/70">{label}</dt>
              <dd className="mt-1 text-[26px] font-extrabold tabular-nums text-white">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <FilterBar filters={filters} assignees={assignees} campaigns={campaigns} canSeeOthers={canAssignOthers} ownOnly={ownOnly} focusCounts={focusCounts} countries={countries} onChange={update} searchRef={searchRef} extra={<ViewsMenu views={views} current={filters} canShare={canShareViews} />} />

      <div className="flex items-center justify-between text-sm text-muted-foreground" aria-live="polite">
        <span>{list.total === 0 ? "Aucun prospect" : `${from}–${Math.min(list.total, from + list.rows.length - 1)} sur ${list.total.toLocaleString("fr-FR")} prospect${list.total > 1 ? "s" : ""}`}{pending && " · chargement…"}</span>
      </div>

      {list.rows.length === 0 ? (
        <EmptyState
          art="target"
          title={list.total === 0 && !filters.q && !filters.status.length && !filters.owner && !filters.focus ? (ownOnly ? "Aucune fiche ne t’est encore attribuée" : "Pas encore de prospects") : "Aucun prospect ne correspond"}
          description={canImport ? "Importez un fichier CSV ou ajoutez un prospect à la main. Les filtres actifs sont dans l’adresse de la page : « Effacer » les retire." : "Les filtres actifs sont dans l’adresse de la page : « Effacer » les retire."}
          action={canImport ? <Button onClick={() => router.push("/app/leads/import")}>Importer un CSV</Button> : undefined}
        />
      ) : (
        <div className={pending ? "opacity-70 transition-opacity" : "transition-opacity"}>
          {ownOnly ? (
            <section aria-label="Mes fiches" className="overflow-hidden rounded-3xl border bg-card shadow-card">
              <CallFileList rows={list.rows} activeId={openId} onOpen={setOpenId} onCall={(id) => { setAutoCallId(id); setOpenId(id) }} selected={canWrite ? selected : undefined} onSelect={canWrite ? setSelected : undefined} />
            </section>
          ) : (
            <LeadsTable rows={list.rows} selected={selected} onSelect={setSelected} onOpen={setOpenId} activeId={openId} sort={filters.sort} dir={filters.dir} onSort={onSort} showOwner={!ownOnly} />
          )}
        </div>
      )}

      {list.pageCount > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={list.page <= 1} onClick={() => update({ page: String(list.page - 1) })}><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Précédent</Button>
          <span className="text-sm tabular-nums">Page {list.page} / {list.pageCount}</span>
          <Button variant="outline" size="sm" disabled={list.page >= list.pageCount} onClick={() => update({ page: String(list.page + 1) })}>Suivant <ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>
        </nav>
      )}

      {canWrite && selected.size > 0 && (
        <BulkBar ids={[...selected]} assignees={assignees} campaigns={campaigns} currentUserId={currentUserId} canAssignOthers={canAssignOthers} canSequence={canSequence} canCampaign={canCampaign} onDone={() => setSelected(new Set())} />
      )}
      {ownOnly ? (
        <CloserSheet openId={openId} lead={current?.lead ?? null} error={current?.error ?? null} currentUserId={currentUserId} autoCall={!!autoCallId && autoCallId === openId} onChange={(lead) => { setDetail({ id: lead.id, lead }); router.refresh() }} onClose={() => { setOpenId(null); setAutoCallId(null) }} />
      ) : (
        <LeadPanel id={openId} assignees={assignees} currentUserId={currentUserId} onClose={() => setOpenId(null)} />
      )}
    </div>
  )
}
