"use client"

import { CircleAlert, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { modelLabel } from "@/lib/ai/models"
import { formatEur } from "@/features/ai/labels"
import { isActiveRun, type DraftState, type DraftView } from "@/features/email-draft/labels"
import { api } from "@/app/(crm)/app/leads/api"
import { EvidenceChips } from "./evidence"

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer)
        reject(new DOMException("Brouillon abandonné", "AbortError"))
      },
      { once: true }
    )
  })

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError"

/**
 * Asks the Rédacteur for a draft (E22) and waits for the worker: usually a few seconds, two minutes at most. The run
 * keeps going if the person closes the window; the draft then shows in Agents IA › Exécutions.
 */
export async function fetchDraft(url: string, body: unknown, signal?: AbortSignal): Promise<DraftView> {
  const { runId } = await api<{ runId: string }>(url, { method: "POST", body: JSON.stringify(body ?? {}), signal })
  for (let i = 0; i < 60; i++) {
    await wait(i < 6 ? 1_500 : 3_000, signal)
    const state = await api<DraftState>(`/api/ai/drafts/${runId}`, { signal })
    if (state.draft) return state.draft
    if (!isActiveRun(state.status)) throw new Error(state.error ?? "Le brouillon n’a pas abouti.")
  }
  throw new Error("Le brouillon prend plus de temps que prévu : il apparaîtra dans Agents IA › Exécutions.")
}

/** What the person must know before sending a draft: the facts it cites, with their evidence, and what to check. */
export function DraftReview({ draft, className }: { draft: DraftView; className?: string }) {
  return (
    <div role="note" className={cn("space-y-2 rounded-lg border border-info/30 bg-info-subtle/40 p-3 text-sm motion-safe:animate-in motion-safe:fade-in-0", className)}>
      <p className="flex items-center gap-2 font-medium">
        <Sparkles className="h-4 w-4 text-info" aria-hidden="true" /> Brouillon IA : relisez-le et ajustez-le avant d’envoyer.
      </p>
      {draft.facts.length > 0 && (
        <ul className="space-y-1">
          {draft.facts.map((f, i) => (
            <li key={i} className="text-muted-foreground">
              {f.text}
              <EvidenceChips ids={f.evidence.map((e) => e.id)} evidence={new Map(f.evidence.map((e) => [e.id, e]))} />
            </li>
          ))}
        </ul>
      )}
      {draft.notes.length > 0 && (
        <ul className="space-y-1 text-warning">
          {draft.notes.map((n, i) => (
            <li key={i} className="flex items-start gap-2">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {n}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Rédacteur outreach{draft.model && ` (${modelLabel(draft.model)})`} · coût {formatEur(draft.costEur)}
      </p>
    </div>
  )
}
