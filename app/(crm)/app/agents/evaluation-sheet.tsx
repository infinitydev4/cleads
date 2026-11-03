"use client"

import { Fragment, useEffect, useState } from "react"
import { Check, ChevronDown, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { ACTIVE_STATUSES, RUN_STATUS_LABELS, RUN_STATUS_TONE, formatEur } from "@/features/ai/labels"
import { CALL_STATE_LABELS, MEASURES, SUITES_INFO, VERDICT_LABELS, formatMeasure, formatRatio, formatScore, type ContenderResult } from "@/features/quality/labels"
import type { CaseView, EvaluationDetail } from "@/features/quality/service"
import { signalLabel } from "@/features/offers/signals"
import { api } from "../leads/api"

const when = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
const TONE = { better: "success", equivalent: "neutral", regression: "warning" } as const

/** The calibration of one decision model: how often it is right at each level of confidence it announces. */
function Calibration({ result, label }: { result: ContenderResult; label: string }) {
  const buckets = (result.calibration ?? []).filter((b) => b.cases > 0)
  if (!buckets.length) return null
  return (
    <figure className="space-y-2">
      <figcaption className="text-xs font-medium">{label}</figcaption>
      <ul className="space-y-1">
        {buckets.map((b) => (
          <li key={b.from} className="grid grid-cols-[6.5rem_1fr_5rem] items-center gap-2 text-xs">
            <span className="text-muted-foreground tabular-nums">
              {Math.round(b.from * 100)}–{Math.round(b.to * 100)} % sûr
            </span>
            <span className="relative h-2 rounded-full bg-secondary" aria-hidden="true">
              <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${Math.round((b.accuracy ?? 0) * 100)}%` }} />
              <span className="absolute inset-y-[-3px] w-px bg-foreground/40" style={{ left: `${Math.round(((b.from + b.to) / 2) * 100)}%` }} />
            </span>
            <span className="whitespace-nowrap text-right tabular-nums">
              {b.accuracy == null ? "—" : `${Math.round(b.accuracy * 100)} %`} <span className="text-muted-foreground">({b.cases})</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">Barre : part juste. Trait : la confiance annoncée. Bien calibré, l’une rejoint l’autre.</p>
    </figure>
  )
}

/** What a case shows when opened, suite by suite. */
function CaseBody({ suite, row }: { suite: EvaluationDetail["suite"]; row: CaseView }) {
  if (row.error) return <p className="text-destructive-text">{row.error}</p>
  const d = (row.detail ?? {}) as Record<string, unknown>
  const list = (v: unknown) => (Array.isArray(v) ? (v as string[]) : [])
  const value = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>).value : v)
  switch (suite) {
    case "auditor":
      return (
        <div className="space-y-1">
          {list(d.missing).length > 0 && <p>Manqués : {list(d.missing).map(signalLabel).join(", ")}</p>}
          {list(d.forbidden).length > 0 && <p className="text-destructive-text">À tort : {list(d.forbidden).map(signalLabel).join(", ")}</p>}
          <p className="text-muted-foreground">Signaux levés : {list(d.found).map(signalLabel).join(", ") || "aucun"}</p>
          {list(d.summary).length > 0 && <p className="text-muted-foreground">Résumé : {list(d.summary).join(" · ")}</p>}
        </div>
      )
    case "offers":
      return (
        <div className="space-y-1">
          <p>
            Offre principale : <span className="font-mono">{String(d.main ?? "aucune")}</span> · attendue : {list(d.expected).join(" ou ")}
          </p>
          <p className="text-muted-foreground">Pack : {list(d.pack).join(", ")}</p>
          {list(d.forbidden).length > 0 && <p className="text-destructive-text">Exclue mais recommandée : {list(d.forbidden).join(", ")}</p>}
        </div>
      )
    case "copilot":
      return (
        <div className="space-y-2">
          <p className="text-muted-foreground">
            {String(d.persona ?? "")}
            {typeof d.page === "string" && ` · ${d.page}`}
          </p>
          {Array.isArray(d.calls) && d.calls.length > 0 && (
            <ol className="space-y-0.5 text-xs">
              {(d.calls as { tool: string; state: string; summary?: string; error?: string }[]).map((c, i) => (
                <li key={i}>
                  <span className="text-muted-foreground">{CALL_STATE_LABELS[c.state] ?? c.state}</span> · <span className="font-mono">{c.tool}</span>
                  {(c.summary ?? c.error) && <span className="text-muted-foreground"> — {c.summary ?? c.error}</span>}
                </li>
              ))}
            </ol>
          )}
          {list(d.plan).length > 0 && <p className="text-muted-foreground">Plan : {list(d.plan).join(" · ")}</p>}
          <p className="whitespace-pre-wrap rounded-md bg-muted p-2">{String(d.answer || "(aucun texte)")}</p>
          <ul className="flex flex-wrap gap-1">
            {(Array.isArray(d.checks) ? (d.checks as { name: string; ok: boolean }[]) : []).map((c) => (
              <li key={c.name}>
                <Badge variant={c.ok ? "success" : "warning"}>{c.name}</Badge>
              </li>
            ))}
          </ul>
          {typeof d.comment === "string" && d.comment && <p className="text-muted-foreground">Le juge : {d.comment}</p>}
        </div>
      )
    case "writer":
      return (
        <div className="space-y-2">
          <p className="font-medium">{String(d.subject ?? "")}</p>
          <p className="whitespace-pre-wrap rounded-md bg-muted p-2">{String(d.body ?? "")}</p>
          <ul className="flex flex-wrap gap-1">
            {(Array.isArray(d.checks) ? (d.checks as { name: string; ok: boolean }[]) : []).map((c) => (
              <li key={c.name}>
                <Badge variant={c.ok ? "success" : "warning"}>{c.name}</Badge>
              </li>
            ))}
          </ul>
          {typeof d.comment === "string" && d.comment && <p className="text-muted-foreground">Le juge : {d.comment}</p>}
        </div>
      )
    case "replies":
    case "qualifier":
      return (
        <p>
          Attendu <span className="font-mono">{String(value(d.expected))}</span> · obtenu <span className="font-mono">{String(value(d.predicted) ?? "sans réponse")}</span>
          {typeof d.confidence === "number" && ` · ${Math.round(d.confidence * 100)} % sûr`}
          {typeof d.trap === "string" && <span className="block text-muted-foreground">Piège : {d.trap}</span>}
        </p>
      )
    case "designer":
      return (
        <div className="space-y-1">
          <p>
            Critique {typeof d.critique === "number" ? `${d.critique.toFixed(1).replace(".", ",")}/5` : "non faite"} · axe-core : {String(d.axe ?? "—")} défaut(s) grave(s) · H1 : {String(d.h1 ?? "—")}
          </p>
          {Number(d.scriptsRemoved) > 0 && <p className="text-muted-foreground">{String(d.scriptsRemoved)} script(s) écrit(s) par le modèle, retiré(s) par le nettoyage.</p>}
          {list(d.issues).length > 0 && <p className="text-muted-foreground">{list(d.issues).join(" · ")}</p>}
          {d.cut === true && <p className="text-destructive-text">Page coupée avant la fin.</p>}
        </div>
      )
  }
}

/**
 * One evaluation (E27): each model's score and measures next to the model in service, the verdict, the rules broken,
 * the calibration of decisions, and every case, opened on demand. Refreshed while it runs.
 */
export function EvaluationSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [detail, setDetail] = useState<EvaluationDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [failuresOnly, setFailuresOnly] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [shown, setShown] = useState(id)
  if (shown !== id) {
    setShown(id)
    setDetail(null)
    setError(null)
    setOpen(null)
  }

  useEffect(() => {
    if (!id) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const load = async () => {
      try {
        const next = await api<EvaluationDetail>(`/api/ai/evaluations/${id}`)
        if (cancelled) return
        setDetail(next)
        if (next.status && ACTIVE_STATUSES.includes(next.status)) timer = setTimeout(load, 3_000)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Chargement impossible")
      }
    }
    void load()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [id])

  const info = detail ? SUITES_INFO[detail.suite] : null
  const total = detail ? detail.cases * detail.contenders.length : 0
  const byCase = new Map<string, CaseView[]>()
  for (const row of detail?.caseRows ?? []) byCase.set(row.caseId, [...(byCase.get(row.caseId) ?? []), row])
  const cases = [...byCase.entries()].filter(([, rows]) => !failuresOnly || rows.some((r) => !r.ok))

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{detail ? `Évaluation : ${detail.suiteLabel}` : "Évaluation"}</SheetTitle>
          <SheetDescription>
            {detail
              ? `${detail.source === "team" ? "Étiquettes de l’équipe" : detail.quick ? "Échantillon rapide" : "Jeu complet"} · ${detail.cases} cas · rôle « ${detail.roleLabel} » · ${when.format(new Date(detail.createdAt))}${detail.requestedBy ? ` · ${detail.requestedBy}` : ""}`
              : "Chargement…"}
          </SheetDescription>
        </SheetHeader>

        {error && <p className="mt-4 text-sm text-destructive-text">{error}</p>}
        {detail && info && (
          <div className="mt-5 space-y-6">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {detail.status && <Badge variant={RUN_STATUS_TONE[detail.status]}>{RUN_STATUS_LABELS[detail.status]}</Badge>}
              <span className="text-muted-foreground tabular-nums">
                {formatEur(detail.costEur)} dépensés · estimé {formatEur(detail.estimateEur)}
              </span>
              {detail.outdated && <Badge variant="outline">Jeu de référence modifié depuis</Badge>}
            </div>
            {detail.status && ACTIVE_STATUSES.includes(detail.status) && (
              <div className="space-y-1">
                <div className="h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label="Cas évalués" aria-valuenow={detail.done} aria-valuemin={0} aria-valuemax={total}>
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${total ? Math.round((detail.done / total) * 100) : 0}%` }} />
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {detail.done} / {total} cas évalués
                </p>
              </div>
            )}

            {detail.results && (
              <section aria-labelledby="eval-results" className="space-y-3">
                <h3 id="eval-results" className="text-sm font-bold">
                  Résultats
                </h3>
                <p className="text-xs text-muted-foreground">Score : {info.score}, sur 100. Un écart de plus de 3 points, ou une règle enfreinte, fait un verdict.</p>
                <div className="relative overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Mesures de chaque modèle</caption>
                    <thead className="bg-muted/60 align-top text-xs">
                      <tr>
                        <th scope="col" className="w-44 px-3 py-2 text-left font-medium text-muted-foreground">
                          Mesure
                        </th>
                        {detail.results.map((r, i) => {
                          const c = detail.comparisons[r.contender]
                          return (
                            <th key={r.contender} scope="col" className="min-w-[8.5rem] px-3 py-2 text-right font-semibold">
                              {detail.contenders.find((x) => x.id === r.contender)?.label ?? r.contender}
                              <span className="mt-1 flex flex-wrap justify-end gap-1 font-normal">
                                {i === 0 ? <Badge variant="info">En service</Badge> : c && <Badge variant={TONE[c.verdict]}>{VERDICT_LABELS[c.verdict]}</Badge>}
                                {r.skipped > 0 && <Badge variant="outline">{r.skipped} non évalués</Badge>}
                              </span>
                              {r.hard.map((h) => (
                                <span key={h} className="mt-1 block font-normal text-destructive-text">
                                  {h}
                                </span>
                              ))}
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      <tr>
                        <th scope="row" className="px-3 py-2 text-left font-semibold">
                          Score
                        </th>
                        {detail.results.map((r) => {
                          const c = detail.comparisons[r.contender]
                          return (
                            <td key={r.contender} className="px-3 py-2 text-right">
                              <span className="text-lg font-bold tabular-nums">{formatScore(r.score)}</span>
                              {c?.scoreDelta != null && <span className={cn("ml-1.5 text-xs tabular-nums", c.scoreDelta < 0 ? "text-destructive-text" : "text-muted-foreground")}>{c.scoreDelta > 0 ? `+${formatScore(c.scoreDelta)}` : formatScore(c.scoreDelta)}</span>}
                            </td>
                          )
                        })}
                      </tr>
                      {info.measures.map((m) => (
                        <tr key={m}>
                          <th scope="row" className="px-3 py-2 text-left font-normal" title={MEASURES[m].hint}>
                            {MEASURES[m].label}
                          </th>
                          {(detail.results ?? []).map((r) => {
                            const c = detail.comparisons[r.contender]
                            const ratio = m === "cost" ? c?.costRatio : m === "duration" ? c?.durationRatio : null
                            return (
                              <td key={r.contender} className="px-3 py-2 text-right tabular-nums">
                                {formatMeasure(m, r.measures[m])}
                                {ratio != null && <span className="ml-1.5 text-xs text-muted-foreground">{formatRatio(ratio)}</span>}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {info.decision && detail.results && (
              <section aria-labelledby="eval-calibration" className="space-y-3">
                <h3 id="eval-calibration" className="text-sm font-bold">
                  Calibration
                </h3>
                <div className="grid gap-5 sm:grid-cols-2">
                  {detail.results.map((r) => (
                    <Calibration key={r.contender} result={r} label={detail.contenders.find((x) => x.id === r.contender)?.label ?? r.contender} />
                  ))}
                </div>
              </section>
            )}

            <section aria-labelledby="eval-cases" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="eval-cases" className="text-sm font-bold">
                  Cas ({byCase.size})
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setFailuresOnly((v) => !v)} aria-pressed={failuresOnly}>
                  {failuresOnly ? "Tous les cas" : "Seulement les cas ratés"}
                </Button>
              </div>
              <ul className="divide-y rounded-lg border text-sm">
                {cases.map(([caseId, rows]) => (
                  <li key={caseId}>
                    <button type="button" onClick={() => setOpen(open === caseId ? null : caseId)} aria-expanded={open === caseId} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50">
                      <span className="min-w-0 flex-1 truncate">{rows[0].title}</span>
                      <span className="flex shrink-0 gap-1">
                        {detail.contenders.map((ct) => {
                          const r = rows.find((x) => x.contender === ct.id)
                          return (
                            <span key={ct.id} title={`${ct.label} : ${r ? (r.ok ? "juste" : r.error ? "échec" : "raté") : "pas encore"}`} className={cn("flex h-5 w-5 items-center justify-center rounded-full", !r ? "bg-secondary" : r.ok ? "bg-success-subtle text-success" : "bg-destructive-subtle text-destructive-text")}>
                              {r ? r.ok ? <Check className="h-3 w-3" aria-hidden="true" /> : <X className="h-3 w-3" aria-hidden="true" /> : null}
                            </span>
                          )
                        })}
                      </span>
                      <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open === caseId && "rotate-180")} aria-hidden="true" />
                    </button>
                    {open === caseId && (
                      <div className="space-y-3 border-t bg-muted/30 px-3 py-3 text-xs">
                        {rows.map((r) => (
                          <Fragment key={r.contender}>
                            <div className="space-y-1">
                              <p className="font-semibold">
                                {detail.contenders.find((x) => x.id === r.contender)?.label} · {r.score == null ? "—" : `${Math.round(r.score * 100)} %`}
                                <span className="font-normal text-muted-foreground">
                                  {" "}
                                  · {formatEur(r.costEur)}
                                  {r.judgeEur > 0 && ` (+ juge ${formatEur(r.judgeEur)})`} · {formatMeasure("duration", r.durationMs)}
                                </span>
                              </p>
                              <CaseBody suite={detail.suite} row={r} />
                            </div>
                          </Fragment>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
                {!cases.length && <li className="px-3 py-3 text-muted-foreground">{failuresOnly ? "Aucun cas raté." : "Les cas apparaissent ici au fil de l’évaluation."}</li>}
              </ul>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
