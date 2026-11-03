import { AUDITS, auditById } from "@/evals/audits"
import { workflowInstructions } from "@/features/ai/runtime"
import { OFFERS_V1 } from "@/features/offers/catalog-v1"
import type { SkillOffer } from "@/features/offers/skill"
import { buildPitch, composePitch } from "@/features/offer-pitch/advisor"
import { pitchSkills } from "@/features/offer-pitch/handler"
import { candidatesFor } from "@/features/offer-pitch/rules"
import { EVAL_NOW } from "../frozen"
import { pinned, spent, type CaseRunner } from "./env"

/**
 * The Conseiller offres on a reference audit (E27): the real advisor of features/offer-pitch, with the V1 catalogue as
 * if every offer were active, whatever the workspace activated. Right when the main offer is one a good advisor would
 * lead with, wrong when it recommends an excluded one; every argument must cite existing evidence.
 */
export const OFFERS_CASES = AUDITS.map((a) => a.id)

/** The V1 catalogue, frozen: the reference set's expectations are written against it. */
export const FROZEN_OFFERS: readonly SkillOffer[] = OFFERS_V1.map((o) => ({
  slug: o.slug,
  name: o.name,
  category: o.category,
  summary: o.summary,
  deliverables: [...o.deliverables],
  signals: [...o.signals],
  priceMinEur: o.priceMinEur,
  priceMaxEur: o.priceMaxEur,
  billing: o.billing,
  priceNote: o.priceNote ?? null,
  angle: o.angle,
  objections: o.objections.map((x) => ({ ...x })),
}))

export const offersCase: CaseRunner = async (env, contender, caseId) => {
  const ref = auditById(caseId)
  if (!ref) throw new Error(`Audit de référence inconnu : ${caseId}`)
  const ctx = pinned(env, contender, { offers: FROZEN_OFFERS })
  const before = await spent(ctx.id)
  const candidates = candidatesFor(ref.audit.report, FROZEN_OFFERS)
  const runtime = await workflowInstructions(ctx, pitchSkills(ref.company.sector, candidates))
  const facts = { company: ref.company, audit: { createdAt: EVAL_NOW, domain: ref.audit.domain, score: ref.audit.score, scores: ref.audit.scores, summary: ref.audit.summary, report: ref.audit.report } }
  const { output } = await composePitch(ctx, runtime, facts, candidates, env.deps, env.signal)
  if (!output) throw new Error("Le Conseiller offres n’a pas rendu de pitch lisible.")
  const built = buildPitch(output, candidates, ref.audit.report)

  const known = new Set(ref.audit.report.evidence.map((e) => e.id))
  const cited = [...output.recommendations.map((r) => r.evidence), output.script.hook.evidence, output.email.evidence]
  const valid = cited.filter((ids) => ids.length > 0 && ids.every((id) => known.has(id))).length
  const main = built.recommendations.find((r) => r.role === "MAIN")?.slug ?? null
  const pack = built.recommendations.map((r) => r.slug)
  const forbidden = pack.filter((slug) => ref.expect.never.includes(slug))
  const mainHit = !!main && ref.expect.main.includes(main)
  return {
    ok: mainHit && !forbidden.length && valid === cited.length,
    // The main offer decides the call: right, or at least in the pack, or not there at all; an excluded offer spoils it.
    score: forbidden.length ? 0 : mainHit ? 1 : pack.some((slug) => ref.expect.main.includes(slug)) ? 0.5 : 0,
    detail: {
      main,
      mainHit,
      pack,
      expected: ref.expect.main,
      never: ref.expect.never,
      forbidden,
      candidates: candidates.map((c) => c.offer.slug),
      evidence: { valid, total: cited.length },
      headline: built.headline,
      notes: built.notes,
    },
    costMicros: (await spent(ctx.id)) - before,
    judgeMicros: 0,
  }
}
