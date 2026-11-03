"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { CheckCircle2, CircleAlert, FlaskConical, TriangleAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import type { ModelEvidence } from "@/features/quality/gate"
import { EVIDENCE_DAYS, VERDICT_LABELS, formatRatio, formatScore, type SuiteId } from "@/features/quality/labels"
import type { AiRole } from "@/lib/ai/models"
import { api } from "@/app/(crm)/app/leads/api"

/**
 * What a change of model needs (E27, features/quality/gate.ts), shown before it is saved: for each suite the change
 * touches, the evaluation that measured the new model against the one in service, or a way to launch it.
 */
export type ProofQuery = { role: AiRole; model: string } | { agent: SuiteId; role: AiRole }

export interface Proof {
  evidence: ModelEvidence | null
  error: string | null
}

export const proofKey = (q: ProofQuery) => new URLSearchParams(q as Record<string, string>).toString()

/** Looks up the proof of each change asked, again whenever the changes do. */
export function useModelProofs(queries: readonly ProofQuery[]): Record<string, Proof> {
  const joined = queries.map(proofKey).join("|")
  const [loaded, setLoaded] = useState<Record<string, Proof>>({})
  useEffect(() => {
    if (!joined) return
    let cancelled = false
    for (const key of joined.split("|")) {
      api<ModelEvidence>(`/api/ai/evaluations/evidence?${key}`)
        .then((evidence) => !cancelled && setLoaded((m) => ({ ...m, [key]: { evidence, error: null } })))
        .catch((e: unknown) => !cancelled && setLoaded((m) => ({ ...m, [key]: { evidence: null, error: e instanceof Error ? e.message : "Vérification impossible" } })))
    }
    return () => {
      cancelled = true
    }
  }, [joined])
  return loaded
}

/** Ready to save: every suite measured the model, and a regression, if any, is confirmed. */
export const proofReady = (proof: Proof | undefined, confirmed: boolean) => !!proof?.evidence && !proof.evidence.missing.length && (!proof.evidence.regressions.length || confirmed)

const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" })
const TONE = { better: "success", equivalent: "neutral", regression: "warning" } as const

export function ModelProof({ proof, confirmed, onConfirm }: { proof: Proof | undefined; confirmed: boolean; onConfirm: (v: boolean) => void }) {
  if (!proof) return <p className="text-xs text-muted-foreground">Vérification des évaluations de ce modèle…</p>
  if (!proof.evidence) return <p className="text-xs text-destructive-text">{proof.error}</p>
  const e = proof.evidence
  return (
    <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-xs" aria-live="polite">
      <p className="flex items-center gap-1.5 font-semibold">
        <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
        {e.missing.length ? `À évaluer avant de passer à ${e.modelLabel}` : `${e.modelLabel} a été évalué`}
      </p>
      <ul className="space-y-1.5">
        {e.suites.map((s) => (
          <li key={s.suite} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {s.evaluation ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" /> : <CircleAlert className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />}
            <span className="font-medium">{s.label}</span>
            {s.evaluation ? (
              <>
                <span className="text-muted-foreground">
                  le {day.format(new Date(s.evaluation.at))}
                  {s.evaluation.quick ? " (rapide)" : ""} · {s.comparison ? `${formatScore(s.baseline?.score)} → ${formatScore(s.candidate?.score)} · coût ${formatRatio(s.comparison.costRatio)}` : `score ${formatScore(s.candidate?.score)}`}
                </span>
                {s.comparison && <Badge variant={TONE[s.comparison.verdict]}>{VERDICT_LABELS[s.comparison.verdict]}</Badge>}
              </>
            ) : (
              <Link href={`/app/agents?tab=quality&evaluate=${s.suite}&role=${e.role}&model=${encodeURIComponent(e.model)}`} className="font-medium text-foreground underline underline-offset-4">
                Lancer l’évaluation
              </Link>
            )}
          </li>
        ))}
      </ul>
      {e.regressions.length > 0 && (
        <label className="flex items-start gap-2 rounded-md bg-warning-subtle p-2 text-warning">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="flex-1">Ce modèle fait moins bien que celui en service. Changer quand même, en connaissance de cause ?</span>
          <Checkbox checked={confirmed} onCheckedChange={(v) => onConfirm(v === true)} aria-label="Confirmer le changement malgré la baisse mesurée" />
        </label>
      )}
      {!e.missing.length && <p className="text-muted-foreground">Une évaluation reste valable {EVIDENCE_DAYS} jours, sur le jeu de référence du moment.</p>}
    </div>
  )
}
