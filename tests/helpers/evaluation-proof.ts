import type { PrismaClient } from "@prisma/client"
import type { SuiteId } from "@/features/quality/labels"
import type { AiRole } from "@/lib/ai/models"

/**
 * A finished evaluation of `model` against `baseline` for `role`, on each suite named (E27): what a change of model
 * needs before it is saved (features/quality/gate.ts). Scores default to equivalent ones.
 */
export async function proveModel(
  prisma: PrismaClient,
  input: { workspaceId: string; requestedById: string; suites: readonly SuiteId[]; role: AiRole; baseline: string; model: string; scores?: [number, number] }
) {
  const { SUITES } = await import("@/features/quality/suites")
  const [a, b] = input.scores ?? [85, 85]
  const result = (contender: string, score: number) => ({ contender, score, cases: 10, ok: 8, failed: 0, skipped: 0, measures: { cost: 0.001, duration: 900 }, hard: [], costMicros: 1, judgeMicros: 0 })
  for (const suite of input.suites) {
    const run = await prisma.agentRun.create({ data: { workspaceId: input.workspaceId, agentId: suite, status: "SUCCEEDED", capMicros: 1, requestedById: input.requestedById, finishedAt: new Date() } })
    await prisma.aiEvaluation.create({
      data: {
        workspaceId: input.workspaceId,
        suite,
        role: input.role,
        contenders: [input.baseline, input.model],
        source: "reference",
        datasetVersion: SUITES[suite].version,
        caseIds: [...SUITES[suite].quick],
        estimateMicros: 1,
        results: [result(input.baseline, a), result(input.model, b)],
        runId: run.id,
        finishedAt: new Date(),
        requestedById: input.requestedById,
      },
    })
  }
}
