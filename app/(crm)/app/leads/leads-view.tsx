"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/crm/empty-state"
import type { LeadFilters, LeadSort } from "@/features/leads/schemas"
import type { LeadList } from "@/features/leads/types"
import { BulkBar } from "./bulk-bar"
import { FilterBar, type Assignee } from "./filter-bar"
import { LeadPanel } from "./lead-panel"
import { LeadsTable } from "./leads-table"
import { ViewsMenu, type SavedViewDto } from "./views-menu"

interface Props {
  list: LeadList
  filters: LeadFilters
  assignees: Assignee[]
  views: SavedViewDto[]
  currentUserId: string
  canWrite: boolean
  canAssignOthers: boolean
  canShareViews: boolean
  canImport: boolean
}

const EMPTY: Set<string> = new Set()

/** Filters, sorting and paging live in the URL: a link or a saved view reproduces exactly what you see. */
export function LeadsView({ list, filters, assignees, views, currentUserId, canWrite, canAssignOthers, canShareViews, canImport }: Props) {
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
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1"><FilterBar filters={filters} assignees={assignees} canSeeOthers={canAssignOthers} onChange={update} searchRef={searchRef} /></div>
        <ViewsMenu views={views} current={filters} canShare={canShareViews} />
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground" aria-live="polite">
        <span>{list.total === 0 ? "Aucun prospect" : `${from}–${Math.min(list.total, from + list.rows.length - 1)} sur ${list.total.toLocaleString("fr-FR")} prospect${list.total > 1 ? "s" : ""}`}{pending && " · chargement…"}</span>
      </div>

      {list.rows.length === 0 ? (
        <EmptyState
          art="target"
          title={list.total === 0 && !filters.q && !filters.status.length && !filters.owner ? "Pas encore de prospects" : "Aucun prospect ne correspond"}
          description={canImport ? "Importez un fichier CSV ou ajoutez un prospect à la main. Les filtres actifs sont dans l’adresse de la page : « Effacer » les retire." : "Les filtres actifs sont dans l’adresse de la page : « Effacer » les retire."}
          action={canImport ? <Button onClick={() => router.push("/app/leads/import")}>Importer un CSV</Button> : undefined}
        />
      ) : (
        <div className={pending ? "opacity-70 transition-opacity" : "transition-opacity"}>
          <LeadsTable rows={list.rows} selected={selected} onSelect={setSelected} onOpen={setOpenId} activeId={openId} sort={filters.sort} dir={filters.dir} onSort={onSort} />
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
        <BulkBar ids={[...selected]} assignees={assignees} currentUserId={currentUserId} canAssignOthers={canAssignOthers} onDone={() => setSelected(new Set())} />
      )}
      <LeadPanel id={openId} assignees={assignees} currentUserId={currentUserId} onClose={() => setOpenId(null)} />
    </div>
  )
}
