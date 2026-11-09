"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronDown, Flame, Globe, PhoneCall, Search, Sparkles, type LucideIcon } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { leadStatus } from "@/lib/crm/status"
import { COUNTRY_CODES, countryName, foldText } from "@/lib/crm/countries"
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
  /** The countries of the person's fiches, with how many each. */
  countries?: { code: string; count: number }[]
  onChange: (patch: Record<string, string | undefined>) => void
  searchRef: React.RefObject<HTMLInputElement | null>
  /** Beside the search: the saved views. */
  extra?: React.ReactNode
}

/** The closer's desk (9 November 2026): the call file in four segments, one click each (features/leads/insights.ts). */
const SEGMENTS: { id: FocusFilter; label: string; hint: string; icon: LucideIcon }[] = [
  { id: "hot", label: "À appeler en premier", hint: "Priorité 1 : rappel du jour, réponse reçue, signal récent ou fiche forte jamais appelée.", icon: Flame },
  { id: "callback", label: "À rappeler", hint: "Une tâche prévue aujourd’hui ou en retard.", icon: PhoneCall },
  { id: "nosite", label: "Sans site", hint: "Aucun vrai site : rien, ou seulement une page Facebook, Instagram ou d’annuaire.", icon: Globe },
  { id: "fresh", label: "Jamais contactés", hint: "Nouvelles fiches, aucun contact encore.", icon: Sparkles },
]

const SITE_OPTIONS = [["nosite", "Sans vrai site"], ["social", "Réseaux seulement"], ["real", "Avec un site"]] as const
const SCORE_OPTIONS = [["40", "Score ≥ 40"], ["70", "Score ≥ 70"]] as const
const REGISTRY_OPTIONS = [["new", "Créées depuis moins de 6 mois"], ["signal", "Signal récent (30 jours)"], ["takeover", "Reprise ou nouveau dirigeant"], ["blocked", "Procédure ou radiée"]] as const
const RELEVANCE_OPTIONS = [["relevant", "Pertinentes"], ["maybe", "Possibles"], ["not", "Non pertinentes"], ["pending", "À trancher"], ["unsorted", "Pas encore triées"]] as const

/**
 * The list's filters (9 November 2026, maquette « 8 · filtres et pays »): one card; the search, the call-file segments,
 * then one pill per filter that shows its value and opens a small panel. Everything lives in the URL.
 */
export function FilterBar({ filters, assignees, campaigns, canSeeOthers, ownOnly = false, focusCounts, countries = [], onChange, searchRef, extra }: Props) {
  const [q, setQ] = useState(filters.q ?? "")
  const [open, setOpen] = useState<string | null>(null)
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
  const set = (patch: Record<string, string | undefined>) => {
    onChange(patch)
    setOpen(null)
  }
  const toggleStatus = (s: string) => {
    const next = filters.status.includes(s as never) ? filters.status.filter((x) => x !== s) : [...filters.status, s as never]
    onChange({ status: next.join(",") || undefined })
  }
  const active = !!(filters.q || filters.status.length || filters.owner || filters.minScore || filters.hasEmail || filters.hasPhone || filters.city || filters.sector || filters.tag || filters.source || filters.campaign || filters.relevance || filters.registry || filters.focus || filters.country || filters.site)
  const clearAll = () => {
    setQ("")
    set({ q: undefined, status: undefined, owner: undefined, minScore: undefined, hasEmail: undefined, hasPhone: undefined, city: undefined, sector: undefined, tag: undefined, source: undefined, campaign: undefined, relevance: undefined, registry: undefined, focus: undefined, country: undefined, site: undefined })
  }
  const pill = (id: string) => ({ open: open === id, onToggle: () => setOpen(open === id ? null : id), onClose: () => setOpen(null) })
  const statusLabel = filters.status.length === 0 ? "Tous" : filters.status.length === 1 ? leadStatus[filters.status[0]].label : `${filters.status.length} statuts`
  const ownerLabel = !filters.owner ? "Tous" : filters.owner === "me" ? "Mes fiches" : filters.owner === "none" ? "Pool" : personName(assignees.find((a) => a.id === filters.owner) ?? { name: "Un membre", email: null })
  const contactLabel = [filters.hasEmail && "Email", filters.hasPhone && "Téléphone"].filter(Boolean).join(" + ") || "Toutes"

  return (
    <section aria-label="Filtres" className="space-y-3.5 rounded-3xl border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="flex min-h-12 min-w-[240px] flex-1 items-center gap-2.5 rounded-2xl bg-muted/60 px-4 text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
          <Search className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
          <input ref={searchRef} type="search" value={q} onChange={(e) => search(e.target.value)} placeholder="Entreprise, ville, téléphone, email…" aria-label="Rechercher" className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0" />
          <kbd className="hidden rounded-md border bg-card px-1.5 py-0.5 text-[11px] sm:inline">/</kbd>
        </label>
        {extra}
      </div>

      <div role="group" aria-label="File d’appels" className="flex flex-wrap gap-2">
        {SEGMENTS.map((s) => {
          const on = filters.focus === s.id
          const count = focusCounts?.[s.id]
          return (
            <button key={s.id} onClick={() => onChange({ focus: on ? undefined : s.id })} aria-pressed={on} title={s.hint} className={cn("inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-sidebar bg-sidebar text-sidebar-foreground" : "bg-card hover:bg-accent")}>
              <s.icon className="h-4 w-4" aria-hidden="true" />
              {s.label}
              {count != null && <span className={cn("rounded-full px-2 text-xs tabular-nums", on ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")}>{count.toLocaleString("fr-FR")}</span>}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-3.5">
        <FilterPill label="Pays" value={filters.country ? countryName(filters.country) : "Tous"} active={!!filters.country} {...pill("country")}>
          <CountryPicker value={filters.country} counts={countries} onPick={(country) => set({ country })} />
        </FilterPill>
        <FilterPill label="Ville" value={filters.city ?? "Toutes"} active={!!filters.city} {...pill("city")}>
          <TextFilter label="Ville" value={filters.city} placeholder="Nantes" onApply={(city) => set({ city })} />
        </FilterPill>
        <FilterPill label="Métier" value={filters.sector ?? "Tous"} active={!!filters.sector} {...pill("sector")}>
          <TextFilter label="Métier ou secteur" value={filters.sector} placeholder="électricien" onApply={(sector) => set({ sector })} />
        </FilterPill>
        <FilterPill label="Site web" value={SITE_OPTIONS.find(([v]) => v === filters.site)?.[1] ?? "Tous"} active={!!filters.site} {...pill("site")}>
          <Options value={filters.site} all="Tous les sites" options={SITE_OPTIONS} onPick={(site) => set({ site })} />
        </FilterPill>
        <FilterPill label="Statut" value={statusLabel} active={filters.status.length > 0} {...pill("status")}>
          <div className="space-y-0.5">
            {Object.entries(leadStatus).map(([key, meta]) => (
              <label key={key} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2.5 text-sm font-medium hover:bg-accent">
                <Checkbox checked={filters.status.includes(key as never)} onCheckedChange={() => toggleStatus(key)} /> {meta.label}
              </label>
            ))}
          </div>
        </FilterPill>
        <FilterPill label="Score" value={SCORE_OPTIONS.find(([v]) => v === String(filters.minScore))?.[1] ?? "Tous"} active={!!filters.minScore} {...pill("score")}>
          <Options value={filters.minScore ? String(filters.minScore) : undefined} all="Tous les scores" options={SCORE_OPTIONS} onPick={(minScore) => set({ minScore })} />
        </FilterPill>
        <FilterPill label="Registre" value={REGISTRY_OPTIONS.find(([v]) => v === filters.registry)?.[1] ?? "Tout"} active={!!filters.registry} {...pill("registry")}>
          <Options value={filters.registry} all="Tout le registre" options={REGISTRY_OPTIONS} onPick={(registry) => set({ registry })} />
        </FilterPill>
        <FilterPill label="Coordonnées" value={contactLabel} active={!!(filters.hasEmail || filters.hasPhone)} {...pill("contact")}>
          <div className="space-y-0.5">
            <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2.5 text-sm font-medium hover:bg-accent"><Checkbox checked={!!filters.hasEmail} onCheckedChange={(v) => onChange({ hasEmail: v ? "1" : undefined })} /> Avec email</label>
            <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2.5 text-sm font-medium hover:bg-accent"><Checkbox checked={!!filters.hasPhone} onCheckedChange={(v) => onChange({ hasPhone: v ? "1" : undefined })} /> Avec téléphone</label>
          </div>
        </FilterPill>
        <FilterPill label="Étiquette" value={filters.tag ?? "Toutes"} active={!!filters.tag} {...pill("tag")}>
          <TextFilter label="Étiquette" value={filters.tag} placeholder="a-rappeler" onApply={(tag) => set({ tag })} />
        </FilterPill>
        {!ownOnly && (
          <FilterPill label="Responsable" value={ownerLabel} active={!!filters.owner} {...pill("owner")}>
            <Options value={filters.owner} all="Tous les responsables" options={[["me", "Mes fiches"], ["none", "Pool non attribué"], ...(canSeeOthers ? assignees.map((a) => [a.id, personName(a)] as const) : [])]} onPick={(owner) => set({ owner })} />
          </FilterPill>
        )}
        {(campaigns.length > 0 || filters.campaign) && (
          <FilterPill label="Campagne" value={filters.campaign === "none" ? "Hors campagne" : campaigns.find((c) => c.id === filters.campaign)?.name ?? (filters.campaign ? "Archivée" : "Toutes")} active={!!filters.campaign} {...pill("campaign")}>
            <Options value={filters.campaign} all="Toutes les campagnes" options={[["none", "Hors campagne"], ...campaigns.map((c) => [c.id, c.name] as const)]} onPick={(campaign) => set({ campaign })} />
          </FilterPill>
        )}
        {/* E25: Jev's sorting of a campaign's fiches. */}
        {((filters.campaign && filters.campaign !== "none") || filters.relevance) && (
          <FilterPill label="Pertinence" value={RELEVANCE_OPTIONS.find(([v]) => v === filters.relevance)?.[1] ?? "Toute"} active={!!filters.relevance} {...pill("relevance")}>
            <Options value={filters.relevance} all="Toute pertinence" options={RELEVANCE_OPTIONS} onPick={(relevance) => set({ relevance })} />
          </FilterPill>
        )}
        {active && (
          <button onClick={clearAll} className="ml-auto min-h-10 rounded-lg px-3 text-sm font-bold text-info hover:bg-info-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Tout effacer</button>
        )}
      </div>
    </section>
  )
}

/** A filter as a pill that shows its value; its panel opens below, closes on Escape or a click elsewhere. */
function FilterPill({ label, value, active, open, onToggle, onClose, children }: { label: string; value: string; active: boolean; open: boolean; onToggle: () => void; onClose: () => void; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose })
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) close.current() }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { close.current(); button.current?.focus() } }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    // The panel's first field takes the focus once, when it opens, so the keyboard goes straight to it.
    const frame = requestAnimationFrame(() => box.current?.querySelector<HTMLElement>("[data-panel] input, [data-panel] button")?.focus())
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])
  return (
    <div ref={box} className="relative">
      <button
        ref={button}
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "inline-flex min-h-10 items-center gap-2 rounded-xl border pl-3.5 pr-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active ? "border-info/40 bg-info-subtle" : open ? "border-sidebar bg-card" : "bg-card hover:bg-accent"
        )}
      >
        <span className="font-semibold text-muted-foreground">{label}</span>
        <span className={cn("max-w-[160px] truncate font-bold", active ? "text-info" : "text-foreground")}>{value}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <div data-panel role="dialog" aria-label={label} className="absolute left-0 top-full z-30 mt-2 w-[min(340px,calc(100vw-2rem))] rounded-2xl border bg-card p-2.5 shadow-[0_20px_50px_rgba(11,20,48,0.18)]">
          {children}
        </div>
      )}
    </div>
  )
}

function Options({ value, all, options, onPick }: { value: string | undefined; all: string; options: readonly (readonly [string, string])[]; onPick: (v: string | undefined) => void }) {
  return (
    <div className="max-h-80 space-y-0.5 overflow-y-auto">
      {[[undefined, all] as const, ...options].map(([v, label]) => {
        const on = value === v
        return (
          <button key={v ?? "_all"} onClick={() => onPick(v)} aria-pressed={on} className={cn("flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "bg-info-subtle font-bold" : "font-medium")}>
            <Check className={cn("h-4 w-4 shrink-0", on ? "opacity-100" : "opacity-0")} aria-hidden="true" />
            <span className="truncate">{label}</span>
          </button>
        )
      })}
    </div>
  )
}

function TextFilter({ label, value, placeholder, onApply }: { label: string; value: string | undefined; placeholder: string; onApply: (v: string | undefined) => void }) {
  const [text, setText] = useState(value ?? "")
  return (
    <form className="space-y-2.5 p-1" onSubmit={(e) => { e.preventDefault(); onApply(text.trim() || undefined) }}>
      <label className="block space-y-1.5 text-sm font-bold">{label}
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className="block min-h-11 w-full rounded-xl border bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </label>
      <div className="flex justify-end gap-2">
        {value && <button type="button" onClick={() => onApply(undefined)} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:bg-accent">Effacer</button>}
        <button type="submit" className="min-h-10 rounded-lg bg-sidebar px-4 text-sm font-bold text-sidebar-foreground hover:bg-sidebar/90">Appliquer</button>
      </div>
    </form>
  )
}

/** Every country of the world, those of the person's fiches first with their count; searchable, accents aside. */
function CountryPicker({ value, counts, onPick }: { value: string | undefined; counts: { code: string; count: number }[]; onPick: (code: string | undefined) => void }) {
  const [query, setQuery] = useState("")
  const list = useMemo(() => {
    const known = new Map(counts.map((c) => [c.code, c.count]))
    const rest = COUNTRY_CODES.filter((c) => !known.has(c)).map((code) => ({ code, count: 0 })).sort((a, b) => countryName(a.code).localeCompare(countryName(b.code), "fr"))
    const all = [...counts.filter((c) => c.count > 0), ...rest]
    const q = foldText(query.trim())
    return q ? all.filter((c) => foldText(countryName(c.code)).includes(q) || c.code.toLowerCase() === q) : all
  }, [counts, query])
  const mine = counts.filter((c) => c.count > 0).length
  return (
    <div className="space-y-2">
      <label className="flex min-h-11 items-center gap-2 rounded-xl bg-muted/60 px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher un pays" aria-label="Chercher un pays" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none focus-visible:outline-none focus-visible:ring-0" />
      </label>
      <div className="max-h-80 space-y-0.5 overflow-y-auto">
        {!query && (
          <button onClick={() => onPick(undefined)} aria-pressed={!value} className={cn("flex min-h-10 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm hover:bg-accent", !value ? "bg-info-subtle font-bold" : "font-medium")}>
            <span className="grid h-6 w-9 place-items-center rounded-md bg-secondary text-[11px] font-extrabold">—</span>Tous les pays
          </button>
        )}
        {list.map((c, i) => {
          const on = value === c.code
          return (
            <div key={c.code}>
              {!query && i === mine && mine > 0 && <p className="px-2.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground">Tous les pays</p>}
              {!query && i === 0 && mine > 0 && <p className="px-2.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground">Dans tes fiches</p>}
              <button onClick={() => onPick(c.code)} aria-pressed={on} className={cn("flex min-h-10 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "bg-info-subtle font-bold" : "font-medium")}>
                <span className="grid h-6 w-9 shrink-0 place-items-center rounded-md bg-secondary text-[11px] font-extrabold text-secondary-foreground">{c.code}</span>
                <span className="flex-1 truncate">{countryName(c.code)}</span>
                {c.count > 0 && <span className="text-xs tabular-nums text-muted-foreground">{c.count.toLocaleString("fr-FR")}</span>}
              </button>
            </div>
          )
        })}
        {list.length === 0 && <p className="px-2.5 py-3 text-sm text-muted-foreground">Aucun pays ne correspond.</p>}
      </div>
    </div>
  )
}
