import type { Prisma } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import type { AiRole } from "@/lib/ai/models"
import { LeadError } from "@/features/leads/errors"
import type { HandlerContext } from "@/features/ai/handlers"
import { recordStep } from "@/features/ai/runs"
import { isSuiteId, type ContenderResult, type SuiteId } from "./labels"
import { aggregate, type CaseRow } from "./metrics"
import { SUITES } from "./suites"
import type { CaseResult, EvalDeps, SuiteEnv } from "./cases/env"

/**
 * An evaluation in the worker (E27): every contender on every case of the evaluation, one after the other (decisions a
 * few at a time), each case saved as soon as it is done. Safe to run again after a restart: saved cases are skipped. A
 * case that fails counts as a wrong answer; a model the Gateway refuses three times is left out for the rest. The run's
 * cap holds for the whole evaluation: when it is reached, the cases done so far are the result.
 */
export const EVALUATION = "evaluation"

const inputSchema = z.object({ kind: z.literal(EVALUATION), evaluationId: z.string().min(1).max(40) })

/** A passing failure gets one more try, a little later; three access refusals in a row leave the model out. */
const RETRY_MS = 2_000
const ACCESS_LIMIT = 3

const isRunOver = (error: unknown) => error instanceof LeadError && (error.code === "budget_exceeded" || error.code === "conflict")
const isAccess = (error: unknown) => error instanceof LeadError && (error.code === "forbidden" || /n'est pas disponible sur la passerelle/.test(error.message))
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 500)
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue

async function attempt(run: () => Promise<CaseResult>, signal: AbortSignal): Promise<CaseResult> {
  try {
    return await run()
  } catch (error) {
    if (!(error instanceof LeadError && error.code === "unavailable") || signal.aborted) throw error
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS))
    return run()
  }
}

/** Runs `work` on each item, `size` at a time; the first error stops the others from starting. */
async function pool<T>(items: readonly T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  let failure: unknown = null
  const lane = async () => {
    while (failure === null && next < items.length) {
      const item = items[next++]
      try {
        await work(item)
      } catch (error) {
        failure ??= error
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, lane))
  if (failure !== null) throw failure
}

type StoredCase = { contender: string; ok: boolean; score: number | null; detail: unknown; error: string | null; costMicros: number; judgeMicros: number; durationMs: number }

export const rowOf = (c: StoredCase): CaseRow => ({
  ok: c.ok,
  score: c.score,
  detail: c.detail,
  error: c.error,
  costMicros: c.costMicros,
  judgeMicros: c.judgeMicros,
  durationMs: c.durationMs,
  skipped: !!(c.detail && typeof c.detail === "object" && (c.detail as Record<string, unknown>).skipped === true),
})

/** Each contender's results, from its saved cases, in the evaluation's order. */
export function resultsFrom(suite: SuiteId, contenders: readonly string[], cases: readonly StoredCase[]): ContenderResult[] {
  return contenders.map((c) =>
    aggregate(
      suite,
      c,
      cases.filter((x) => x.contender === c).map(rowOf)
    )
  )
}

export async function runEvaluation(job: HandlerContext, deps: EvalDeps = {}): Promise<{ output: { kind: typeof EVALUATION; evaluationId: string; suite: SuiteId; scores: Record<string, number | null> } }> {
  const { evaluationId } = inputSchema.parse(job.input)
  const ctx = job.run
  const evaluation = await prisma.aiEvaluation.findFirst({ where: { id: evaluationId, workspaceId: ctx.workspaceId, runId: ctx.id } })
  if (!evaluation || !isSuiteId(evaluation.suite)) throw new LeadError("not_found", "Évaluation introuvable", 404)
  const suiteId = evaluation.suite
  const suite = SUITES[suiteId]
  const env: SuiteEnv = { ctx, role: evaluation.role as AiRole, deps, signal: job.signal, cache: new Map() }
  const saved = await prisma.aiEvaluationCase.findMany({ where: { evaluationId }, select: { contender: true, caseId: true } })
  const done = new Set(saved.map((c) => `${c.contender}\n${c.caseId}`))

  const save = (contender: string, caseId: string, data: Omit<Prisma.AiEvaluationCaseCreateManyInput, "evaluationId" | "contender" | "caseId">) =>
    prisma.aiEvaluationCase.createMany({ data: [{ evaluationId, contender, caseId, ...data }], skipDuplicates: true })

  for (const contender of evaluation.contenders) {
    let refused = 0
    let refusal = ""
    const todo = evaluation.caseIds.filter((id) => !done.has(`${contender}\n${id}`))
    const started = Date.now()
    await pool(todo, suite.parallel, async (caseId) => {
      if (job.signal.aborted) throw new LeadError("conflict", "Exécution arrêtée", 409)
      if (refused >= ACCESS_LIMIT) {
        await save(contender, caseId, { ok: false, score: null, detail: { skipped: true }, error: `Non évalué : ${refusal}` })
        return
      }
      const t = Date.now()
      try {
        const r = await attempt(() => suite.run(env, contender, caseId), job.signal)
        refused = 0
        await save(contender, caseId, { ok: r.ok, score: r.score, detail: json(r.detail), costMicros: Math.max(r.costMicros, 0), judgeMicros: Math.max(r.judgeMicros, 0), durationMs: Date.now() - t })
      } catch (error) {
        // The run is over (cap reached, stopped): what is saved stands as the result.
        if (isRunOver(error)) throw error
        if (isAccess(error)) {
          refused++
          refusal = messageOf(error)
        }
        await save(contender, caseId, { ok: false, score: 0, detail: {}, error: messageOf(error), durationMs: Date.now() - t })
      }
    })
    await recordStep(ctx, { type: "TOOL", name: "evaluate", input: { contender, cases: todo.length }, output: { suite: suiteId, role: evaluation.role }, durationMs: Date.now() - started })
  }

  const cases = await prisma.aiEvaluationCase.findMany({ where: { evaluationId }, select: { contender: true, ok: true, score: true, detail: true, error: true, costMicros: true, judgeMicros: true, durationMs: true } })
  const results = resultsFrom(suiteId, evaluation.contenders, cases)
  await prisma.aiEvaluation.update({ where: { id: evaluationId }, data: { results: json(results), finishedAt: new Date() } })
  return { output: { kind: EVALUATION, evaluationId, suite: suiteId, scores: Object.fromEntries(results.map((r) => [r.contender, r.score])) } }
}
