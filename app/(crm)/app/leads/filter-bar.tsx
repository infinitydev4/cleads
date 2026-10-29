"use client"

import { useEffect, useRef, useState } from "react"
import { Search, SlidersHorizontal, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { leadStatus } from "@/lib/crm/status"
import { cn } from "@/lib/utils"
import type { LeadFilters } from "@/features/leads/schemas"

export interface Assignee {
  id: string
  name: string | null
  email: string | null
  role: string
}
export const personName = (a: Pick<Assignee, "name" | "email">) => a.name ?? a.email ?? "?"

interface Props {
  filters: LeadFilters
  assignees: Assignee[]
  canSeeOthers: boolean
  onChange: (patch: Record<string, string | undefined>) => void
  searchRef: React.RefObject<HTMLInputElement | null>
}

const ANY = "__any__"

export function FilterBar({ filters, assignees, canSeeOthers, onChange, searchRef }: Props) {
  const [q, setQ] = useState(filters.q ?? "")
  const [more, setMore] = useState(!!(filters.city || filters.sector || filters.tag || filters.source))
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // The URL is the source of truth: follow it when a saved view or the back button changes it.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronising local input state with an external value is the purpose of this effect
  useEffect(() => setQ(filters.q ?? ""), [filters.q])
  useEffect(() => () => clearTimeout(timer.current), [])

  const search = (value: string) => {
    setQ(value)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => onChange({ q: value || undefined }), 300)
  }
  const toggleStatus = (s: string) => {
    const next = filters.status.includes(s as never) ? filters.status.filter((x) => x !== s) : [...filters.status, s as never]
    onChange({ status: next.join(",") || undefined })
  }
  const active = !!(filters.q || filters.status.length || filters.owner || filters.minScore || filters.hasEmail || filters.hasPhone || filters.city || filters.sector || filters.tag || filters.source)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input ref={searchRef} value={q} onChange={(e) => search(e.target.value)} placeholder="Rechercher une entreprise, une ville, un email…  ( / )" aria-label="Rechercher" className="pl-9" />
        </div>
        <Select value={filters.owner ?? ANY} onValueChange={(v) => onChange({ owner: v === ANY ? undefined : v })}>
          <SelectTrigger className="w-44" aria-label="Responsable"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Tous les responsables</SelectItem>
            <SelectItem value="me">Mes fiches</SelectItem>
            <SelectItem value="none">Pool non attribué</SelectItem>
            {canSeeOthers && assignees.map((a) => <SelectItem key={a.id} value={a.id}>{personName(a)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(filters.minScore ?? ANY)} onValueChange={(v) => onChange({ minScore: v === ANY ? undefined : v })}>
          <SelectTrigger className="w-36" aria-label="Score minimum"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Tous scores</SelectItem>
            <SelectItem value="40">Score ≥ 40</SelectItem>
            <SelectItem value="70">Score ≥ 70</SelectItem>
          </SelectContent>
        </Select>
        <Button variant={more ? "secondary" : "outline"} onClick={() => setMore(!more)} aria-expanded={more}>
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Filtres
        </Button>
        {active && (
          <Button variant="ghost" onClick={() => { setQ(""); onChange({ q: undefined, status: undefined, owner: undefined, minScore: undefined, hasEmail: undefined, hasPhone: undefined, city: undefined, sector: undefined, tag: undefined, source: undefined }) }}>
            <X className="h-4 w-4" aria-hidden="true" /> Effacer
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Statut">
        {Object.entries(leadStatus).map(([key, meta]) => {
          const on = filters.status.includes(key as never)
          return (
            <button key={key} onClick={() => toggleStatus(key)} aria-pressed={on} className={cn("rounded-full border px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-transparent bg-sidebar text-sidebar-foreground" : "bg-card hover:bg-accent")}>
              {meta.label}
            </button>
          )
        })}
      </div>

      {more && (
        <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm font-medium">Ville
            <Input defaultValue={filters.city} onBlur={(e) => onChange({ city: e.target.value || undefined })} onKeyDown={(e) => e.key === "Enter" && onChange({ city: e.currentTarget.value || undefined })} />
          </label>
          <label className="space-y-1 text-sm font-medium">Secteur
            <Input defaultValue={filters.sector} onBlur={(e) => onChange({ sector: e.target.value || undefined })} onKeyDown={(e) => e.key === "Enter" && onChange({ sector: e.currentTarget.value || undefined })} />
          </label>
          <label className="space-y-1 text-sm font-medium">Étiquette
            <Input defaultValue={filters.tag} onBlur={(e) => onChange({ tag: e.target.value || undefined })} onKeyDown={(e) => e.key === "Enter" && onChange({ tag: e.currentTarget.value || undefined })} />
          </label>
          <div className="space-y-2 text-sm">
            <p className="font-medium">Coordonnées</p>
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!filters.hasEmail} onChange={(e) => onChange({ hasEmail: e.target.checked ? "1" : undefined })} /> Avec email</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!filters.hasPhone} onChange={(e) => onChange({ hasPhone: e.target.checked ? "1" : undefined })} /> Avec téléphone</label>
          </div>
        </div>
      )}
    </div>
  )
}
