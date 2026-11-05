import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { currentPeriod, isFuture, periodQuery, shiftPeriod, type ReportPeriod } from "@/features/metrics/periods"

const href = (p: ReportPeriod) => `/app/reports?${periodQuery(p)}`

/** Week or month, and the period before or after; a period still to come is never offered. */
export function PeriodNav({ period }: { period: ReportPeriod }) {
  const next = shiftPeriod(period, 1)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <nav aria-label="Durée de la période" className="inline-flex rounded-xl border bg-card p-0.5">
        {(["semaine", "mois"] as const).map((kind) => (
          <Link
            key={kind}
            href={href(currentPeriod(kind))}
            aria-current={period.kind === kind ? "page" : undefined}
            className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", period.kind === kind ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {kind === "semaine" ? "Semaine" : "Mois"}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-1">
        <Button asChild variant="outline" size="sm">
          <Link href={href(shiftPeriod(period, -1))} aria-label="Période précédente"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></Link>
        </Button>
        <span className="min-w-[13rem] px-1 text-center text-sm font-semibold" aria-live="polite">{period.label}</span>
        {isFuture(next) ? (
          <Button variant="outline" size="sm" disabled aria-label="Période suivante"><ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>
        ) : (
          <Button asChild variant="outline" size="sm">
            <Link href={href(next)} aria-label="Période suivante"><ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
          </Button>
        )}
      </div>
    </div>
  )
}
