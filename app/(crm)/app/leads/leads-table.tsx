"use client"

import { ArrowDown, ArrowUp, ChevronsUpDown, Globe, Mail, Phone } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { StatusBadge } from "@/components/crm/status-badge"
import { leadStatus } from "@/lib/crm/status"
import { ago } from "@/lib/crm/format"
import { formatPhone } from "@/lib/crm/normalize"
import { cn } from "@/lib/utils"
import type { LeadRow } from "@/features/leads/types"
import type { LeadSort } from "@/features/leads/schemas"
import { ScoreMeter } from "./score-meter"

interface Props {
  rows: LeadRow[]
  selected: Set<string>
  onSelect: (ids: Set<string>) => void
  onOpen: (id: string) => void
  activeId?: string | null
  sort: LeadSort
  dir: "asc" | "desc"
  onSort: (sort: LeadSort) => void
}

const SORTABLE: Record<string, LeadSort> = { Prospect: "name", Statut: "status", Score: "score", "Dernier contact": "contacted" }

export function LeadsTable({ rows, selected, onSelect, onOpen, activeId, sort, dir, onSort }: Props) {
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
      <table className="w-full min-w-[920px] border-collapse text-sm">
        <caption className="sr-only">Prospects</caption>
        <thead className="bg-muted/60">
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="w-10 px-4 py-3">
              <Checkbox checked={allSelected} onCheckedChange={(on) => onSelect(new Set(on ? rows.map((r) => r.id) : []))} aria-label="Tout sélectionner sur cette page" />
            </th>
            {["Prospect", "Contact", "Statut", "Score", "Responsable", "Dernier contact"].map((label) => (
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
              <td className="max-w-[280px] px-4 py-3">
                <p className="truncate font-semibold">{r.name}</p>
                <p className="truncate text-xs text-muted-foreground">{[r.city, r.sector].filter(Boolean).join(" · ") || "—"}</p>
                {r.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.tags.slice(0, 3).map((t) => (
                      <Badge key={t} variant="outline" className="px-1.5 py-0 text-[10px]">{t}</Badge>
                    ))}
                  </div>
                )}
              </td>
              <td className="max-w-[260px] px-4 py-3">
                {r.contactName && <p className="truncate">{r.contactName}</p>}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {r.email && <span className="inline-flex min-w-0 items-center gap-1" title={r.emailKind === "NOMINATIVE" ? "Email nominatif" : r.emailKind === "GENERIC" ? "Email générique" : undefined}><Mail className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">{r.email}</span></span>}
                  {r.phone && <span className="inline-flex shrink-0 items-center gap-1"><Phone className="h-3 w-3" aria-hidden="true" />{formatPhone(r.phone)}</span>}
                  {!r.email && !r.phone && r.website && <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" aria-hidden="true" />site seul</span>}
                  {!r.email && !r.phone && !r.website && "—"}
                </div>
              </td>
              <td className="px-4 py-3"><StatusBadge map={leadStatus} value={r.status} /></td>
              <td className="px-4 py-3"><ScoreMeter score={r.score} /></td>
              <td className="px-4 py-3 text-muted-foreground">{r.ownerName ?? <span className="italic">Pool</span>}</td>
              <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{ago(r.lastContactedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
