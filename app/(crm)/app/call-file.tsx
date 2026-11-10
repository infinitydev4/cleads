"use client"

import { Loader2, Phone } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { useWebphone } from "@/components/crm/webphone/webphone-provider"
import { formatDateTime } from "@/lib/crm/format"
import { leadStatus } from "@/lib/crm/status"
import { cn } from "@/lib/utils"
import type { LeadDetail, LeadListRow } from "@/features/leads/types"
import { SiteIndicator } from "./leads/indicators"
import { CloserFiche, initialsOf } from "./closer-fiche"

/** Where a fiche stands on the way to a meeting: contacted, answered, qualified (the fourth step is the meeting). */
const STEP: Record<string, number> = { NEW: 0, CONTACTED: 1, REPLIED: 2, QUALIFIED: 3, DISQUALIFIED: 0, DO_NOT_CONTACT: 0 }

const PRIO_STYLE = { 1: "bg-warning-subtle text-warning", 2: "bg-info-subtle text-info", 3: "bg-secondary text-muted-foreground" } as const

function next(r: LeadListRow): { text: string; tone: "late" | "soon" | "now" | "calm" } {
  if (r.next?.dueAt) return r.next.late ? { text: `En retard · ${formatDateTime(r.next.dueAt)}`, tone: "late" } : { text: `Rappel · ${formatDateTime(r.next.dueAt)}`, tone: "soon" }
  if (r.priority === 1) return { text: "Maintenant", tone: "now" }
  return { text: r.lastContactedAt ? "Relancer" : "À découvrir", tone: "calm" }
}

/**
 * The closer's call file (maquettes « Ma journée v2 » and « Mes prospects v2 »): a full-width row per fiche, its site,
 * its offer, how far it went, what to do next, and the phone. With `selected`, a box per row for bulk actions.
 */
export function CallFileList({ rows, activeId, onOpen, onCall, selected, onSelect }: {
  rows: LeadListRow[]
  activeId: string | null
  onOpen: (id: string) => void
  /** Opens the fiche and dials from it (phone in the browser). */
  onCall: (id: string) => void
  selected?: Set<string>
  onSelect?: (ids: Set<string>) => void
}) {
  const web = useWebphone()
  const selectable = !!selected && !!onSelect
  const cols = selectable ? "grid-cols-[28px_minmax(0,2.6fr)_150px_minmax(0,1.7fr)_170px_190px_64px]" : "grid-cols-[minmax(0,2.6fr)_150px_minmax(0,1.7fr)_170px_190px_64px]"
  const all = selectable && rows.length > 0 && rows.every((r) => selected.has(r.id))

  return (
    <div className="overflow-x-auto">
      <div className={selectable ? "min-w-[980px]" : "min-w-[940px]"}>
        <div className={cn("grid gap-4 border-b px-6 py-4 text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground", cols)}>
          {selectable && <Box checked={all} label="Tout sélectionner" onChange={(v) => onSelect(v ? new Set(rows.map((r) => r.id)) : new Set())} />}
          <span>Prospect</span><span>Site web</span><span>Opportunité</span><span>Avancement</span><span>Prochaine action</span><span className="sr-only">Appeler</span>
        </div>
        <ul>
          {rows.map((r) => {
            const active = r.id === activeId
            const picked = selectable && selected.has(r.id)
            const n = next(r)
            const step = STEP[r.status] ?? 0
            return (
              <li key={r.id} className={cn("grid min-h-[76px] items-center gap-4 border-b border-l-[3px] px-6 py-4 transition-colors last:border-b-0", cols, active ? "border-l-info bg-info-subtle/50" : picked ? "border-l-transparent bg-accent/60" : "border-l-transparent hover:bg-accent/50")}>
                {selectable && (
                  <Box checked={picked} label={`Sélectionner ${r.name}`} onChange={(v) => { const ids = new Set(selected); if (v) ids.add(r.id); else ids.delete(r.id); onSelect(ids) }} />
                )}
                <button onClick={() => onOpen(r.id)} className="col-span-5 grid grid-cols-subgrid items-center gap-4 text-left focus-visible:rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Ouvrir la fiche ${r.name}`}>
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
                    web?.phase === "ready" ? (
                      <button onClick={() => onCall(r.id)} aria-label={`Appeler ${r.name}`} className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <Phone className="h-[18px] w-[18px]" aria-hidden="true" />
                      </button>
                    ) : (
                      <a href={`tel:${r.phone}`} onClick={() => onOpen(r.id)} aria-label={`Appeler ${r.name}`} className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <Phone className="h-[18px] w-[18px]" aria-hidden="true" />
                      </a>
                    )
                  ) : null}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function Box({ checked, label, onChange }: { checked: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cn("grid h-[22px] w-[22px] place-items-center rounded-[7px] border-2 text-[12px] font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", checked ? "border-sidebar bg-sidebar text-primary" : "border-border bg-background text-transparent")}>✓</button>
  )
}

/** The fiche in its drawer from the right, turned towards the call: the same in « Ma journée » and « Mes prospects ». */
export function CloserSheet({ openId, lead, error, currentUserId, autoCall, onChange, onClose }: {
  openId: string | null
  lead: LeadDetail | null
  error: string | null
  currentUserId: string
  autoCall?: boolean
  onChange: (lead: LeadDetail) => void
  onClose: () => void
}) {
  const current = lead && lead.id === openId ? lead : null
  return (
    <Sheet open={!!openId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[620px] sm:rounded-l-3xl [&>button.absolute]:hidden">
        <SheetTitle className="sr-only">{current?.company?.name ?? "Fiche prospect"}</SheetTitle>
        <SheetDescription className="sr-only">La fiche du prospect, tournée vers l’appel.</SheetDescription>
        {error && <p role="alert" className="m-6 rounded-lg bg-destructive-subtle p-3 text-sm font-medium text-destructive-text">{error}</p>}
        {openId && !current && !error && <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Chargement de la fiche" /></div>}
        {current && <CloserFiche key={current.id} lead={current} currentUserId={currentUserId} autoCall={autoCall} onChange={onChange} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  )
}
