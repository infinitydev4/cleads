import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { LeadError } from "@/features/leads/errors"
import type { ModelDeps } from "@/features/ai/calls"
import type { HandlerContext } from "@/features/ai/handlers"
import { recordStep, type RunContext } from "@/features/ai/runs"
import { workflowInstructions } from "@/features/ai/runtime"
import { analyze, extractContent, keepEvidenced, toPoints } from "./analysis"
import { ANNUAIRE_SOURCE, LEGAL_BASIS, findCompany, type CompanyRecord } from "@/features/enrichment/sources/annuaire"
import { collectSite, type PageFetcher, type SiteFacts } from "./collect"
import { isSocialProfile, networkOf } from "./html"
import { hostOf, siteUrl } from "./net"
import { runPageSpeed, type PsiResult, type Strategy } from "./pagespeed"
import { lowAreas, measure, overallScore, type AuditFacts, type Listing, type Measured } from "./rules"
import { AREAS, SEVERITIES, auditReportSchema, type Analysis, type AuditReport, type Scores, type SignalHit, type SiteContent } from "./schemas"
import { playbookFor } from "./sectors"

/**
 * The Auditeur digital's work in the worker (E20, docs/crm-v1/AGENTS-IA.md §13): collect, measure, read, analyse,
 * save. A coded workflow, not a free agent: the code decides every step, the models only read and judge. Safe to run
 * again after a retry: an audit already saved for the run is returned as it is.
 */
export const AUDIT_SKILLS = ["audit-seo-local", "audit-geo-site", "audit-ux-conversion", "presence-sociale", "preparation-ads"] as const
export const AUDIT_TTL_DAYS = 30

export interface AuditDeps extends ModelDeps {
  fetchPage?: PageFetcher
  pageSpeed?: (url: string, strategy: Strategy) => Promise<PsiResult>
  annuaire?: typeof findCompany
  now?: () => Date
}

export interface AuditOutput {
  auditId: string
  status: "COMPLETE" | "PARTIAL"
  score: number | null
}

const SEVERITY_RANK = Object.fromEntries(SEVERITIES.map((s, i) => [s, i])) as Record<(typeof SEVERITIES)[number], number>

function socialsOf(value: unknown): string[] {
  if (!value || typeof value !== "object") return []
  return Object.values(value as Record<string, unknown>).filter((v): v is string => typeof v === "string" && !!networkOf(v))
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new LeadError("conflict", "Exécution arrêtée", 409)
}

const siteSummary = (site: SiteFacts) => ({
  reachable: site.reachable,
  finalUrl: site.finalUrl,
  status: site.status,
  https: site.https,
  redirects: site.redirects,
  pages: site.pages.map((p) => p.url),
  blockedByRobots: site.blockedByRobots,
  failure: site.failure,
  sitemap: site.sitemap,
  llmsTxt: site.llmsTxt,
})

const psiSummary = (r: PsiResult | null) => (!r ? null : r.ok ? { scores: r.scores, lab: r.lab, field: r.field, screenshot: !!r.screenshot } : { error: r.error })

/** Measured facts, the model's reading and the registry, merged into what is saved and shown. */
export function buildReport(facts: AuditFacts, measured: Measured, analysis: Analysis | null, models: { extraction: string | null; analysis: string | null }, now: Date): { scores: Scores; score: number | null; summary: string[]; report: AuditReport } {
  const known = new Set(measured.evidence.map((e) => e.id))
  const judged = analysis ? keepEvidenced(analysis.findings, known).map((f) => ({ ...f, origin: "analysis" as const })) : []
  const findings = [...measured.findings, ...judged].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]).slice(0, 40)

  const scores = Object.fromEntries(AREAS.map((a) => [a, measured.scores[a] ?? null])) as Scores
  if (measured.captures.length && analysis?.imageScore != null) scores.image = analysis.imageScore
  // The model's reading of the screenshots counts as much as the rules on the pages; without a readable site, nothing.
  if (scores.conversion != null && analysis?.conversionScore != null) scores.conversion = Math.round((scores.conversion + analysis.conversionScore) / 2)

  const signals = new Map<string, Set<string>>()
  const addSignals = (list: readonly SignalHit[]) => list.forEach((s) => signals.set(s.key, new Set([...(signals.get(s.key) ?? []), ...s.evidence])))
  addSignals(measured.signals)
  if (analysis) addSignals(keepEvidenced(analysis.signals, known))
  const low = lowAreas(scores)
  if (low.length >= 3) {
    const evidence = findings.filter((f) => low.includes(f.area)).flatMap((f) => f.evidence)
    addSignals([{ key: "three_low_scores", evidence: [...new Set(evidence)].slice(0, 6).length ? [...new Set(evidence)].slice(0, 6) : [measured.evidence[0].id] }])
  }

  const summary = (analysis?.summary ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 3)
  for (const f of findings) if (summary.length < 3 && !summary.includes(f.title)) summary.push(f.title)

  const r: CompanyRecord | null = facts.registry
  const report: AuditReport = {
    findings,
    strengths: [...measured.strengths, ...(analysis ? toPoints(keepEvidenced(analysis.strengths, known)) : [])].slice(0, 8),
    frictions: analysis ? toPoints(keepEvidenced(analysis.frictions, known)).slice(0, 8) : [],
    opportunities: analysis ? toPoints(keepEvidenced(analysis.opportunities, known)).slice(0, 8) : [],
    signals: [...signals].map(([key, evidence]) => ({ key: key as SignalHit["key"], evidence: [...evidence].slice(0, 8) })),
    evidence: measured.evidence,
    people: r && !r.opposition ? r.officers.map((o) => ({ name: o.name, role: o.role, source: `${ANNUAIRE_SOURCE}, ${r.url}`, legalBasis: LEGAL_BASIS, collectedAt: now.toISOString() })) : [],
    registry: r ? { siren: r.siren, name: r.name, naf: r.naf, legalForm: r.legalForm, createdOn: r.createdOn, active: r.active, employees: r.employees, labels: r.labels, opposition: r.opposition, url: r.url } : null,
    site: facts.site ? { reachable: facts.site.reachable, pages: facts.site.pages.map((p) => p.url), cms: facts.site.stack?.cms ? `${facts.site.stack.cms.name}${facts.site.stack.cms.version ? ` ${facts.site.stack.cms.version}` : ""}` : null, blockedByRobots: facts.site.blockedByRobots } : null,
    notes: measured.notes.slice(0, 12),
    models,
  }
  return { scores, score: overallScore(scores), summary, report: auditReportSchema.parse(report) }
}

async function loadLead(ctx: RunContext) {
  const lead = await prisma.lead.findFirst({
    where: { id: ctx.leadId ?? "", workspaceId: ctx.workspaceId },
    select: { id: true, companyId: true, company: { select: { name: true, phone: true, website: true, domain: true, rating: true, reviewCount: true, sector: true, city: true, postalCode: true, siret: true, source: true, data: true } } },
  })
  if (!lead) throw new LeadError("not_found", "Fiche introuvable", 404)
  if (!lead.company) throw new LeadError("invalid", "La fiche n'a pas d'entreprise à auditer.", 400)
  return { ...lead, company: lead.company }
}

export async function runAudit(job: HandlerContext, deps: AuditDeps = {}): Promise<{ output: AuditOutput }> {
  const ctx = job.run
  const now = deps.now?.() ?? new Date()
  const saved = await prisma.prospectAudit.findUnique({ where: { runId: ctx.id }, select: { id: true, status: true, score: true } })
  if (saved) return { output: { auditId: saved.id, status: saved.status, score: saved.score } }
  const lead = await loadLead(ctx)
  const c = lead.company
  const data = (c.data && typeof c.data === "object" ? c.data : {}) as Record<string, unknown>
  const listing: Listing = {
    name: c.name,
    phone: c.phone,
    website: c.website,
    rating: c.rating,
    reviewCount: c.reviewCount,
    category: c.sector,
    city: c.city,
    postalCode: c.postalCode,
    socials: socialsOf(data.socials),
    sourceUrl: typeof data.sourceUrl === "string" && /^https:\/\//.test(data.sourceUrl) ? data.sourceUrl : null,
    fromExtractor: c.source === "EXTRACTOR",
  }
  const website = siteUrl(c.website ?? c.domain)
  const socialOnly = isSocialProfile(website)

  let site: SiteFacts | null = null
  if (website && !socialOnly) {
    const started = Date.now()
    site = await collectSite(website, deps.fetchPage)
    await recordStep(ctx, { type: "TOOL", name: "fetch_page", input: { url: website }, output: siteSummary(site), durationMs: Date.now() - started })
    if (site.stack) await recordStep(ctx, { type: "TOOL", name: "detect_stack", input: { pages: site.pages.length }, output: site.stack })
  }
  throwIfAborted(job.signal)

  const target = site?.reachable ? site.finalUrl : null
  const speed = deps.pageSpeed ?? ((url: string, strategy: Strategy) => runPageSpeed(url, strategy))
  const started = Date.now()
  const siren = (typeof data.siren === "string" ? data.siren : null) ?? c.siret?.replace(/\D/g, "").slice(0, 9) ?? null
  const [mobile, desktop, registry] = await Promise.all([
    target ? speed(target, "mobile") : Promise.resolve(null),
    target ? speed(target, "desktop") : Promise.resolve(null),
    (deps.annuaire ?? findCompany)({ siren, name: c.name, postalCode: c.postalCode }),
  ])
  if (target) await recordStep(ctx, { type: "TOOL", name: "pagespeed", input: { url: target }, output: { mobile: psiSummary(mobile), desktop: psiSummary(desktop) }, durationMs: Date.now() - started })
  await recordStep(ctx, {
    type: "TOOL",
    name: "dirigeants",
    input: { siren, byName: !siren },
    // Names stay out of the run's history: the audit keeps them, with their source and legal basis.
    output: registry.record ? { siren: registry.record.siren, officers: registry.record.officers.length, opposition: registry.record.opposition, labels: registry.record.labels } : { found: false, error: registry.error },
    durationMs: Date.now() - started,
  })
  throwIfAborted(job.signal)

  const facts: AuditFacts = { sector: c.sector, listing, website, socialOnly, site, psi: { mobile, desktop }, registry: registry.record, registryError: registry.error }
  let extraction: { content: SiteContent | null; model: string | null } = { content: null, model: null }
  if (site?.reachable) extraction = await extractContent(ctx, site, deps, job.signal)
  const measured = measure(facts, extraction.content, now)
  throwIfAborted(job.signal)

  const runtime = await workflowInstructions(ctx, [...AUDIT_SKILLS, playbookFor(c.sector)].filter((s): s is string => !!s))
  const { analysis, model } = await analyze(ctx, runtime, facts, measured, extraction.content, deps, job.signal)
  const built = buildReport(facts, measured, analysis, { extraction: extraction.model, analysis: model }, now)

  const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: ctx.id }, select: { costMicros: true } })
  const shots = measured.captures.flatMap((cap) => {
    const r = facts.psi[cap.kind]
    return r?.ok && r.screenshot ? [{ kind: cap.kind, mediaType: r.screenshot.mediaType, data: r.screenshot.data }] : []
  })
  const audit = await prisma.prospectAudit.create({
    data: {
      workspaceId: ctx.workspaceId,
      leadId: lead.id,
      companyId: lead.companyId,
      runId: ctx.id,
      domain: hostOf(site?.finalUrl ?? website),
      url: site?.finalUrl ?? website,
      status: measured.partial ? "PARTIAL" : "COMPLETE",
      scores: built.scores as unknown as Prisma.InputJsonValue,
      score: built.score,
      summary: built.summary,
      report: built.report as unknown as Prisma.InputJsonValue,
      costMicros: run.costMicros,
      validUntil: new Date(now.getTime() + AUDIT_TTL_DAYS * 86_400_000),
      createdById: ctx.requester?.id ?? null,
      captures: { create: shots.map((s) => ({ kind: s.kind, mediaType: s.mediaType, data: new Uint8Array(s.data) })) },
    },
    select: { id: true, status: true, score: true },
  })
  await recordStep(ctx, { type: "TOOL", name: "save_audit", input: { leadId: lead.id }, output: { auditId: audit.id, status: audit.status, score: audit.score, findings: built.report.findings.length } })
  return { output: { auditId: audit.id, status: audit.status, score: audit.score } }
}
