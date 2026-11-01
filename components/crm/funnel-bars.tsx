import { formatCount } from "@/features/metrics/definitions"
import { cn } from "@/lib/utils"
import { Definition } from "./definition"

export interface FunnelStep {
  key: string
  label: string
  count: number
  definition?: string
}

/** Horizontal bars, each step against the first: how far the fiches went. Counts stay readable without the bars. */
export function FunnelBars({ steps, className }: { steps: FunnelStep[]; className?: string }) {
  const top = Math.max(1, ...steps.map((s) => s.count))
  return (
    <ol className={cn("space-y-2.5", className)}>
      {steps.map((s, i) => (
        <li key={s.key} className="grid grid-cols-[8.5rem_1fr_3.5rem] items-center gap-3 text-sm">
          <span className="truncate text-muted-foreground">{s.definition ? <Definition label={s.label} definition={s.definition} /> : s.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span className={cn("block h-full rounded-full", i === 0 ? "bg-sidebar" : "bg-primary")} style={{ width: `${Math.max(s.count ? 3 : 0, (s.count / top) * 100)}%` }} />
          </span>
          <span className="text-right font-semibold tabular-nums">{formatCount(s.count)}</span>
        </li>
      ))}
    </ol>
  )
}
