import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { LeadError } from "@/features/leads/errors"
import type { ModelDeps } from "@/features/ai/calls"
import { RetryableError, type HandlerContext } from "@/features/ai/handlers"
import { recordStep } from "@/features/ai/runs"
import { workflowInstructions } from "@/features/ai/runtime"
import { activeOffers } from "@/features/offers/service"
import { latestFor } from "@/features/prospect-audit/latest"
import { AREAS, auditReportSchema, type Scores } from "@/features/prospect-audit/schemas"
import { playbookFor } from "@/features/prospect-audit/sectors"
import { researchEvidence, withResearch } from "@/features/research/evidence"
import { buildPitch, composePitch, settleRoles } from "./advisor"
import { NO_ACTIVE_OFFER, NO_AUDIT, NO_CANDIDATE, candidatesFor, type Candidate } from "./rules"

/**
 * The Conseiller offres' work in the worker (E21, docs/crm-v1/AGENTS-IA.md §14): read the audit, match it with the
 * active catalogue, let the advisor rank and argue, keep what is sourced, save. Safe to run again after a retry: a
 * pitch already saved for the run is returned as it is.
 */
export const PITCH_SKILLS = ["script-appel-15min"] as const

export interface PitchOutputSummary {
  pitchId: string
  recommendations: number
}

/** On-demand skills worth giving for this pitch: the call script, the sector's playbook, ads when an ads offer is in play. */
export function pitchSkills(sector: string | null, candidates: readonly Candidate[]): string[] {
  return [...PITCH_SKILLS, playbookFor(sector), candidates.some((c) => c.offer.category === "ADS") ? "preparation-ads" : null].filter((s): s is string => !!s)
}

const auditIdOf = (input: unknown) => {
  const id = input && typeof input === "object" ? (input as Record<string, unknown>).auditId : null
  return typeof id === "string" && id.length <= 40 ? id : null
}

const nameOf = (candidates: readonly Candidate[], slug: string) => candidates.find((c) => c.offer.slug === slug)?.offer.name ?? slug

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new LeadError("conflict", "Exécution arrêtée", 409)
}

export async function runOfferPitch(job: HandlerContext, deps: ModelDeps = {}): Promise<{ output: PitchOutputSummary }> {
  const ctx = job.run
  const saved = await prisma.offerPitch.findUnique({ where: { runId: ctx.id }, select: { id: true, _count: { select: { recommendations: true } } } })
  if (saved) return { output: { pitchId: saved.id, recommendations: saved._count.recommendations } }

  const lead = await prisma.lead.findFirst({
    where: { id: ctx.leadId ?? "", workspaceId: ctx.workspaceId },
    select: { id: true, companyId: true, company: { select: { name: true, sector: true, city: true, domain: true, website: true } } },
  })
  if (!lead?.company) throw new LeadError("not_found", "Fiche introuvable", 404)
  // The audit the person saw when asking; the fiche's latest one if it has gone since.
  const wanted = auditIdOf(job.input)
  const row = (wanted ? await prisma.prospectAudit.findFirst({ where: { id: wanted, workspaceId: ctx.workspaceId } }) : null) ?? (await latestFor(ctx.workspaceId, lead))
  if (!row) throw new LeadError("conflict", NO_AUDIT, 409)
  const parsed = auditReportSchema.safeParse(row.report)
  if (!parsed.success) throw new LeadError("conflict", "Le rapport de l’audit est illisible : relancez l’audit, puis le pitch.", 409)
  // E30: a recent creation or takeover, or an absence from the answer engines, call for offers too.
  const report = withResearch(parsed.data, await researchEvidence(lead.companyId))
  await recordStep(ctx, { type: "TOOL", name: "get_audit", input: { auditId: row.id }, output: { score: row.score, findings: report.findings.length, evidence: report.evidence.length, signals: report.signals.map((s) => s.key) } })

  const offers = await activeOffers(ctx.workspaceId)
  const candidates = candidatesFor(report, offers)
  await recordStep(ctx, { type: "TOOL", name: "list_offers", input: { active: offers.length }, output: { candidates: candidates.map((c) => ({ offer: c.offer.slug, signals: c.signals.map((s) => s.key) })) } })
  if (!offers.length) throw new LeadError("conflict", NO_ACTIVE_OFFER, 409)
  if (!candidates.length) throw new LeadError("conflict", NO_CANDIDATE, 409)
  throwIfAborted(job.signal)

  const scores = Object.fromEntries(AREAS.map((a) => [a, ((row.scores ?? {}) as Partial<Scores>)[a] ?? null])) as Scores
  const facts = { company: { name: lead.company.name, sector: lead.company.sector, city: lead.company.city }, audit: { createdAt: row.createdAt, domain: row.domain, score: row.score, scores, summary: row.summary, report } }
  const runtime = await workflowInstructions(ctx, pitchSkills(lead.company.sector, candidates))
  const { output, model } = await composePitch(ctx, runtime, facts, candidates, deps, job.signal)
  throwIfAborted(job.signal)
  if (!output) throw new RetryableError("Le Conseiller offres n’a pas rendu de pitch lisible.")
  const built = buildPitch(output, candidates, report)
  // Another try may cite properly; three at most, within the run's cap.
  if (!built.recommendations.length) throw new RetryableError("Le Conseiller offres n’a relié aucune offre à une preuve de l’audit.")

  const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: ctx.id }, select: { costMicros: true } })
  const pitch = await prisma.$transaction(async (tx) => {
    // An offer deactivated during the call is no longer recommended (assertActiveOffers' rule, checked where it is saved).
    const rows = await tx.offer.findMany({ where: { workspaceId: ctx.workspaceId, status: "ACTIVE", slug: { in: built.recommendations.map((r) => r.slug) } } })
    const active = new Map(rows.map((o) => [o.slug, o]))
    const kept = settleRoles(built.recommendations.filter((r) => active.has(r.slug)))
    if (!kept.length) throw new LeadError("conflict", "Les offres recommandées ont été retirées du catalogue entre-temps : relancez le pitch.", 409)
    const notes = [...built.notes, ...built.recommendations.filter((r) => !active.has(r.slug)).map((r) => `« ${nameOf(candidates, r.slug)} » retirée : elle n’est plus active dans le catalogue.`)]
    return tx.offerPitch.create({
      data: {
        workspaceId: ctx.workspaceId,
        leadId: lead.id,
        auditId: row.id,
        runId: ctx.id,
        headline: built.headline,
        script: built.script as unknown as Prisma.InputJsonValue,
        objections: built.objections as unknown as Prisma.InputJsonValue,
        emailAngle: built.email ? (built.email as unknown as Prisma.InputJsonValue) : undefined,
        evidence: built.evidence as unknown as Prisma.InputJsonValue,
        notes,
        model,
        costMicros: run.costMicros,
        createdById: ctx.requester?.id ?? null,
        recommendations: {
          create: kept.map((r, i) => {
            const o = active.get(r.slug)!
            return {
              workspaceId: ctx.workspaceId,
              offerId: o.id,
              rank: i + 1,
              role: r.role,
              offerSlug: o.slug,
              offerName: o.name,
              category: o.category,
              priceMinEur: o.priceMinEur,
              priceMaxEur: o.priceMaxEur,
              billing: o.billing,
              priceNote: o.priceNote,
              fit: r.fit,
              signals: r.signals,
              why: r.why,
              gain: r.gain,
              evidence: r.evidence,
              objection: r.objection?.objection ?? null,
              answer: r.objection?.answer ?? null,
            }
          }),
        },
      },
      select: { id: true, recommendations: { select: { offerSlug: true, role: true }, orderBy: { rank: "asc" } } },
    })
  })
  await recordStep(ctx, { type: "TOOL", name: "save_recommendations", input: { leadId: lead.id, auditId: row.id }, output: { pitchId: pitch.id, offers: pitch.recommendations.map((r) => `${r.offerSlug} (${r.role})`) } })
  return { output: { pitchId: pitch.id, recommendations: pitch.recommendations.length } }
}
