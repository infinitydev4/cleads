"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  /** Loads the open slots from a calendar day for a number of days. Called again when `reloadKey` changes. */
  load: (from: string, days: number) => Promise<{ slots: string[] }>
  value: string | null
  onChange: (startsAt: string) => void
  /** Timezone the times are shown in; the browser's by default. */
  timezone?: string
  days?: number
  reloadKey?: string
  className?: string
}

export const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris"

const dayOf = (iso: string, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso)) // YYYY-MM-DD
const timeLabel = (iso: string, tz: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
export const longDay = (iso: string, tz: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso))

/**
 * Pick a day, then a time. Days without a free slot are not shown at all, so there is nothing to click that leads nowhere;
 * every control is at least 44 px high for thumbs.
 */
export function SlotPicker({ load, value, onChange, timezone, days = 28, reloadKey, className }: Props) {
  const tz = timezone ?? browserTimezone()
  const loadKey = `${reloadKey ?? ""}|${tz}|${days}`
  const [result, setResult] = useState<{ key: string; slots: string[] | null; error: string | null } | null>(null)
  const [chosenDay, setChosenDay] = useState<string | null>(null)
  // What is shown belongs to the request that is current; an older answer is simply not shown.
  const current = result?.key === loadKey ? result : null
  const slots = current?.slots ?? null
  const error = current?.error ?? null

  useEffect(() => {
    let alive = true
    load(dayOf(new Date().toISOString(), tz), days)
      .then((r) => alive && setResult({ key: loadKey, slots: r.slots, error: null }))
      .catch((e) => alive && setResult({ key: loadKey, slots: null, error: e instanceof Error ? e.message : "Impossible de charger les créneaux." }))
    return () => {
      alive = false
    }
    // `load` is a new function on every render of the parent; the key says when to really reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey])

  const byDay = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const s of slots ?? []) {
      const k = dayOf(s, tz)
      map.set(k, [...(map.get(k) ?? []), s])
    }
    return map
  }, [slots, tz])

  const dayKeys = [...byDay.keys()]
  const selectedDay = chosenDay && byDay.has(chosenDay) ? chosenDay : value ? dayOf(value, tz) : dayKeys[0] ?? null

  if (error) return <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</p>
  if (slots === null)
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Chargement des créneaux…
      </p>
    )
  if (dayKeys.length === 0) return <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Aucun créneau libre pour le moment.</p>

  return (
    <div className={cn("min-w-0 max-w-full space-y-4", className)}>
      <div role="group" aria-label="Jour" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {dayKeys.map((k) => {
          const first = byDay.get(k)![0]
          const active = k === selectedDay
          return (
            <button
              key={k}
              type="button"
              aria-pressed={active}
              onClick={() => setChosenDay(k)}
              className={cn("flex min-h-[3.5rem] min-w-[4.25rem] shrink-0 flex-col items-center justify-center rounded-xl border px-3 py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "border-transparent bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
            >
              <span className="text-xs capitalize">{new Intl.DateTimeFormat("fr-FR", { timeZone: tz, weekday: "short" }).format(new Date(first))}</span>
              <span className="text-lg font-semibold leading-none">{new Intl.DateTimeFormat("fr-FR", { timeZone: tz, day: "numeric" }).format(new Date(first))}</span>
              <span className="text-xs opacity-80">{new Intl.DateTimeFormat("fr-FR", { timeZone: tz, month: "short" }).format(new Date(first))}</span>
            </button>
          )
        })}
      </div>
      {selectedDay && (
        <div>
          <p className="mb-2 text-sm font-medium first-letter:uppercase" aria-live="polite">{longDay(byDay.get(selectedDay)![0], tz)}</p>
          <div role="group" aria-label="Heure" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {byDay.get(selectedDay)!.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={value === s}
                onClick={() => onChange(s)}
                className={cn("min-h-[2.75rem] rounded-lg border px-2 text-sm font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", value === s ? "border-transparent bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
              >
                {timeLabel(s, tz)}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Heures affichées : {tz.replace("_", " ")}.</p>
    </div>
  )
}
