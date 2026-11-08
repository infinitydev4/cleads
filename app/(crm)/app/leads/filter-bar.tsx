"use client"

import { useEffect, useRef, useState } from "react"
import { Flame, Globe, PhoneCall, Search, SlidersHorizontal, Sparkles, X, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { leadStatus } from "@/lib/crm/status"
import { cn } from "@/lib/utils"
import type { FocusFilter, LeadFilters } from "@/features/leads/schemas"

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
  /** E15: campaigns to filter on (empty = no filter shown). */
  campaigns: { id: string; name: string }[]
  canSeeOthers: boolean
  /** Only one's own fiches (the closer): no owner to choose. */
  ownOnly?: boolean
  /** How many fiches each segment of the call file holds. */
  focusCounts?: Record<FocusFilter, number>
  onChange: (patch: Record<string, string | undefined>) => void
  searchRef: React.RefObject<HTMLInputElement | null>
}

const ANY = "__any__"

/** The closer's desk (9 November 2026): the call file in four segments, one click each (features/leads/insights.ts). */
const SEGMENTS: { id: FocusFilter; label: string; hint: string; icon: LucideIcon }[] = [
  { id: "hot", label: "À appeler en premier", hint: "Priorité 1 : rappel du jour, réponse reçue, signal récent ou fiche forte jamais appelée.", icon: Flame },
  { id: "callback", label: "À rappeler", hint: "Une tâche prévue aujourd’hui ou en retard.", icon: PhoneCall },
  { id: "nosite", label: "Sans site", hint: "Aucun site connu : le site vitrine est l’offre évidente.", icon: Globe },
  { id: "fresh", label: "Jamais contactés", hint: "Nouvelles fiches, aucun contact encore.", icon: Sparkles },
]

export function FilterBar({ filters, assignees, campaigns, canSeeOthers, ownOnly = false, focusCounts, onChange, searchRef }: Props) {
  const [q, setQ] = useState(filters.q ?? "")
  const [more, setMore] = useState(!!(filters.city || filters.sector || filters.tag || filters.source || filters.registry || filters.minScore))
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
  const active = !!(filters.q || filters.status.length || filters.owner || filters.minScore || filters.hasEmail || filters.hasPhone || filters.city || filters.sector || filters.tag || filters.source || filters.campaign || filters.relevance || filters.registry || filters.focus)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input ref={searchRef} value={q} onChange={(e) => search(e.target.value)} placeholder="Rechercher une entreprise, une ville, un email…  ( / )" aria-label="Rechercher" className="pl-9" />
        </div>
        {!ownOnly && (
          <Select value={filters.owner ?? ANY} onValueChange={(v) => onChange({ owner: v === ANY ? undefined : v })}>
            <SelectTrigger className="w-44" aria-label="Responsable"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Tous les responsables</SelectItem>
              <SelectItem value="me">Mes fiches</SelectItem>
              <SelectItem value="none">Pool non attribué</SelectItem>
              {canSeeOthers && assignees.map((a) => <SelectItem key={a.id} value={a.id}>{personName(a)}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {(campaigns.length > 0 || filters.campaign) && (
          <Select value={filters.campaign ?? ANY} onValueChange={(v) => onChange({ campaign: v === ANY ? undefined : v })}>
            <SelectTrigger className="w-48" aria-label="Campagne"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Toutes les campagnes</SelectItem>
              <SelectItem value="none">Hors campagne</SelectItem>
              {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              {filters.campaign && filters.campaign !== "none" && !campaigns.some((c) => c.id === filters.campaign) && <SelectItem value={filters.campaign}>Campagne archivée</SelectItem>}
            </SelectContent>
          </Select>
        )}
        {/* E25: Jev's sorting of a campaign's fiches. */}
        {((filters.campaign && filters.campaign !== "none") || filters.relevance) && (
          <Select value={filters.relevance ?? ANY} onValueChange={(v) => onChange({ relevance: v === ANY ? undefined : v })}>
            <SelectTrigger className="w-44" aria-label="Pertinence (Jev)"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Toute pertinence</SelectItem>
              <SelectItem value="relevant">Pertinentes</SelectItem>
              <SelectItem value="maybe">Possibles</SelectItem>
              <SelectItem value="not">Non pertinentes</SelectItem>
              <SelectItem value="pending">À trancher</SelectItem>
              <SelectItem value="unsorted">Pas encore triées</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Button variant={more ? "secondary" : "outline"} onClick={() => setMore(!more)} aria-expanded={more}>
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Filtres
        </Button>
        {active && (
          <Button variant="ghost" onClick={() => { setQ(""); onChange({ q: undefined, status: undefined, owner: undefined, minScore: undefined, hasEmail: undefined, hasPhone: undefined, city: undefined, sector: undefined, tag: undefined, source: undefined, campaign: undefined, relevance: undefined, registry: undefined, focus: undefined }) }}>
            <X className="h-4 w-4" aria-hidden="true" /> Effacer
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="File d’appels">
        {SEGMENTS.map((s) => {
          const on = filters.focus === s.id
          const count = focusCounts?.[s.id]
          return (
            <button
              key={s.id}
              onClick={() => onChange({ focus: on ? undefined : s.id })}
              aria-pressed={on}
              title={s.hint}
              className={cn(
                "inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "border-transparent bg-sidebar text-sidebar-foreground" : "bg-card hover:bg-accent"
              )}
            >
              <s.icon className="h-4 w-4" aria-hidden="true" />
              {s.label}
              {count != null && <span className={cn("rounded-full px-1.5 text-xs tabular-nums", on ? "bg-sidebar-accent" : "bg-secondary")}>{count.toLocaleString("fr-FR")}</span>}
            </button>
          )
        })}
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
          {/* E30: what the registry and the BODACC say. */}
          <label className="space-y-1 text-sm font-medium">Registre et signaux
            <Select value={filters.registry ?? ANY} onValueChange={(v) => onChange({ registry: v === ANY ? undefined : v })}>
              <SelectTrigger aria-label="Registre et signaux"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Tout le registre</SelectItem>
                <SelectItem value="new">Créées depuis moins de 6 mois</SelectItem>
                <SelectItem value="signal">Signal récent (30 jours)</SelectItem>
                <SelectItem value="takeover">Reprise ou nouveau dirigeant</SelectItem>
                <SelectItem value="blocked">Procédure ou radiée</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-sm font-medium">Score minimum
            <Select value={String(filters.minScore ?? ANY)} onValueChange={(v) => onChange({ minScore: v === ANY ? undefined : v })}>
              <SelectTrigger aria-label="Score minimum"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Tous scores</SelectItem>
                <SelectItem value="40">Score ≥ 40</SelectItem>
                <SelectItem value="70">Score ≥ 70</SelectItem>
              </SelectContent>
            </Select>
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
