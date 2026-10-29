import Link from "next/link"
import { Card } from "@/components/ui/card"
import { StatusBadge } from "@/components/crm/status-badge"
import { searchStatus } from "@/lib/crm/status"
import { ago } from "@/lib/crm/format"
import type { SearchView } from "@/features/search/service"

export function SearchList({ searches }: { searches: SearchView[] }) {
  if (searches.length === 0) return null
  return (
    <section aria-labelledby="searches-title" className="space-y-3">
      <h2 id="searches-title" className="text-xl font-extrabold tracking-[-0.03em]">Recherches récentes</h2>
      <Card>
        <ul className="divide-y">
          {searches.map((s) => (
            <li key={s.id}>
              <Link href={`/app/search/${s.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-accent/50 focus-visible:bg-accent focus-visible:outline-none">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{s.label}</span>
                  <span className="text-xs text-muted-foreground">{s.createdByName ?? "—"} · {ago(s.createdAt)}</span>
                </span>
                <span className="flex items-center gap-4">
                  <span className="text-muted-foreground tabular-nums">{s.counters.unique} trouvée{s.counters.unique > 1 ? "s" : ""}{s.importedCount > 0 && ` · ${s.importedCount} importée${s.importedCount > 1 ? "s" : ""}`}</span>
                  <StatusBadge map={searchStatus} value={s.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  )
}
