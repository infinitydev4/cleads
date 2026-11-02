import { prisma } from "@/lib/prisma"
import { LeadError } from "@/features/leads/errors"
import { decideForRun, type ModelDeps } from "@/features/ai/calls"
import type { HandlerContext } from "@/features/ai/handlers"
import { startRun } from "@/features/ai/runs"
import { visibleLeads } from "@/features/metrics/service"
import { RELEVANCE_QUESTIONS, relevanceFields, relevanceState, type RelevanceFields } from "./rules"

/**
 * The Analyste qualification in the worker (E25): Jev judges each fiche of a campaign it has not judged yet, one
 * decision per fiche. A run takes a batch; while fiches remain, it queues the next batch for the same person, a few
 * times at most, so one import of a few hundred fiches is sorted without anyone asking again.
 */
export const RELEVANCE_BATCH = 40
/** Batches one import can chain (MAX_CHAIN × RELEVANCE_BATCH fiches). */
export const MAX_CHAIN = 10

const REFUSED: RelevanceFields = { verdict: null, confidence: null, outcome: "HUMAN" }

interface RelevanceInput {
  leadIds: string[]
  chain: number
}

export const relevanceInputOf = (input: unknown): RelevanceInput => {
  const v = input && typeof input === "object" ? (input as Record<string, unknown>) : {}
  const ids = Array.isArray(v.leadIds) ? v.leadIds.filter((x): x is string => typeof x === "string" && x.length <= 40).slice(0, RELEVANCE_BATCH) : []
  return { leadIds: ids, chain: typeof v.chain === "number" && Number.isInteger(v.chain) ? v.chain : 0 }
}

export async function runQualifier(job: HandlerContext, deps: ModelDeps = {}): Promise<{ output: { campaignId: string; judged: number; next: boolean } }> {
  const ctx = job.run
  const user = ctx.requester
  if (!user) throw new LeadError("forbidden", "Le tri des fiches travaille toujours pour une personne.", 403)
  const run = await prisma.agentRun.findUnique({ where: { id: ctx.id }, select: { campaignId: true } })
  const campaign = run?.campaignId
    ? await prisma.campaign.findFirst({ where: { id: run.campaignId, workspaceId: ctx.workspaceId }, include: { offer: { select: { name: true, summary: true, signals: true } } } })
    : null
  if (!campaign) throw new LeadError("not_found", "Campagne introuvable.", 404)
  const input = relevanceInputOf(job.input)

  // The fiches named, still in the campaign, visible to the person, and not judged yet (an earlier try may have).
  const fiches = await prisma.lead.findMany({
    where: { AND: [visibleLeads(user, { campaignId: campaign.id }), { id: { in: input.leadIds } }, { relevances: { none: { campaignId: campaign.id } } }] },
    select: { id: true, company: { select: { name: true, sector: true, city: true, postalCode: true, website: true, rating: true, reviewCount: true, phone: true, email: true } } },
  })
  const target = { name: campaign.name, sector: campaign.sector, area: campaign.area, offer: campaign.offer }
  let judged = 0
  for (const fiche of fiches) {
    if (job.signal.aborted) throw new LeadError("conflict", "Exécution arrêtée", 409)
    const c = fiche.company
    const state = relevanceState(target, { company: c && { name: c.name, sector: c.sector, city: c.city, postalCode: c.postalCode, website: c.website, rating: c.rating, reviewCount: c.reviewCount, hasPhone: !!c.phone, hasEmail: !!c.email } })
    const { fields, model } = await decideForRun(ctx, { name: "score_import", state, stateForLog: `Fiche ${fiche.id}`, questions: RELEVANCE_QUESTIONS, abortSignal: job.signal }, deps)
      .then(({ answers, model }) => ({ fields: relevanceFields(answers.relevance), model }))
      .catch((error: unknown) => {
        // Jev declined: the fiche waits for a person, and the batch goes on.
        if (error instanceof LeadError && error.extra?.refusal) return { fields: REFUSED, model: "refus" }
        throw error
      })
    const created = await prisma.leadRelevance.createMany({
      data: [{ workspaceId: ctx.workspaceId, leadId: fiche.id, campaignId: campaign.id, offerName: campaign.offer?.name ?? null, runId: ctx.id, model, ...fields }],
      skipDuplicates: true,
    })
    judged += created.count
  }

  // More fiches wait: the next batch, for the same person, unless the chain is long enough already.
  const remaining =
    input.chain + 1 < MAX_CHAIN
      ? await prisma.lead.findMany({
          where: { AND: [visibleLeads(user, { campaignId: campaign.id }), { relevances: { none: { campaignId: campaign.id } } }, { id: { notIn: fiches.map((f) => f.id) } }] },
          select: { id: true },
          orderBy: { createdAt: "desc" },
          take: RELEVANCE_BATCH,
        })
      : []
  let next = false
  if (remaining.length) {
    next = await startRun(user, { agentId: "qualifier", campaignId: campaign.id, status: "QUEUED", input: { leadIds: remaining.map((r) => r.id), chain: input.chain + 1 } })
      .then(() => true)
      .catch((error: unknown) => {
        // Out of budget or quota: what is sorted stays sorted, the rest waits for « Trier les fiches ».
        console.warn("[RELEVANCE] next batch not queued", error instanceof Error ? error.message : error)
        return false
      })
  }
  return { output: { campaignId: campaign.id, judged, next } }
}
