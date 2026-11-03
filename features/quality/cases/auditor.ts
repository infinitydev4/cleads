import { SITES, siteById, type FrozenSite } from "@/evals/sites"
import { workflowInstructions } from "@/features/ai/runtime"
import { analyze, extractContent } from "@/features/prospect-audit/analysis"
import { collectSite } from "@/features/prospect-audit/collect"
import { AUDIT_SKILLS, buildReport } from "@/features/prospect-audit/handler"
import { isSocialProfile } from "@/features/prospect-audit/html"
import { siteUrl } from "@/features/prospect-audit/net"
import { measure } from "@/features/prospect-audit/rules"
import { playbookFor } from "@/features/prospect-audit/sectors"
import { EVAL_NOW, frozenFacts, frozenFetcher, frozenPsi } from "../frozen"
import { cached, pinned, spent, type CaseRunner, type SuiteEnv } from "./env"

/**
 * The Auditeur on a frozen site (E27): the real workflow of features/prospect-audit — collect, read (fast model),
 * measure, analyse (the agent's model), merge — fed by evals/sites.ts instead of the network. The contender replaces
 * the model of the evaluated role: the reading step for "fast", the analysis for the agent's own role.
 */
export const AUDITOR_CASES = SITES.map((s) => s.id)

/** The frozen home page as the worker's browser shows it, first screen on a computer and on a phone, once per evaluation. */
function screenshots(env: SuiteEnv, site: FrozenSite): Promise<{ desktop: Buffer; mobile: Buffer } | null> {
  const renderer = env.deps.renderer
  const home = site.pages["/"]
  if (!renderer || !home) return Promise.resolve(null)
  return cached(env, `shots:${site.id}`, async () => {
    const session = await renderer()
    try {
      const page = await session.render(home, new Map())
      const desktop = page.tiles.find((t) => t.label.startsWith("ordinateur"))
      const mobile = page.tiles.find((t) => t.label.startsWith("téléphone"))
      return desktop && mobile ? { desktop: Buffer.from(desktop.data), mobile: Buffer.from(mobile.data) } : null
    } finally {
      await session.close()
    }
  })
}

export const auditorCase: CaseRunner = async (env, contender, caseId) => {
  const site = siteById(caseId)
  if (!site) throw new Error(`Site figé inconnu : ${caseId}`)
  const ctx = pinned(env, contender)
  const before = await spent(ctx.id)

  const website = siteUrl(site.website)
  const collected = website && !isSocialProfile(website) ? await collectSite(website, frozenFetcher(site)) : null
  const target = collected?.reachable ? collected.finalUrl : null
  const shots = target ? await screenshots(env, site).catch(() => null) : null
  const facts = frozenFacts(site, collected, {
    mobile: target ? frozenPsi(site, "mobile", shots?.mobile ?? null) : null,
    desktop: target ? frozenPsi(site, "desktop", shots?.desktop ?? null) : null,
  })
  const extraction = collected?.reachable ? await extractContent(ctx, collected, env.deps, env.signal) : { content: null, model: null }
  const measured = measure(facts, extraction.content, EVAL_NOW)
  const runtime = await workflowInstructions(ctx, [...AUDIT_SKILLS, playbookFor(site.sector)].filter((s): s is string => !!s))
  const { analysis, model } = await analyze(ctx, runtime, facts, measured, extraction.content, env.deps, env.signal)
  const built = buildReport(facts, measured, analysis, { extraction: extraction.model, analysis: model }, EVAL_NOW)

  const found = built.report.signals.map((s) => s.key)
  const missing = site.expect.signals.filter((k) => !found.includes(k))
  const forbidden = site.expect.absent.filter((k) => found.includes(k))
  // Every element of the analysis, before the code drops what cites nothing: one invented id is a made-up proof.
  const known = new Set(measured.evidence.map((e) => e.id))
  const items = analysis ? [...analysis.findings, ...analysis.strengths, ...analysis.frictions, ...analysis.opportunities, ...analysis.signals] : []
  const valid = items.filter((i) => i.evidence.length > 0 && i.evidence.every((id) => known.has(id))).length
  const reading = site.read && extraction.content ? { right: Number(extraction.content.faq === site.read.faq) + Number(extraction.content.entityClear === site.read.entityClear), total: 2 } : null

  const recall = site.expect.signals.length ? 1 - missing.length / site.expect.signals.length : 1
  const specificity = site.expect.absent.length ? 1 - forbidden.length / site.expect.absent.length : 1
  const evidence = items.length ? valid / items.length : 1
  return {
    ok: !missing.length && !forbidden.length && valid === items.length,
    score: (recall + specificity + evidence) / 3,
    detail: {
      expected: site.expect.signals,
      absent: site.expect.absent,
      found,
      missing,
      forbidden,
      evidence: { valid, total: items.length },
      reading,
      captures: !!shots,
      summary: built.summary,
      findings: built.report.findings.slice(0, 12).map((f) => f.title),
    },
    costMicros: (await spent(ctx.id)) - before,
    judgeMicros: 0,
  }
}
