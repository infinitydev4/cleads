import { ExternalLink } from "lucide-react"
import type { Evidence } from "@/features/prospect-audit/schemas"

export const safeLink = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null)

/**
 * The evidence behind a statement (P page, M measure, C screenshot, S source), each with what it is and a link when it
 * has one. Shared by the audit (E20) and the suggested offers (E21).
 */
export function EvidenceChips({ ids, evidence }: { ids: readonly string[]; evidence: ReadonlyMap<string, Evidence> }) {
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {ids.map((id) => {
        const e = evidence.get(id)
        if (!e) return null
        const label = `${e.label}${e.value ? ` : ${e.value}` : ""}`
        const href = safeLink(e.url)
        return href ? (
          <a key={id} href={href} target="_blank" rel="noopener noreferrer nofollow" title={label} aria-label={`Preuve ${id} : ${label}`} className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {id}
            <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
          </a>
        ) : (
          <span key={id} title={label} aria-label={`Preuve ${id} : ${label}`} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {id}
          </span>
        )
      })}
    </span>
  )
}
