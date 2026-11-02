"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowRight, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Definition } from "@/components/crm/definition"
import { cn } from "@/lib/utils"
import { zoneById, type ZoneId } from "@/features/hq/zones"
import type { HqState } from "../store"
import type { ZoneDetail } from "@/features/hq/types"
import { api } from "@/app/(crm)/app/leads/api"
import { useHq } from "../store"

/** The small building blocks of the right-hand panel (hud/detail-panel.tsx, hud/agency-panel.tsx). */

export function PanelHeader({ icon, kicker, title, subtitle, onClose, onBack }: { icon: React.ReactNode; kicker: string; title: string; subtitle?: React.ReactNode; onClose: () => void; onBack?: () => void }) {
  return (
    <header className="flex items-start gap-3 border-b px-4 pb-3 pt-4">
      {onBack && (
        <button type="button" onClick={onBack} aria-label="Retour" className="-ml-1 mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted text-sidebar">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{kicker}</p>
        <h2 className="truncate text-lg font-extrabold tracking-[-0.03em]">{title}</h2>
        {subtitle && <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>}
      </div>
      <button type="button" onClick={onClose} aria-label="Fermer le panneau (Échap)" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </header>
  )
}

export function Stat({ label, value, definition, tone }: { label: string; value: string; definition?: string; tone?: "attention" }) {
  return (
    <div className={cn("rounded-xl bg-muted/70 px-3 py-2", tone === "attention" && "bg-warning-subtle")}>
      <p className="text-[11px] font-medium text-muted-foreground">{definition ? <Definition label={label} definition={definition} className="no-underline" /> : label}</p>
      <p className={cn("text-lg font-extrabold tabular-nums tracking-[-0.03em]", tone === "attention" && "text-warning")}>{value}</p>
    </div>
  )
}

export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}{action}</h3>
      {children}
    </section>
  )
}

/**
 * The panels link to the CRM pages: in the 3D view a click opens the page in a window over the scene
 * (hud/module-window.tsx), a middle click still gives the 2D page in a new tab. No prefetch: the window loads it.
 */
export function OpenModule({ zone }: { zone: ZoneId }) {
  const def = zoneById(zone)!
  return (
    <Button asChild className="w-full">
      <Link href={def.href} prefetch={false}>{def.hrefLabel} <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
    </Button>
  )
}

export const Empty = ({ children }: { children: React.ReactNode }) => <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">{children}</p>

/**
 * What a space's panel loads, again when the period or the figures change. The AI spaces (E26) also reload when their
 * pulse moves (an agent starts or ends, a mock-up is ready), which happens between two refreshes of the overview.
 */
export function useZoneDetail(zone: ZoneId) {
  const days = useHq((s) => s.days)
  const generatedAt = useHq((s) => s.overview.generatedAt)
  const pulse = useHq((s) => pulseKey(s, zone))
  const [state, setState] = useState<{ key: string; data?: ZoneDetail; error?: string } | null>(null)
  const key = `${zone}:${days}:${generatedAt}:${pulse}`
  useEffect(() => {
    let cancelled = false
    api<ZoneDetail>(`/api/hq/zones/${zone}?days=${days}`).then((data) => !cancelled && setState({ key, data })).catch((e) => !cancelled && setState({ key, error: e.message }))
    return () => {
      cancelled = true
    }
  }, [zone, days, key])
  // The previous figures stay on screen while the next ones load, rather than a skeleton every few seconds.
  return state?.key === key || state?.data?.zone === zone ? state : null
}

/** What changes in the AI spaces between two overviews: which runs are active or just ended, what waits, the latest mock-ups. */
function pulseKey(s: HqState, zone: ZoneId) {
  const a = s.overview.agency
  if (!a || (zone !== "agents" && zone !== "studio")) return ""
  if (zone === "studio") return a.studio ? `${a.studio.latest.map((x) => `${x.id}.${x.version}`).join(",")}:${a.studio.building}:${a.studio.briefs}:${a.studio.ready}` : ""
  return `${a.agents.map((x) => `${x.current?.runId ?? ""}.${x.lastDone?.runId ?? ""}.${x.state}`).join(",")}:${a.approvals}`
}
