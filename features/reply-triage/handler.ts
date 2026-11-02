import { prisma } from "@/lib/prisma"
import { LeadError } from "@/features/leads/errors"
import { decideForRun, type ModelDeps } from "@/features/ai/calls"
import type { HandlerContext } from "@/features/ai/handlers"
import { startSystemRun } from "@/features/ai/runs"
import { TRIAGE_QUESTIONS, triageFields, triageState, type TriageFields } from "./rules"

const REFUSED: TriageFields = { replyClass: null, classConfidence: null, outcome: "HUMAN", urgency: null, urgencyConfidence: null, needsAction: null, actionConfidence: null }

/**
 * The Analyste réponses in the worker (E22): Jev files each new reply of a fiche, with its probabilities. A run takes
 * every reply of the fiche still waiting, so replies that arrive together are filed by one run. Safe to run again: a
 * reply already filed by Jev is skipped.
 */
export const TRIAGE_BATCH = 10

const emailIdsOf = (input: unknown): string[] => {
  const ids = input && typeof input === "object" ? (input as Record<string, unknown>).emailIds : null
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string" && x.length <= 40).slice(0, TRIAGE_BATCH) : []
}

/** Replies Jev has not seen and no person has filed: the ones named, and the fiche's others. */
const waiting = (workspaceId: string, leadId: string | null, ids: string[]) =>
  prisma.emailMessage.findMany({
    where: { workspaceId, direction: "INBOUND", isTest: false, replyClass: null, triage: null, OR: [{ id: { in: ids } }, ...(leadId ? [{ leadId }] : [])] },
    orderBy: { createdAt: "asc" },
    take: TRIAGE_BATCH,
    select: { id: true, subject: true, bodyText: true, fromEmail: true, repliesToId: true },
  })

export async function runReplyTriage(job: HandlerContext, deps: ModelDeps = {}): Promise<{ output: { triaged: number } }> {
  const ctx = job.run
  const replies = await waiting(ctx.workspaceId, ctx.leadId, emailIdsOf(job.input))
  let triaged = 0
  for (const reply of replies) {
    if (job.signal.aborted) throw new LeadError("conflict", "Exécution arrêtée", 409)
    const sent = reply.repliesToId ? await prisma.emailMessage.findUnique({ where: { id: reply.repliesToId }, select: { subject: true } }) : null
    const fields = await decideForRun(
      ctx,
      // The reply's text stays in the mailbox: the run's history keeps only which reply was read.
      { name: "classify_reply", state: triageState(reply, sent?.subject ?? null), stateForLog: `Réponse ${reply.id}`, questions: TRIAGE_QUESTIONS, abortSignal: job.signal },
      deps
    )
      .then(({ answers, model }) => ({ model, ...triageFields(answers) }))
      .catch((error: unknown) => {
        // Jev declined: the reply waits for a person, « à classer », and the run goes on with the next one.
        if (error instanceof LeadError && error.extra?.refusal) return { model: "refus", ...REFUSED }
        throw error
      })
    // A reply filed meanwhile by a person, or by an earlier try, keeps what it has.
    const created = await prisma.replyTriage.createMany({ data: [{ workspaceId: ctx.workspaceId, emailId: reply.id, runId: ctx.id, ...fields }], skipDuplicates: true })
    triaged += created.count
  }
  return { output: { triaged } }
}

/**
 * Queues the filing of new replies of a fiche, without a requester (nobody asked: the mailbox received them). Never
 * throws: the reply is stored whatever happens here, and the worker's sweep catches what could not be queued.
 */
export async function enqueueTriage(workspaceId: string, leadId: string, emailIds: string[]): Promise<"queued" | "busy" | "skipped"> {
  try {
    await startSystemRun(workspaceId, { agentId: "replies", leadId, status: "QUEUED", input: { emailIds: emailIds.slice(0, TRIAGE_BATCH) } })
    return "queued"
  } catch (error) {
    // A run of the fiche is already waiting or working: it takes every reply of the fiche, this one included.
    if (error instanceof LeadError && error.status === 409 && /travaille déjà/.test(error.message)) return "busy"
    console.warn("[REPLY_TRIAGE] not queued", error instanceof Error ? error.message : error)
    return "skipped"
  }
}

/** How far back the sweep looks, how long it lets the fast path work first, and how long a fiche rests after a run. */
const SWEEP_WINDOW_MS = 7 * 24 * 3600_000
const SWEEP_GRACE_MS = 2 * 60_000
const SWEEP_REST_MS = 30 * 60_000

/**
 * The worker's catch-up (every maintenance pass): replies still waiting a while after they arrived, whose run could not
 * be queued or started too early, are queued again, a few fiches at a time.
 */
export async function sweepTriage(now = new Date()): Promise<number> {
  const rows = await prisma.emailMessage.findMany({
    where: { direction: "INBOUND", isTest: false, replyClass: null, triage: null, leadId: { not: null }, createdAt: { gte: new Date(now.getTime() - SWEEP_WINDOW_MS), lte: new Date(now.getTime() - SWEEP_GRACE_MS) } },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: { id: true, workspaceId: true, leadId: true },
  })
  const byLead = new Map<string, { workspaceId: string; ids: string[] }>()
  for (const r of rows) {
    const entry = byLead.get(r.leadId!) ?? { workspaceId: r.workspaceId, ids: [] }
    entry.ids.push(r.id)
    byLead.set(r.leadId!, entry)
  }
  // A fiche whose run failed rests a while: a model down or a budget spent is not retried every pass.
  const recent = await prisma.agentRun.findMany({
    where: { agentId: "replies", leadId: { in: [...byLead.keys()] }, createdAt: { gte: new Date(now.getTime() - SWEEP_REST_MS) } },
    select: { leadId: true },
  })
  const resting = new Set(recent.map((r) => r.leadId))
  let queued = 0
  for (const [leadId, { workspaceId, ids }] of [...byLead].filter(([leadId]) => !resting.has(leadId)).slice(0, 10)) {
    if ((await enqueueTriage(workspaceId, leadId, ids)) === "queued") queued++
  }
  return queued
}
