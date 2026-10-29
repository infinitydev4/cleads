import type { z } from "zod"
import type { viewFiltersSchema } from "./schemas"

export type ViewFilters = z.infer<typeof viewFiltersSchema>

/** Query string for a view, the same shape the list page reads. */
export function viewToQuery(f: ViewFilters): string {
  const p = new URLSearchParams()
  if (f.q) p.set("q", f.q)
  if (f.status.length) p.set("status", f.status.join(","))
  for (const k of ["owner", "source", "sector", "city", "tag"] as const) if (f[k]) p.set(k, f[k]!)
  if (f.hasEmail) p.set("hasEmail", "1")
  if (f.hasPhone) p.set("hasPhone", "1")
  if (f.minScore) p.set("minScore", String(f.minScore))
  if (f.sort !== "score") p.set("sort", f.sort)
  if (f.dir !== "desc") p.set("dir", f.dir)
  return p.toString()
}
