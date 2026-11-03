import { prisma } from "@/lib/prisma"
import type { AiRole } from "@/lib/ai/models"
import type { ModelDeps } from "@/features/ai/calls"
import type { RunContext, RunEvaluation } from "@/features/ai/runs"
import type { Renderer } from "@/features/studio/render"
import { JUDGE_MODEL } from "../labels"

/**
 * What every case of an evaluation runs with (E27): the evaluation's run, the role whose model the contender replaces,
 * the worker's browser, and a cache shared by the contenders of one evaluation (a frozen site is rendered once).
 */
export interface EvalDeps extends ModelDeps {
  /** The worker's Chromium (worker/browser.ts): screenshots of the frozen sites, renders of the Designer's pages. */
  renderer?: Renderer
}

export interface SuiteEnv {
  ctx: RunContext
  role: AiRole
  deps: EvalDeps
  signal: AbortSignal
  cache: Map<string, unknown>
}

export interface CaseResult {
  /** Fully right by the suite's own standard. */
  ok: boolean
  /** 0-1: the suite's grade of the answer. */
  score: number
  detail: Record<string, unknown>
  /** What the contender's own calls cost. */
  costMicros: number
  /** What grading the answer cost: the judge, never counted against the contender. */
  judgeMicros: number
}

export type CaseRunner = (env: SuiteEnv, contender: string, caseId: string) => Promise<CaseResult>

/** The evaluation's run as the contender sees it: its model pinned for the evaluated role, without fallbacks. */
export function pinned(env: SuiteEnv, contender: string, extra: Omit<RunEvaluation, "models"> = {}): RunContext {
  return { ...env.ctx, evaluation: { ...extra, models: { [env.role]: contender } } }
}

/** The same run, for the judge: always the same model, whatever is compared. */
export const judged = (env: SuiteEnv): RunContext => ({ ...env.ctx, evaluation: { models: { writer: JUDGE_MODEL } } })

/** What the run has cost so far: a case's own cost is the difference, its cases running one after the other. */
export async function spent(runId: string): Promise<number> {
  return (await prisma.agentRun.findUniqueOrThrow({ where: { id: runId }, select: { costMicros: true } })).costMicros
}

export const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

export function cached<T>(env: SuiteEnv, key: string, make: () => Promise<T>): Promise<T> {
  const hit = env.cache.get(key) as Promise<T> | undefined
  if (hit) return hit
  const made = make()
  env.cache.set(key, made)
  // A failure is not kept: the next contender tries again.
  made.catch(() => env.cache.delete(key))
  return made
}
