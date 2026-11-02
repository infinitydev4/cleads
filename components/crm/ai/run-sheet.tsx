"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ACTIVE_STATUSES, RUN_STATUS_LABELS, RUN_STATUS_TONE, formatEur } from "@/features/ai/labels"
import type { RunDetail } from "@/features/ai/runs"
import { modelLabel } from "@/lib/ai/models"
import { api } from "@/app/(crm)/app/leads/api"

const STEP_LABELS: Record<string, string> = { MODEL: "Modèle", TOOL: "Outil", DECISION: "Décision", APPROVAL: "Validation" }
const when = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })
const seconds = (ms: number) => `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`

function Json({ value }: { value: unknown }) {
  if (value === null || value === undefined) return null
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2)
  return <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 font-mono text-xs">{text.length > 6_000 ? `${text.slice(0, 6_000)}\n…` : text}</pre>
}

/** The answer of a skill test, or what the agent produced, as text when it is text. */
function Output({ output }: { output: unknown }) {
  const o = output as { kind?: string; text?: string; skill?: { name: string; version: number }; model?: string } | null
  if (o?.kind === "skill_test" && typeof o.text === "string") {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Skill « {o.skill?.name} » version {o.skill?.version} · {o.model ? modelLabel(o.model) : "modèle inconnu"}
        </p>
        <div className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-card p-4 text-sm leading-relaxed">{o.text}</div>
      </div>
    )
  }
  return <Json value={output} />
}

/** A run's steps, cost and result, refreshed every few seconds while it is in progress. */
export function RunSheet({ runId, onClose }: { runId: string | null; onClose: () => void }) {
  const [run, setRun] = useState<RunDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Another run opened: forget the previous one at once instead of showing it while the new one loads.
  const [shown, setShown] = useState(runId)
  if (shown !== runId) {
    setShown(runId)
    setRun(null)
    setError(null)
  }

  useEffect(() => {
    if (!runId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const load = async () => {
      try {
        const next = await api<RunDetail>(`/api/ai/runs/${runId}`)
        if (cancelled) return
        setRun(next)
        setError(null)
        if (ACTIVE_STATUSES.includes(next.status)) timer = setTimeout(load, 3_000)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Chargement impossible")
      }
    }
    void load()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [runId])

  return (
    <Sheet open={!!runId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{run ? run.agentLabel : "Exécution"}</SheetTitle>
          <SheetDescription>
            {run ? (
              <>
                {run.lead ? (
                  <Link href={`/app/leads/${run.lead.id}`} prefetch={false} className="font-medium text-foreground underline-offset-4 hover:underline">
                    {run.lead.name}
                  </Link>
                ) : (
                  "Sans fiche"
                )}
                {run.requestedBy && <> · lancée par {run.requestedBy}</>} · {when.format(new Date(run.createdAt))}
              </>
            ) : (
              "Chargement…"
            )}
          </SheetDescription>
        </SheetHeader>
        {error && <p role="alert" className="mt-4 rounded-lg bg-destructive-subtle p-3 text-sm font-medium text-destructive-text">{error}</p>}
        {run && (
          <div className="mt-6 space-y-6">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge variant={RUN_STATUS_TONE[run.status]}>{RUN_STATUS_LABELS[run.status]}</Badge>
              <span className="tabular-nums">
                {formatEur(run.costEur)} <span className="text-muted-foreground">sur {formatEur(run.capEur)}</span>
              </span>
              {run.finishedAt && <span className="text-muted-foreground">terminée le {when.format(new Date(run.finishedAt))}</span>}
            </div>
            {run.status === "QUEUED" && <p className="text-sm text-muted-foreground">En file : le worker IA la prendra dès qu’il aura une place.</p>}
            {run.error && <p className="rounded-lg bg-destructive-subtle p-3 text-sm text-destructive-text">{run.error}</p>}
            {run.output !== null && run.output !== undefined && (
              <section aria-labelledby="run-output" className="space-y-2">
                <h3 id="run-output" className="text-sm font-bold">
                  Résultat
                </h3>
                <Output output={run.output} />
              </section>
            )}
            <section aria-labelledby="run-steps" className="space-y-2">
              <h3 id="run-steps" className="text-sm font-bold">
                Étapes
              </h3>
              {run.steps.length ? (
                <ol className="space-y-2">
                  {run.steps.map((s) => (
                    <li key={s.index} className="rounded-lg border p-3 text-sm">
                      <details>
                        <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                          <Badge variant="outline">{STEP_LABELS[s.type] ?? s.type}</Badge>
                          <span className="font-medium">{s.name}</span>
                          {s.model && <span className="text-muted-foreground">{modelLabel(s.model)}</span>}
                          <span className="ml-auto tabular-nums text-muted-foreground">
                            {s.inputTokens + s.outputTokens > 0 && `${(s.inputTokens + s.outputTokens).toLocaleString("fr-FR")} jetons · `}
                            {formatEur(s.costEur)} · {seconds(s.durationMs)}
                          </span>
                        </summary>
                        <div className="mt-3 space-y-2">
                          {s.input !== null && s.input !== undefined && (
                            <div>
                              <p className="mb-1 text-xs font-semibold text-muted-foreground">Entrée</p>
                              <Json value={s.input} />
                            </div>
                          )}
                          {s.output !== null && s.output !== undefined && (
                            <div>
                              <p className="mb-1 text-xs font-semibold text-muted-foreground">Sortie</p>
                              <Json value={s.output} />
                            </div>
                          )}
                        </div>
                      </details>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">Aucune étape pour l’instant.</p>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
