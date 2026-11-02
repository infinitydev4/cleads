"use client"

import { Check, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { RUN_STATUS_LABELS } from "@/features/ai/labels"
import { BRIEF_STEPS, BUILD_STEPS, type SiteView } from "@/features/studio/labels"

/**
 * Where a Designer run is (E23), step by step, from the steps its history already holds. A run is long (a few minutes
 * for a page): the person sees it move instead of a spinner.
 */
export function RunProgress({ run, workerOffline = false, className }: { run: NonNullable<SiteView["run"]>; workerOffline?: boolean; className?: string }) {
  const steps = run.kind === "brief" ? BRIEF_STEPS : BUILD_STEPS
  const done = new Set(run.steps)
  // The first step not reached yet is the one in progress.
  const current = run.status === "RUNNING" ? steps.findIndex((s) => !done.has(s.name)) : -1
  const corrections = run.steps.filter((s) => s === "fix_page").length
  return (
    <div role="status" aria-live="polite" className={cn("space-y-3 rounded-xl border bg-muted/40 p-4", className)}>
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Loader2 className="h-4 w-4 animate-spin text-info motion-reduce:animate-none" aria-hidden="true" />
        {run.status === "QUEUED" ? "En file d’attente" : run.kind === "brief" ? "Le Designer prépare le brief" : run.kind === "revise" ? "Le Designer applique votre demande" : "Le Designer construit la maquette"}
        <span className="font-normal text-muted-foreground">· {run.kind === "brief" ? "environ une minute" : "3 à 8 minutes"}</span>
      </p>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s, i) => {
          const finished = done.has(s.name) && i !== current
          const active = i === current
          return (
            <li key={s.name} className={cn("flex items-center gap-2 text-sm", finished ? "text-foreground" : active ? "font-medium text-foreground" : "text-muted-foreground")}>
              <span
                className={cn(
                  "grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px]",
                  finished && "border-success bg-success text-white",
                  active && "border-info text-info motion-safe:animate-pulse"
                )}
                aria-hidden="true"
              >
                {finished ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              {s.label}
              {s.name === "critique_page" && corrections > 0 && <span className="text-xs text-muted-foreground">({corrections} correction{corrections > 1 ? "s" : ""})</span>}
              <span className="sr-only">{finished ? " : fait" : active ? " : en cours" : " : à venir"}</span>
            </li>
          )
        })}
      </ol>
      {run.status !== "RUNNING" && run.status !== "QUEUED" && <p className="text-xs text-muted-foreground">{RUN_STATUS_LABELS[run.status]}</p>}
      {workerOffline && <p className="text-sm text-warning">Le worker IA est hors ligne : la maquette attend son retour.</p>}
      {run.error && <p className="text-xs text-muted-foreground">Dernière tentative : {run.error}</p>}
    </div>
  )
}
