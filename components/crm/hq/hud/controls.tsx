"use client"

import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, Footprints, Gauge, Home, Minus, Moon, Plus, RotateCcw, RotateCw, Sun, SunMoon, X } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { AMBIENCE_MODES, type AmbienceMode } from "@/features/hq/ambience"
import { ZONES, zoneById } from "@/features/hq/zones"
import { PERIODS, type PeriodDays } from "@/features/metrics/definitions"
import { ZONE_ICONS } from "../zone-icons"
import { clearSelection, selectZone, useHq, useHqStore, type CameraCommand } from "../store"
import { Glass } from "./parts"

const AMBIENCE_KEY = "cleads.hq.ambience"
export function readAmbience(): AmbienceMode {
  try {
    const v = localStorage.getItem(AMBIENCE_KEY)
    return v === "day" || v === "night" || v === "auto" ? v : "auto"
  } catch {
    return "auto"
  }
}

function IconButton({ label, onClick, children, pressed }: { label: string; onClick: () => void; children: React.ReactNode; pressed?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn("grid h-9 w-9 place-items-center rounded-lg text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", pressed && "bg-primary text-primary-foreground hover:bg-primary")}
    >
      {children}
    </button>
  )
}

/** Zoom, turn, back to the whole site; day / night; guided visit; lighter rendering. */
export function SceneControls() {
  const store = useHqStore()
  const tour = useHq((s) => s.tour)
  const lowPower = useHq((s) => s.lowPower)
  const send = (kind: CameraCommand) => store.set({ command: { kind, at: Date.now() } })
  return (
    <Glass as="div" className="flex flex-col items-center gap-0.5 p-1">
      <IconButton label="Zoomer (+)" onClick={() => send("zoomIn")}><Plus className="h-4 w-4" aria-hidden="true" /></IconButton>
      <IconButton label="Dézoomer (−)" onClick={() => send("zoomOut")}><Minus className="h-4 w-4" aria-hidden="true" /></IconButton>
      <span className="my-0.5 h-px w-6 bg-border" aria-hidden="true" />
      <IconButton label="Tourner à gauche" onClick={() => send("rotateLeft")}><RotateCcw className="h-4 w-4" aria-hidden="true" /></IconButton>
      <IconButton label="Tourner à droite" onClick={() => send("rotateRight")}><RotateCw className="h-4 w-4" aria-hidden="true" /></IconButton>
      <IconButton label="Vue d’ensemble (Échap, Début)" onClick={() => { clearSelection(store); send("reset") }}><Home className="h-4 w-4" aria-hidden="true" /></IconButton>
      <span className="my-0.5 h-px w-6 bg-border" aria-hidden="true" />
      <IconButton
        label={tour ? "Arrêter la visite" : "Visite guidée des espaces"}
        pressed={tour}
        onClick={() => {
          if (tour) return store.set({ tour: false })
          selectZone(store, ZONES[0].id)
          store.set({ tour: true })
        }}
      >
        <Footprints className="h-4 w-4" aria-hidden="true" />
      </IconButton>
      <IconButton label={lowPower ? "Rendu léger activé (cliquer pour le rendu complet)" : "Passer en rendu léger"} pressed={lowPower} onClick={() => store.set({ lowPower: !lowPower })}><Gauge className="h-4 w-4" aria-hidden="true" /></IconButton>
    </Glass>
  )
}

/** Live clock and the day / night choice, remembered in this browser. */
export function AmbienceControl() {
  const store = useHqStore()
  const mode = useHq((s) => s.ambience)
  const light = useHq((s) => s.light)
  const [now, setNow] = useState<string>("")
  useEffect(() => {
    const tick = () => setNow(new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date()))
    tick()
    const id = setInterval(tick, 20_000)
    return () => clearInterval(id)
  }, [])
  const choose = (m: AmbienceMode) => {
    store.set({ ambience: m })
    try {
      localStorage.setItem(AMBIENCE_KEY, m)
    } catch {
      // Not remembered in private mode; the choice still applies now.
    }
  }
  const Icon = light.night > 0.5 ? Moon : light.phase === "day" ? Sun : SunMoon
  return (
    <Glass as="div" className="flex items-center gap-2 py-1 pl-3 pr-1">
      <span className="flex items-center gap-1.5 text-xs font-semibold" aria-live="off">
        <span className="h-2 w-2 animate-pulse rounded-full bg-success motion-reduce:animate-none" aria-hidden="true" />
        Live {now}
      </span>
      <span className="flex items-center gap-1 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{light.label}</span>
      <div role="radiogroup" aria-label="Ambiance jour / nuit" className="flex rounded-lg bg-muted p-0.5">
        {AMBIENCE_MODES.map((m) => (
          <button
            key={m.id}
            role="radio"
            aria-checked={mode === m.id}
            title={m.hint}
            onClick={() => choose(m.id)}
            className={cn("rounded-md px-2 py-1 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", mode === m.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {m.label}
          </button>
        ))}
      </div>
    </Glass>
  )
}

export function PeriodControl({ onChange }: { onChange: (d: PeriodDays) => void }) {
  const days = useHq((s) => s.days)
  return (
    <Select value={String(days)} onValueChange={(v) => onChange(Number(v) as PeriodDays)}>
      <SelectTrigger className="pointer-events-auto h-9 w-40 rounded-xl border-white/70 bg-card/95 text-xs font-semibold shadow-pop backdrop-blur" aria-label="Période des indicateurs"><SelectValue /></SelectTrigger>
      <SelectContent>{PERIODS.map((p) => <SelectItem key={p} value={String(p)}>{p} derniers jours</SelectItem>)}</SelectContent>
    </Select>
  )
}

/** Shown while a space is framed: where you are, the next one, and how to leave (like the reference video). */
export function FocusBar() {
  const store = useHqStore()
  const focus = useHq((s) => s.focus)
  const zones = useHq((s) => s.overview.zones)
  const tour = useHq((s) => s.tour)
  if (!focus) return null
  const index = ZONES.findIndex((z) => z.id === focus)
  const label = focus === "hq" ? "QG Cleads" : zoneById(focus)!.label
  const Icon = focus === "hq" ? Home : ZONE_ICONS[focus]
  const go = (step: number) => selectZone(store, ZONES[(Math.max(0, index) + step + ZONES.length) % ZONES.length].id)
  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-sidebar py-1.5 pl-2 pr-1.5 text-sidebar-foreground shadow-pop">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-primary-foreground"><Icon className="h-4 w-4" aria-hidden="true" /></span>
      <span className="text-sm font-bold">{label}</span>
      {index >= 0 && <span className="text-xs text-sidebar-muted tabular-nums">{index + 1}/{ZONES.length}</span>}
      {focus !== "hq" && zones[focus].badge && <span className="hidden text-xs text-sidebar-muted sm:inline">· {zones[focus].badge}</span>}
      {tour && <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">Visite</span>}
      <span className="mx-1 h-5 w-px bg-sidebar-border" aria-hidden="true" />
      <button type="button" onClick={() => go(-1)} aria-label="Espace précédent (←)" className="grid h-7 w-7 place-items-center rounded-md hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
      <button type="button" onClick={() => go(1)} aria-label="Espace suivant (→)" className="grid h-7 w-7 place-items-center rounded-md hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
      <button type="button" onClick={() => clearSelection(store)} className="flex items-center gap-1 rounded-md bg-sidebar-accent px-2 py-1 text-xs font-semibold hover:bg-sidebar-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <X className="h-3.5 w-3.5" aria-hidden="true" /> Échap · Quitter
      </button>
    </div>
  )
}
