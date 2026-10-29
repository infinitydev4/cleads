import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export function StatCard({
  label,
  value,
  hint,
  delta,
  loading,
  className,
}: {
  label: string
  value?: string | number
  hint?: string
  /** Relative change; the sign picks the arrow and colour. */
  delta?: number
  loading?: boolean
  className?: string
}) {
  return (
    <Card className={cn("p-5", className)} aria-busy={loading || undefined}>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-3 h-9 w-24" />
      ) : (
        <p className="mt-2 text-3xl font-extrabold tracking-[-0.04em] tabular-nums">{value ?? "—"}</p>
      )}
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        {typeof delta === "number" && !loading && (
          <span className={cn("inline-flex items-center gap-0.5 font-semibold", delta >= 0 ? "text-success" : "text-destructive-text")}>
            {delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />}
            {Math.abs(delta)} %
          </span>
        )}
        {hint && <span>{hint}</span>}
      </div>
    </Card>
  )
}
