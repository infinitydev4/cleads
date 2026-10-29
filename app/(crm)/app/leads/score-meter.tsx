import { cn } from "@/lib/utils"

/** Score 0-100 as a number and a bar. Colour is a hint only: the number carries the meaning. */
export function ScoreMeter({ score, reasons }: { score: number; reasons?: string }) {
  const tone = score >= 70 ? "bg-success" : score >= 40 ? "bg-info" : "bg-muted-foreground/50"
  return (
    <div className="flex items-center gap-2" title={reasons}>
      <span className="w-7 text-right text-sm font-semibold tabular-nums">{score}</span>
      <span aria-hidden="true" className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${score}%` }} />
      </span>
    </div>
  )
}
