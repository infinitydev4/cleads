"use client"

import { useEffect, useState } from "react"
import { CircleAlert, FlaskConical, ListTree, Square } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { ACTIVE_STATUSES, RUN_STATUS_LABELS, RUN_STATUS_TONE, formatEur } from "@/features/ai/labels"
import type { Period, QualityDashboard } from "@/features/quality/dashboard"
import { VERDICT_LABELS, formatMeasure, formatScore, isSuiteId } from "@/features/quality/labels"
import type { EvaluationView, QualityPage, SuiteView } from "@/features/quality/service"
import { api } from "../leads/api"
import { EvaluationDialog, type EvaluationPreset } from "./evaluation-dialog"
import { EvaluationSheet } from "./evaluation-sheet"

const PERIODS: Period[] = [7, 30, 90]
const OUTCOME_LABELS = { AUTO: "Proposées d’un clic", REVIEW: "À confirmer", HUMAN: "Laissées à une personne" } as const
const TONE = { better: "success", equivalent: "neutral", regression: "warning" } as const
const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" })
const percent = (v: number | null | undefined) => formatMeasure("accuracy", v)
const plural = (n: number, one: string, many: string) => (n > 1 ? many : one)

/** A share as a thin bar with its figure: sober, readable at a glance. */
function Meter({ value, label }: { value: number | null; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="relative h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-secondary" role="meter" aria-label={label} aria-valuenow={value == null ? undefined : Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
        {value != null && <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${Math.round(value * 100)}%` }} />}
      </span>
      <span className="tabular-nums">{percent(value)}</span>
    </span>
  )
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  )
}

/** The latest result of a suite: each model's score, the verdict against the one in service. */
function LatestResult({ evaluation }: { evaluation: EvaluationView }) {
  return (
    <ul className="space-y-1.5">
      {(evaluation.results ?? []).map((r, i) => {
        const c = evaluation.comparisons[r.contender]
        return (
          <li key={r.contender} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{evaluation.contenders.find((x) => x.id === r.contender)?.label}</span>
            {i === 0 ? <Badge variant="info">En service</Badge> : c && <Badge variant={TONE[c.verdict]}>{VERDICT_LABELS[c.verdict]}</Badge>}
            <span className="w-10 text-right font-semibold tabular-nums">{formatScore(r.score)}</span>
          </li>
        )
      })}
    </ul>
  )
}

function SuiteCard({ suite, canEvaluate, onEvaluate, onOpen, onCancel }: { suite: SuiteView; canEvaluate: boolean; onEvaluate: () => void; onOpen: (id: string) => void; onCancel: (runId: string) => void }) {
  const active = suite.active
  const latest = suite.latest
  const total = active ? active.cases * active.contenders.length : 0
  return (
    <Card className="flex min-w-0 flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h4 className="font-semibold">{suite.info.label}</h4>
          <p className="text-sm text-muted-foreground">{suite.info.set}</p>
        </div>
        {latest && !active && <span className="text-2xl font-extrabold tabular-nums">{formatScore(latest.results?.[0]?.score)}</span>}
      </div>

      {active ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            {active.status && <Badge variant={RUN_STATUS_TONE[active.status]}>{RUN_STATUS_LABELS[active.status]}</Badge>}
            <span className="text-muted-foreground tabular-nums">
              {active.done} / {total} cas · {active.contenders.map((c) => c.label).join(", ")}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label={`Évaluation de ${suite.info.label}`} aria-valuenow={active.done} aria-valuemin={0} aria-valuemax={total}>
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${total ? Math.round((active.done / total) * 100) : 0}%` }} />
          </div>
        </div>
      ) : latest ? (
        <div className="space-y-2">
          <LatestResult evaluation={latest} />
          <p className="text-xs text-muted-foreground">
            {latest.quick ? "Échantillon rapide" : latest.source === "team" ? "Étiquettes de l’équipe" : "Jeu complet"} du {day.format(new Date(latest.finishedAt ?? latest.createdAt))} · {formatEur(latest.costEur)}
            {latest.outdated && " · jeu modifié depuis"}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Jamais évalué. {suite.info.score}.</p>
      )}

      {suite.cases.team != null && (
        <p className="text-xs text-muted-foreground">
          {suite.cases.team} cas étiquetés par l’équipe{suite.id === "replies" && suite.cases.team < 200 ? " · objectif 200 à 500" : ""}
        </p>
      )}

      <div className="mt-auto flex flex-wrap gap-2">
        {active ? (
          <>
            <Button variant="outline" size="sm" onClick={() => onOpen(active.id)}>
              <ListTree className="h-3.5 w-3.5" aria-hidden="true" />
              Suivre
            </Button>
            {canEvaluate && active.runId && (
              <Button variant="ghost" size="sm" onClick={() => onCancel(active.runId!)}>
                <Square className="h-3.5 w-3.5" aria-hidden="true" />
                Arrêter
              </Button>
            )}
          </>
        ) : (
          <>
            {canEvaluate && (
              <Button size="sm" onClick={onEvaluate}>
                Évaluer
              </Button>
            )}
            {latest && (
              <Button variant="ghost" size="sm" onClick={() => onOpen(latest.id)}>
                Détail
              </Button>
            )}
          </>
        )}
      </div>
    </Card>
  )
}

/**
 * The « Qualité » tab of Agents IA (E27): what the agents did for the team and how useful it was, the errors that
 * repeat, and the evaluations that measure each agent on a frozen set, before any change of model.
 */
export function QualityTab({ initialDashboard, initialPage, evaluate, onOpenRun }: { initialDashboard: QualityDashboard; initialPage: QualityPage; evaluate?: EvaluationPreset & { suite?: string }; onOpenRun: (id: string) => void }) {
  const [dashboard, setDashboard] = useState(initialDashboard)
  const [page, setPage] = useState(initialPage)
  const [loading, setLoading] = useState(false)
  const [dialog, setDialog] = useState<{ suite: SuiteView; preset?: EvaluationPreset } | null>(() => {
    const suite = evaluate?.suite && isSuiteId(evaluate.suite) ? initialPage.suites.find((s) => s.id === evaluate.suite) : null
    return suite && initialPage.canEvaluate ? { suite, preset: { role: evaluate?.role, model: evaluate?.model } } : null
  })
  const [opened, setOpened] = useState<string | null>(null)
  const running = page.suites.some((s) => s.active)

  // While an evaluation runs, its progress is read every few seconds.
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      api<QualityPage>("/api/ai/evaluations")
        .then(setPage)
        .catch(() => undefined)
    }, 4_000)
    return () => clearInterval(timer)
  }, [running])

  async function period(days: Period) {
    setLoading(true)
    try {
      setDashboard(await api<QualityDashboard>(`/api/ai/quality?days=${days}`))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chargement impossible")
    } finally {
      setLoading(false)
    }
  }

  async function refresh() {
    setPage(await api<QualityPage>("/api/ai/evaluations"))
  }

  async function cancel(runId: string) {
    try {
      await api(`/api/ai/runs/${runId}/cancel`, { method: "POST" })
      toast.success("Évaluation arrêtée : ses cas déjà faits restent")
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    }
  }

  const d = dashboard
  const agents = d.agents.filter((a) => a.runs > 0 || a.usefulness?.samples)
  const failures = d.errors.reduce((s, e) => s + e.count, 0)
  return (
    <div className="space-y-8">
      <section aria-labelledby="quality-usage" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="quality-usage" className="text-lg font-bold">
              Ce que les agents ont fait pour l’équipe
            </h2>
            <p className="text-sm text-muted-foreground">Exécutions réelles : les tests de skills et les évaluations sont comptés à part.</p>
          </div>
          <div className="inline-flex rounded-lg border p-0.5" role="group" aria-label="Période">
            {PERIODS.map((p) => (
              <button key={p} type="button" onClick={() => period(p)} disabled={loading} aria-pressed={d.days === p} className={cn("rounded-md px-3 py-1 text-sm font-medium transition-colors", d.days === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                {p} j
              </button>
            ))}
          </div>
        </div>

        <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", loading && "opacity-60")}>
          <Kpi label="Exécutions" value={d.totals.runs.toLocaleString("fr-FR")} />
          <Kpi label="Réussite" value={percent(d.totals.successRate)} hint="Parmi les exécutions terminées" />
          <Kpi label="Dépense" value={formatEur(d.totals.costEur)} hint={`+ ${formatEur(d.totals.evaluationsEur)} d’évaluations, ${formatEur(d.totals.testsEur)} de tests`} />
          <Kpi label="Erreurs distinctes" value={String(d.errors.length)} hint={d.errors.length ? `${failures} ${plural(failures, "exécution", "exécutions")} en échec` : "Aucune sur la période"} />
        </div>

        <Card className={cn("overflow-hidden", loading && "opacity-60")}>
          {agents.length ? (
            <div className="relative overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Qualité par agent sur {d.days} jours</caption>
                <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Agent
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      Exécutions
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Réussite
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      Coût moyen
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      Durée médiane
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Utilité
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {agents.map((a) => (
                    <tr key={a.id} className="align-top">
                      <th scope="row" className="px-4 py-3 text-left font-medium">
                        {a.label}
                      </th>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {a.runs}
                        {a.failed > 0 && <span className="block text-xs text-destructive-text">{a.failed} en échec</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Meter value={a.successRate} label={`Réussite de ${a.label}`} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{a.costPerRunEur == null ? "—" : formatEur(a.costPerRunEur)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatMeasure("duration", a.medianMs)}</td>
                      <td className="px-4 py-3">
                        {a.usefulness ? (
                          <div className="space-y-0.5">
                            <p className="text-xs font-medium">{a.usefulness.label}</p>
                            {a.usefulness.samples ? <Meter value={a.usefulness.value} label={a.usefulness.label} /> : null}
                            <p className="text-xs text-muted-foreground">{a.usefulness.detail}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-5 text-sm text-muted-foreground">Aucune exécution sur les {d.days} derniers jours.</p>
          )}
        </Card>

        <div className="grid gap-3 lg:grid-cols-3">
          <Card className="space-y-2 p-4">
            <h3 className="text-sm font-bold">Offres suggérées</h3>
            <p className="text-sm">
              <span className="font-semibold tabular-nums">{d.offers.accepted}</span> {plural(d.offers.accepted, "retenue", "retenues")}, <span className="font-semibold tabular-nums">{d.offers.rejected}</span> {plural(d.offers.rejected, "écartée", "écartées")}
              {d.offers.pending > 0 && <span className="text-muted-foreground">, {d.offers.pending} sans décision</span>}
            </p>
            {d.offers.reasons.length > 0 && (
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {d.offers.reasons.map((r) => (
                  <li key={r.reason} className="flex justify-between gap-2">
                    <span>{r.label}</span>
                    <span className="tabular-nums">{r.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="space-y-2 p-4">
            <h3 className="text-sm font-bold">Brouillons envoyés</h3>
            <p className="text-sm">
              <span className="font-semibold tabular-nums">{d.drafts.sent}</span> sur {d.drafts.created} brouillons · retouche médiane <span className="font-semibold tabular-nums">{percent(d.drafts.medianEdit)}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {d.drafts.nearlyAsWritten} envoyés presque tels quels (moins de 10 % de mots changés), {d.drafts.rewritten} réécrits à plus de moitié.
            </p>
          </Card>
          <Card className="space-y-2 p-4">
            <h3 className="text-sm font-bold">Classements de Jev confirmés</h3>
            <ul className="space-y-1 text-xs">
              {[...d.replies.byOutcome.map((o) => ({ ...o, what: "Réponses" })), ...d.relevance.byOutcome.map((o) => ({ ...o, what: "Fiches" }))]
                .filter((o) => o.cases > 0)
                .map((o) => (
                  <li key={`${o.what}-${o.outcome}`} className="flex justify-between gap-2">
                    <span>
                      {o.what} · {OUTCOME_LABELS[o.outcome]}
                    </span>
                    <span className="tabular-nums">
                      {o.agreed} / {o.cases}
                    </span>
                  </li>
                ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              {d.replies.labels} {plural(d.replies.labels, "réponse classée", "réponses classées")} par l’équipe à ce jour, objectif {d.replies.target} : elles deviennent un jeu d’évaluation.
            </p>
          </Card>
        </div>

        {d.errors.length > 0 && (
          <Card className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
              <CircleAlert className="h-4 w-4 text-warning" aria-hidden="true" />
              Erreurs qui reviennent
            </h3>
            <ul className="divide-y text-sm">
              {d.errors.map((e) => (
                <li key={`${e.agentId}-${e.message}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <Badge variant="outline">{e.agentLabel}</Badge>
                  {/* On a phone the message takes its own line, under the agent and the count. */}
                  <span className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">{e.message}</span>
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums sm:ml-0">
                    ×{e.count} · {day.format(new Date(e.lastAt))}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => onOpenRun(e.runId)}>
                    Voir
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section aria-labelledby="quality-evals" className="space-y-4">
        <div>
          <h2 id="quality-evals" className="text-lg font-bold">
            Évaluations
          </h2>
          <p className="text-sm text-muted-foreground">
            Chaque agent rejoue un jeu de référence figé, sans réseau, avec le modèle en service et ceux que vous comparez ; ce que le juge note l’est par {page.judge.label}. Le coût s’affiche avant le lancement, et aucun modèle ne change sans une évaluation de moins de 30 jours.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {page.suites.map((s) => (
            <SuiteCard key={s.id} suite={s} canEvaluate={page.canEvaluate} onEvaluate={() => setDialog({ suite: s })} onOpen={setOpened} onCancel={cancel} />
          ))}
        </div>

        {page.recent.length > 0 && (
          <Card className="overflow-hidden">
            <div className="relative overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Évaluations récentes</caption>
                <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Date
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Agent
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Modèles
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Statut
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      Coût
                    </th>
                    <th scope="col" className="px-4 py-2">
                      <span className="sr-only">Ouvrir</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {page.recent.map((e) => (
                    <tr key={e.id}>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">{day.format(new Date(e.createdAt))}</td>
                      <td className="px-4 py-2 font-medium">{e.suiteLabel}</td>
                      <td className="px-4 py-2 text-muted-foreground">{e.contenders.map((c) => c.label).join(" · ")}</td>
                      <td className="px-4 py-2">{e.status && <Badge variant={RUN_STATUS_TONE[e.status]}>{ACTIVE_STATUSES.includes(e.status) ? `${RUN_STATUS_LABELS[e.status]} · ${e.done}/${e.cases * e.contenders.length}` : RUN_STATUS_LABELS[e.status]}</Badge>}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatEur(e.costEur)}</td>
                      <td className="px-4 py-2 text-right">
                        <Button variant="ghost" size="sm" onClick={() => setOpened(e.id)}>
                          Détail
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {dialog && (
        <EvaluationDialog
          suite={dialog.suite}
          preset={dialog.preset}
          onClose={() => setDialog(null)}
          onStarted={(e) => {
            setDialog(null)
            setOpened(e.id)
            void refresh()
          }}
        />
      )}
      <EvaluationSheet id={opened} onClose={() => setOpened(null)} />
    </div>
  )
}
