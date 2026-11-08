"use client"

import { ArrowDown, ArrowUp, ChevronsUpDown, Globe, Mail, Phone, Radio } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { StatusBadge } from "@/components/crm/status-badge"
import { leadStatus } from "@/lib/crm/status"
import { ago, formatDateTime } from "@/lib/crm/format"
import { formatPhone } from "@/lib/crm/normalize"
import { cn } from "@/lib/utils"
import type { LeadListRow } from "@/features/leads/types"
import type { LeadSort } from "@/features/leads/schemas"
import { PriorityBadge, SiteIndicator } from "./indicators"
import { ScoreMeter } from "./score-meter"

interface Props {
  rows: LeadListRow[]
  selected: Set<string>
  onSelect: (ids: Set<string>) => void
  onOpen: (id: string) => void
  activeId?: string | null
  sort: LeadSort
  dir: "asc" | "desc"
  onSort: (sort: LeadSort) => void
  /** Hidden for those who only see their own fiches: every row would say the same name. */
  showOwner?: boolean
}

const SORTABLE: Record<string, LeadSort> = { Prospect: "name", "Statut et suivi": "status", Score: "score" }

/** The follow-up of a row: the next task when there is one, else the last contact. */
function followUp(r: LeadListRow): { text: string; late: boolean } {
  if (r.next) return { text: r.next.dueAt ? `${r.next.late ? "En retard · " : ""}${formatDateTime(r.next.dueAt)} · ${r.next.title}` : r.next.title, late: r.next.late }
  return { text: r.lastContactedAt ? `Contacté ${ago(r.lastContactedAt)}` : "Jamais contacté", late: false }
}

export function LeadsTable({ rows, selected, onSelect, onOpen, activeId, sort, dir, onSort, showOwner = true }: Props) {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const toggle = (id: string, on: boolean) => onSelect(new Set(on ? [...selected, id] : [...selected].filter((x) => x !== id)))

  function onKeyDown(event: React.KeyboardEvent<HTMLTableRowElement>, id: string) {
    if (event.target !== event.currentTarget) return
    if (event.key === "Enter") onOpen(id)
    if (event.key === " ") {
      event.preventDefault()
      toggle(id, !selected.has(id))
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      ;((event.key === "ArrowDown" ? event.currentTarget.nextElementSibling : event.currentTarget.previousElementSibling) as HTMLElement | null)?.focus()
    }
  }

  const header = (label: string) => {
    const key = SORTABLE[label]
    if (!key) return label
    const active = sort === key
    return (
      <button onClick={() => onSort(key)} className="inline-flex items-center gap-1 rounded uppercase tracking-wide hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        {label}
        {active ? dir === "asc" ? <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" aria-hidden="true" />}
      </button>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
      <table className="w-full min-w-[1000px] border-collapse text-sm">
        <caption className="sr-only">Prospects</caption>
        <thead className="bg-muted/60">
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="w-10 px-4 py-3">
              <Checkbox checked={allSelected} onCheckedChange={(on) => onSelect(new Set(on ? rows.map((r) => r.id) : []))} aria-label="Tout sélectionner sur cette page" />
            </th>
            {["Prospect", "Site", "Opportunité", "Contact", "Statut et suivi", "Score", ...(showOwner ? ["Responsable"] : [])].map((label) => (
              <th key={label} scope="col" aria-sort={SORTABLE[label] === sort ? (dir === "asc" ? "ascending" : "descending") : undefined} className="px-4 py-3">
                {header(label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr
              key={r.id}
              tabIndex={0}
              onClick={() => onOpen(r.id)}
              onKeyDown={(e) => onKeyDown(e, r.id)}
              aria-selected={selected.has(r.id)}
              className={cn(
                "cursor-pointer transition-colors hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                selected.has(r.id) && "bg-accent/40",
                activeId === r.id && "bg-accent"
              )}
            >
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={selected.has(r.id)} onCheckedChange={(on) => toggle(r.id, !!on)} aria-label={`Sélectionner ${r.name}`} />
              </td>
              <td className="max-w-[260px] px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <PriorityBadge priority={r.priority} />
                  <p className="truncate font-semibold">{r.name}</p>
                </div>
                <p className="truncate text-xs text-muted-foreground">{[r.city, r.sector].filter(Boolean).join(" · ") || "—"}</p>
                {r.signal && <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs font-medium text-info" title={r.signal}><Radio className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">{r.signal}</span></p>}
                {r.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.tags.slice(0, 3).map((t) => (
                      <Badge key={t} variant="outline" className="px-1.5 py-0 text-[10px]">{t}</Badge>
                    ))}
                  </div>
                )}
              </td>
              <td className="px-4 py-3"><SiteIndicator state={r.site} /></td>
              <td className="max-w-[190px] px-4 py-3">
                {r.offer ? (
                  <>
                    <p className="truncate font-medium" title={r.offer.name}>{r.offer.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.offer.price}</p>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">À découvrir</span>
                )}
              </td>
              {/* The closer's desk: the number first, it is what he dials; then who, then the email. */}
              <td className="max-w-[200px] px-4 py-3">
                {r.phone ? <p className="flex items-center gap-1 whitespace-nowrap font-medium tabular-nums"><Phone className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />{formatPhone(r.phone)}</p> : <p className="text-xs text-muted-foreground">Pas de téléphone</p>}
                {(r.contactName || r.email) && (
                  <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground" title={r.emailKind === "NOMINATIVE" ? "Email nominatif" : r.emailKind === "GENERIC" ? "Email générique" : undefined}>
                    {!r.contactName && <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />}
                    <span className="truncate">{r.contactName ?? r.email}</span>
                  </p>
                )}
                {!r.phone && !r.contactName && !r.email && r.website && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Globe className="h-3 w-3" aria-hidden="true" />site seul</p>}
              </td>
              <td className="max-w-[200px] px-4 py-3">
                <StatusBadge map={leadStatus} value={r.status} />
                {(() => {
                  const f = followUp(r)
                  return <p className={cn("mt-1 truncate text-xs font-medium", f.late ? "text-destructive-text" : r.next ? "text-foreground" : "text-muted-foreground")} title={r.next?.title}>{f.text}</p>
                })()}
              </td>
              <td className="px-4 py-3"><ScoreMeter score={r.score} /></td>
              {showOwner && <td className="px-4 py-3 text-muted-foreground">{r.ownerName ?? <span className="italic">Pool</span>}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
