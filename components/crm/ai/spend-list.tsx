import { formatEur } from "@/features/ai/labels"
import type { SpendLine } from "@/features/ai/settings"

/** A month's AI spend, one line per agent, model or person. */
export function SpendList({ title, lines }: { title: string; lines: SpendLine[] }) {
  return (
    <div className="min-w-0">
      <h3 className="mb-2 text-sm font-bold">{title}</h3>
      {lines.length ? (
        <ul className="space-y-1 text-sm">
          {lines.map((l) => (
            <li key={l.key} className="flex justify-between gap-3">
              <span className="truncate">{l.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatEur(l.eur)} · {l.calls} appel{l.calls > 1 ? "s" : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Rien ce mois-ci.</p>
      )}
    </div>
  )
}
