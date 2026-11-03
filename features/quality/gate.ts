import { prisma } from "@/lib/prisma"
import { modelLabel, type AiRole } from "@/lib/ai/models"
import { LeadError } from "@/features/leads/errors"
import { EVIDENCE_DAYS, SUITES_INFO, type ContenderResult, type SuiteId } from "./labels"
import { compare, type Comparison } from "./metrics"

/**
 * No model change without a measure (E27, docs/crm-v1/AGENTS-IA.md §20): before a role, or an agent, works with another
 * model, every suite the change touches must have evaluated that model against the one in service, on the current
 * reference set, less than EVIDENCE_DAYS ago. A regression is shown and must be confirmed; it is not forbidden, since the
 * owner may trade a little quality for a much lower cost — knowingly. Going back to a role's default needs no proof.
 */
export interface SuiteEvidence {
  suite: SuiteId
  label: string
  evaluation: { id: string; at: string; cases: number; quick: boolean } | null
  baseline: Pick<ContenderResult, "contender" | "score" | "measures" | "hard"> | null
  candidate: Pick<ContenderResult, "contender" | "score" | "measures" | "hard"> | null
  /** Null when the model was itself the one in service when it was measured. */
  comparison: Comparison | null
}

export interface ModelEvidence {
  role: AiRole
  model: string
  modelLabel: string
  suites: SuiteEvidence[]
  missing: SuiteId[]
  regressions: SuiteId[]
}

/** The proof, suite by suite, that `model` was measured standing in for `role`. */
export async function modelEvidence(workspaceId: string, change: { role: AiRole; model: string; suites: readonly SuiteId[] }, now = new Date()): Promise<ModelEvidence> {
  // Loaded when asked: the reference sets are heavy, and the agents' definitions import this module.
  const { SUITES } = await import("./suites")
  const since = new Date(now.getTime() - EVIDENCE_DAYS * 86_400_000)
  const suites = await Promise.all(
    change.suites.map(async (suite): Promise<SuiteEvidence> => {
      const row = await prisma.aiEvaluation.findFirst({
        where: { workspaceId, suite, role: change.role, source: "reference", datasetVersion: SUITES[suite].version, contenders: { has: change.model }, finishedAt: { gte: since }, run: { status: "SUCCEEDED" } },
        orderBy: { finishedAt: "desc" },
        select: { id: true, finishedAt: true, caseIds: true, results: true },
      })
      const results = Array.isArray(row?.results) ? (row.results as unknown as ContenderResult[]) : null
      const baseline = results?.[0] ?? null
      // A model the Gateway refused on every case was not measured: no proof.
      const candidate = results?.find((r) => r.contender === change.model && r.cases > 0) ?? null
      const pick = (r: ContenderResult | null) => r && { contender: r.contender, score: r.score, measures: r.measures, hard: r.hard }
      return {
        suite,
        label: SUITES_INFO[suite].label,
        evaluation: row && candidate ? { id: row.id, at: row.finishedAt!.toISOString(), cases: row.caseIds.length, quick: row.caseIds.length < SUITES[suite].cases.length } : null,
        baseline: pick(baseline),
        candidate: pick(candidate),
        comparison: baseline && candidate && baseline.contender !== candidate.contender ? compare(baseline, candidate) : null,
      }
    })
  )
  return {
    role: change.role,
    model: change.model,
    modelLabel: modelLabel(change.model),
    suites,
    missing: suites.filter((s) => !s.evaluation).map((s) => s.suite),
    regressions: suites.filter((s) => s.comparison?.verdict === "regression").map((s) => s.suite),
  }
}

const names = (ids: readonly SuiteId[]) => ids.map((id) => SUITES_INFO[id].label).join(", ")

/**
 * Refuses a change without its proof, or a regression not confirmed, with what to do; returns the proof otherwise, for
 * the audit log. `what` completes « Avant de … » in the message.
 */
export async function requireEvidence(workspaceId: string, change: { role: AiRole; model: string; suites: readonly SuiteId[]; what: string }, acceptRegression: boolean): Promise<ModelEvidence> {
  const evidence = await modelEvidence(workspaceId, change)
  if (evidence.missing.length) {
    throw new LeadError("conflict", `Avant de ${change.what}, évaluez ${evidence.modelLabel} sur : ${names(evidence.missing)}. Lancez l'évaluation dans Agents IA › Qualité ; elle reste valable ${EVIDENCE_DAYS} jours.`, 409, { gate: "missing", evidence })
  }
  if (evidence.regressions.length && !acceptRegression) {
    throw new LeadError("conflict", `${evidence.modelLabel} fait moins bien que le modèle en service sur : ${names(evidence.regressions)}. Confirmez le changement en connaissance de cause.`, 409, { gate: "regression", evidence })
  }
  return evidence
}

/** What the audit log keeps of a proof. */
export const evidenceSummary = (e: ModelEvidence) => ({
  model: e.model,
  role: e.role,
  suites: e.suites.map((s) => ({ suite: s.suite, evaluationId: s.evaluation?.id ?? null, score: s.candidate?.score ?? null, baseline: s.baseline?.score ?? null, verdict: s.comparison?.verdict ?? null })),
  acceptedRegressions: e.regressions,
})
