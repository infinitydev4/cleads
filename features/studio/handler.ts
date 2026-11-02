import type { GeneratedSite } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { LeadError } from "@/features/leads/errors"
import { generateForRun, type ModelDeps } from "@/features/ai/calls"
import { RetryableError, type HandlerContext } from "@/features/ai/handlers"
import { recordStep, remainingMicros, type RunContext } from "@/features/ai/runs"
import { workflowInstructions } from "@/features/ai/runtime"
import type { PageFetcher } from "@/features/prospect-audit/collect"
import { siteUrl } from "@/features/prospect-audit/net"
import { runPageSpeed, type PsiResult, type Strategy } from "@/features/prospect-audit/pagespeed"
import { auditReportSchema, type AuditReport } from "@/features/prospect-audit/schemas"
import { playbookFor } from "@/features/prospect-audit/sectors"
import { allowedFonts, auditPoints, cleanBrief, ficheFacts } from "./brief"
import { collectStudioSite } from "./collect"
import { assembleDocument, pageBody, staticChecks, type StaticChecks } from "./document"
import { downloadFonts, fontFaceCss, fontStack } from "./fonts"
import { average } from "./labels"
import { addDays, hashToken, PROBE_MINUTES, PURGE_DAYS, previewHost, previewUrl, randomToken } from "./link"
import { brandColors } from "./palette"
import { briefPrompt, critiquePrompt, fixPrompt, pagePrompt, revisePrompt, type PageContext } from "./prompts"
import type { PageAsset, PreparedImage, RenderedPage, Renderer } from "./render"
import { extractBody, sanitizeBody, type SanitizeReport } from "./sanitize"
import { briefOutputSchema, briefSchema, collectedSchema, critiqueSchema, designerInputSchema, type Brief, type Collected, type Critique, type DesignerInput, type LabScores, type VersionChecks, type VersionScores } from "./schemas"
import { compileCss, type PageTheme } from "./tailwind"

/**
 * The Designer web in the worker (E23, docs/crm-v1/AGENTS-IA.md §16). Three kinds of run:
 * - `brief`: read the site (no model), prepare its images in the browser, then write a brief a person can edit;
 * - `build`: write the page from the brief, then sanitise, compile, render, check with axe-core, have it critiqued
 *   and corrected (two rounds at most, within the run's cap), publish the best version and measure it on PageSpeed;
 * - `revise`: the same loop from the current version and a person's instruction.
 * Safe to run again: a brief or a version already saved by the run is returned as it is.
 */
export const BRIEF_OUTPUT_TOKENS = 8_000
/** A whole page: Opus reasons first (2 000 to 4 000 tokens), then writes 8 000 to 15 000 tokens of markup. */
export const PAGE_OUTPUT_TOKENS = 24_000
export const CRITIQUE_OUTPUT_TOKENS = 4_000
export const MAX_ROUNDS = 2
/** What a correction needs left in the run (an Opus page and its critique); below, the best version so far is kept. */
export const ROUND_RESERVE_MICROS = 650_000
export const CRITIQUE_RESERVE_MICROS = 80_000

export interface DesignerDeps extends ModelDeps {
  /** The worker's browser (worker/browser.ts); tests give a fake. */
  renderer?: Renderer
  fetchPage?: PageFetcher
  /** Fonts and the PageSpeed warm-up request. */
  fetchImpl?: typeof fetch
  pagespeed?: (url: string, strategy: Strategy) => Promise<PsiResult>
  /** Overrides STUDIO_PREVIEW_HOST; null skips the PageSpeed measure. */
  previewHost?: string | null
  now?: () => Date
}

type Site = GeneratedSite

const noBrowser = (): never => {
  throw new RetryableError("Le navigateur du worker n’est pas disponible : la maquette sera reprise.")
}

async function roleOf(ctx: RunContext, pick: readonly string[]) {
  const runtime = await workflowInstructions(ctx, pick)
  return { runtime, role: runtime.agent.modelRole === "decision" ? ("designer" as const) : runtime.agent.modelRole }
}

// ── Brief ────────────────────────────────────────────────────────────────────────────────────────────────────────

async function writeBrief(job: HandlerContext, site: Site, deps: DesignerDeps): Promise<{ siteId: string }> {
  const ctx = job.run
  if (site.status === "BRIEF_READY" && site.lastRunId === ctx.id) return { siteId: site.id }
  const lead = await prisma.lead.findFirst({
    where: { id: site.leadId, workspaceId: ctx.workspaceId },
    select: { company: { select: { name: true, sector: true, address: true, postalCode: true, city: true, phone: true, email: true, rating: true, reviewCount: true, website: true, domain: true } } },
  })
  const company = lead?.company
  if (!company) throw new LeadError("not_found", "Fiche introuvable", 404)
  const audit = site.auditId ? await prisma.prospectAudit.findUnique({ where: { id: site.auditId }, select: { report: true } }) : null
  const report = audit ? auditReportSchema.safeParse(audit.report) : null

  // 1. The site, without a model.
  const website = siteUrl(company.website) ?? (company.domain ? `https://${company.domain}` : null)
  let started = Date.now()
  const studio = await collectStudioSite(website, { fetchPage: deps.fetchPage })
  await recordStep(ctx, {
    type: "TOOL",
    name: "collect_site",
    input: { url: website },
    output: { reachable: studio.site?.reachable ?? false, pages: studio.site?.pages.length ?? 0, images: studio.images.length, colors: studio.colors.map((c) => c.hex), fonts: studio.fonts },
    durationMs: Date.now() - started,
  })
  if (job.signal.aborted) throw new RetryableError("Exécution interrompue")

  // 2. Images, prepared in the browser: decoded, resized, re-encoded, the logo's colours read.
  const notes = [...studio.notes]
  let prepared: PreparedImage[] = []
  if (studio.images.length) {
    started = Date.now()
    try {
      const session = await (deps.renderer ?? noBrowser)()
      try {
        prepared = await session.prepareImages(studio.images)
      } finally {
        await session.close()
      }
    } catch (error) {
      if (error instanceof RetryableError) throw error
      notes.push("Les images du site n’ont pas pu être préparées : la maquette utilisera des fonds neutres.")
    }
    await recordStep(ctx, { type: "TOOL", name: "prepare_images", input: { images: studio.images.length }, output: { prepared: prepared.map((p) => `${p.name} ${p.width}×${p.height}`) }, durationMs: Date.now() - started })
  }
  const source = new Map(studio.images.map((i) => [i.name, i]))
  const logo = prepared.find((p) => p.name === "logo")
  const colors = brandColors([...(logo?.colors ?? []).map((hex, i) => ({ hex, weight: 60 - i * 10, source: "logo" as const })), ...studio.colors])

  // 3. What the page may say, numbered.
  const sitePhone = studio.site?.pages.flatMap((p) => p.tel)[0] ?? null
  const siteEmail = studio.site?.pages.flatMap((p) => p.mailto).find((m) => !/noreply|no-reply|wordpress|example/i.test(m)) ?? null
  const facts = ficheFacts(company, { phone: sitePhone, email: siteEmail, booking: studio.booking, url: studio.site?.finalUrl ?? website })
  const address = [company.address, [company.postalCode, company.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null
  const pages = (studio.site?.pages ?? []).map((p, i) => ({ id: `P${i + 1}`, url: p.url, title: p.title, text: p.text.slice(0, 4_000) }))
  const auditList = report?.success ? auditPoints(report.data.findings) : []
  const fonts = allowedFonts(studio.fonts)
  const collected: Collected = {
    url: studio.site?.finalUrl ?? website,
    reachable: studio.site?.reachable ?? false,
    failure: studio.site?.failure ?? null,
    pages: pages.map((p) => ({ id: p.id, url: p.url, title: p.title })),
    colors: colors.slice(0, 8).map((c) => ({ hex: c.hex, source: c.source, weight: Math.round(c.weight) })),
    fonts: studio.fonts,
    images: prepared.map((p) => ({ name: p.name, kind: p.name === "logo" ? ("logo" as const) : ("image" as const), width: p.width, height: p.height, alt: source.get(p.name)?.alt ?? null, sourceUrl: source.get(p.name)?.sourceUrl ?? "" })),
    contact: { phone: company.phone ?? sitePhone, email: company.email ?? siteEmail, address, booking: studio.booking },
    facts,
    notes,
  }

  // 4. The brief.
  const { runtime, role } = await roleOf(ctx, ["charte-studio", "audit-ux-conversion", playbookFor(company.sector)].filter((s): s is string => !!s))
  const { output } = await generateForRun(
    ctx,
    {
      role,
      name: "write_brief",
      system: runtime.system,
      prompt: briefPrompt({ company: company.name, collected, pages, audit: auditList, fonts }),
      schema: briefOutputSchema({ assets: prepared.map((p) => p.name), fonts }),
      maxOutputTokens: BRIEF_OUTPUT_TOKENS,
      abortSignal: job.signal,
    },
    deps
  )
  if (!output) throw new RetryableError("Le Designer n’a pas rendu de brief lisible.")
  const known = new Set([...pages.map((p) => p.id), ...facts.map((f) => f.id), ...auditList.map((a) => a.id)])
  const cleaned = cleanBrief(output, { ids: known, assets: new Set(prepared.map((p) => p.name)), fonts, hasBooking: !!studio.booking, hasPhone: !!collected.contact.phone, hasEmail: !!collected.contact.email })
  collected.notes = [...notes, ...cleaned.notes].slice(0, 12)

  // 5. Saved together: the images, what was collected, the brief.
  await prisma.$transaction([
    prisma.generatedSiteAsset.deleteMany({ where: { siteId: site.id, kind: { in: ["logo", "image"] } } }),
    prisma.generatedSiteAsset.createMany({
      data: prepared.map((p) => ({ siteId: site.id, name: p.name, kind: p.name === "logo" ? "logo" : "image", mediaType: p.mediaType, data: Buffer.from(p.data), width: p.width, height: p.height, sourceUrl: source.get(p.name)?.sourceUrl ?? null, label: source.get(p.name)?.alt ?? null })),
    }),
    prisma.generatedSite.update({ where: { id: site.id }, data: { collected: collectedSchema.parse(collected), brief: cleaned.brief, status: "BRIEF_READY", briefEditedAt: null, briefEditedById: null } }),
  ])
  await recordStep(ctx, { type: "TOOL", name: "save_brief", output: { sections: cleaned.brief.sections.length, images: cleaned.brief.images.length, notes: cleaned.notes } })
  return { siteId: site.id }
}

// ── Build ────────────────────────────────────────────────────────────────────────────────────────────────────────

interface BuiltPage {
  body: string
  html: string
  report: SanitizeReport
  markup: StaticChecks
}

interface Candidate {
  page: BuiltPage
  rendered: RenderedPage
  checks: VersionChecks
  model: string
  round: number
}

/** Heading and body families, with the weights each one needs. */
function fontNeeds(brief: Brief): { family: string; weights: number[] }[] {
  const heading = [600, 700, 800]
  const body = [400, 500, 600, 700]
  return brief.fonts.heading === brief.fonts.body ? [{ family: brief.fonts.body, weights: [...body, 800] }] : [{ family: brief.fonts.heading, weights: heading }, { family: brief.fonts.body, weights: body }]
}

const fontSlug = (family: string) => family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 26)

/** The brief's two families, downloaded once per site and kept with its images. */
async function ensureFonts(siteId: string, brief: Brief, fetchImpl?: typeof fetch): Promise<string[]> {
  const notes: string[] = []
  const stored = await prisma.generatedSiteAsset.findMany({ where: { siteId, kind: "font" }, select: { name: true, label: true } })
  const has = new Set(stored.map((s) => s.label?.split(":")[0]))
  const missing = fontNeeds(brief).filter((f) => !has.has(f.family))
  if (!missing.length) return notes
  const { fonts, errors } = await downloadFonts(missing, fetchImpl)
  notes.push(...errors)
  const taken = new Set(stored.map((s) => s.name))
  const rows = fonts.map((f) => {
    let i = 1
    while (taken.has(`font-${fontSlug(f.family)}-${i}`)) i++
    const name = `font-${fontSlug(f.family)}-${i}`
    taken.add(name)
    return { siteId, name, kind: "font", mediaType: "font/woff2", data: Buffer.from(f.data), sourceUrl: f.url, label: `${f.family}:${f.weights.join(",")}` }
  })
  if (rows.length) await prisma.generatedSiteAsset.createMany({ data: rows })
  return notes
}

async function buildPage(text: string, opts: { assets: Map<string, { width: number | null; height: number | null; kind: string }>; theme: PageTheme; fontCss: string; company: string; description: string }): Promise<BuiltPage | null> {
  const raw = extractBody(text)
  if (!raw) return null
  const { html: body, report } = sanitizeBody(raw, { assets: opts.assets })
  if (!body.replace(/<[^>]+>/g, "").trim()) return null
  const { css, removed } = await compileCss(body, opts.theme)
  if (removed) report.removed["règle CSS chargeant une ressource"] = removed
  const html = assembleDocument({ company: opts.company, description: opts.description, body, css, fontCss: opts.fontCss, ink: "#0f172a", fontFamily: fontStack(opts.theme.body) })
  const logo = [...opts.assets].find(([, a]) => a.kind === "logo")?.[0] ?? null
  return { body, html, report, markup: staticChecks(body, logo) }
}

function checksOf(page: BuiltPage, rendered: RenderedPage, critique: Critique | null, rounds: number, notes: string[]): VersionChecks {
  const axe = rendered.axe
  const avg = critique ? average(critique.scores) : null
  const passed =
    page.markup.h1 === 1 &&
    !page.markup.placeholders.length &&
    (!axe || (axe.critical === 0 && axe.serious === 0)) &&
    (!critique || (avg! >= 3.8 && Object.values(critique.scores).every((s) => s >= 3) && !critique.issues.some((i) => i.severity === "high")))
  return {
    sanitizer: { removed: page.report.removed, images: page.report.images.length, links: page.report.links },
    markup: page.markup,
    axe,
    critique: critique && avg != null ? { ...critique, average: avg } : null,
    rounds,
    passed,
    notes,
  }
}

/** The version to publish: the best graded, a later round winning a tie (it fixed something). */
function best(candidates: readonly Candidate[]): Candidate {
  const grade = (c: Candidate) => {
    const axe = c.checks.axe
    return (c.checks.critique?.average ?? 3) + (c.checks.passed ? 1 : 0) - (axe ? axe.critical + axe.serious * 0.5 : 0) - (c.page.markup.h1 === 1 ? 0 : 0.5) - c.page.markup.placeholders.length * 0.5
  }
  return candidates.reduce((a, b) => (grade(b) >= grade(a) ? b : a))
}

const isRunOver = (error: unknown) => error instanceof LeadError && (error.code === "budget_exceeded" || error.code === "conflict")

async function critiqueOf(ctx: RunContext, system: string, page: BuiltPage, rendered: RenderedPage, brief: Brief, company: string, signal: AbortSignal, deps: DesignerDeps): Promise<{ critique: Critique | null; note: string | null }> {
  if ((await remainingMicros(ctx.id)) < CRITIQUE_RESERVE_MICROS) return { critique: null, note: "Critique visuelle non faite : le plafond de l’exécution est presque atteint." }
  const desktop = rendered.tiles.filter((t) => t.label.startsWith("ordinateur")).length
  try {
    const { output } = await generateForRun(
      ctx,
      {
        role: "writer",
        name: "critique_page",
        system,
        prompt: critiquePrompt({ company, brief, desktop, mobile: rendered.tiles.length - desktop, axe: rendered.axe, markup: page.markup }),
        schema: critiqueSchema,
        images: rendered.tiles.map((t) => ({ data: t.data, mediaType: t.mediaType })),
        maxOutputTokens: CRITIQUE_OUTPUT_TOKENS,
        abortSignal: signal,
      },
      deps
    )
    return { critique: output ?? null, note: output ? null : "La critique visuelle n’a pas rendu de grille lisible." }
  } catch (error) {
    if (isRunOver(error)) throw error
    return { critique: null, note: `Critique visuelle non faite : ${error instanceof Error ? error.message : "erreur"}` }
  }
}

/** The audit's PageSpeed figures for the prospect's site: the « before » of the comparison. */
function beforeScores(report: AuditReport | null, date: Date | null): VersionScores["before"] {
  const find = (label: string) => {
    const e = report?.evidence.find((x) => x.label === `Performance ${label} (PageSpeed)`)
    const n = e?.value ? parseInt(e.value, 10) : NaN
    return Number.isFinite(n) ? n : null
  }
  return { mobile: find("mobile"), desktop: find("ordinateur"), date: date?.toISOString() ?? null }
}

const lab = (r: PsiResult): LabScores | null => (r.ok ? { ...r.scores, lcpMs: r.lab.lcpMs } : null)

/** PageSpeed reads the published page through a token valid a quarter of an hour, never the shared link. */
async function measure(ctx: RunContext, site: Pick<Site, "id" | "auditId">, number: number, deps: DesignerDeps): Promise<void> {
  const host = deps.previewHost !== undefined ? deps.previewHost : previewHost()
  if (!host) return
  const now = deps.now?.() ?? new Date()
  const audit = site.auditId ? await prisma.prospectAudit.findUnique({ where: { id: site.auditId }, select: { report: true, createdAt: true } }) : null
  const report = audit ? auditReportSchema.safeParse(audit.report) : null
  const token = randomToken()
  const where = { siteId_number: { siteId: site.id, number } }
  await prisma.generatedSiteVersion.update({ where, data: { probeHash: hashToken(token), probeExpiresAt: new Date(now.getTime() + PROBE_MINUTES * 60_000) } })
  const url = previewUrl(token, host)!
  const started = Date.now()
  let scores: VersionScores | null = null
  try {
    // A first request wakes the function serving previews: PageSpeed then measures the page, not a cold start.
    await (deps.fetchImpl ?? fetch)(url, { signal: AbortSignal.timeout(15_000) }).catch(() => null)
    const psi = deps.pagespeed ?? ((u: string, s: Strategy) => runPageSpeed(u, s))
    const [mobile, desktop] = await Promise.all([psi(url, "mobile"), psi(url, "desktop")])
    scores = {
      measuredAt: new Date().toISOString(),
      before: beforeScores(report?.success ? report.data : null, audit?.createdAt ?? null),
      mobile: lab(mobile),
      desktop: lab(desktop),
      error: !mobile.ok && !desktop.ok ? mobile.error : null,
    }
  } finally {
    await prisma.generatedSiteVersion.update({ where, data: { probeHash: null, probeExpiresAt: null, ...(scores ? { scores: scores as object } : {}) } })
  }
  await recordStep(ctx, { type: "TOOL", name: "pagespeed", output: { mobile: scores?.mobile?.performance ?? null, desktop: scores?.desktop?.performance ?? null, error: scores?.error ?? null }, durationMs: Date.now() - started })
}

async function buildVersion(job: HandlerContext, site: Site, input: Exclude<DesignerInput, { kind: "brief" }>, deps: DesignerDeps): Promise<{ siteId: string; version: number }> {
  const ctx = job.run
  const saved = await prisma.generatedSiteVersion.findUnique({ where: { runId: ctx.id }, select: { number: true } })
  if (saved) return { siteId: site.id, version: saved.number }
  const parsed = briefSchema.safeParse(site.brief)
  if (!parsed.success) throw new LeadError("conflict", "Le brief de la maquette est illisible : relancez le brief.", 409)
  const brief = parsed.data
  const collected = collectedSchema.safeParse(site.collected)
  const contact = collected.success ? collected.data.contact : { phone: null, email: null, address: null, booking: null }
  const current = input.kind === "revise" && site.currentVersion ? await prisma.generatedSiteVersion.findUnique({ where: { siteId_number: { siteId: site.id, number: site.currentVersion } }, select: { html: true } }) : null
  const base = pageBody(current?.html ?? null)
  if (input.kind === "revise" && !base) throw new LeadError("conflict", "Aucune version à modifier : générez d’abord la maquette.", 409)

  const notes = await ensureFonts(site.id, brief, deps.fetchImpl)
  const assets = await prisma.generatedSiteAsset.findMany({ where: { siteId: site.id }, select: { name: true, kind: true, mediaType: true, data: true, width: true, height: true, label: true } })
  const fonts = assets.filter((a) => a.kind === "font" && [brief.fonts.heading, brief.fonts.body].includes(a.label?.split(":")[0] ?? ""))
  const fontCss = fontFaceCss(fonts.map((f) => ({ family: f.label!.split(":")[0], weights: (f.label!.split(":")[1] ?? "400").split(","), asset: f.name })))
  const images = new Map(assets.filter((a) => a.kind !== "font").map((a) => [a.name, { width: a.width, height: a.height, kind: a.kind }]))
  const files = new Map<string, PageAsset>(assets.map((a) => [a.name, { data: new Uint8Array(a.data), mediaType: a.mediaType }]))
  const theme: PageTheme = { primary: brief.palette.primary, accent: brief.palette.accent, heading: brief.fonts.heading, body: brief.fonts.body }
  const pageCtx: PageContext = {
    company: site.companyName,
    brief,
    contact,
    assets: assets.filter((a) => a.kind !== "font").map((a) => ({ name: a.name, kind: a.kind, width: a.width, height: a.height, label: brief.images.find((i) => i.name === a.name)?.alt ?? a.label })),
    fonts: { heading: brief.fonts.heading, body: brief.fonts.body },
  }
  const build = (text: string) => buildPage(text, { assets: images, theme, fontCss, company: site.companyName, description: brief.positioning })

  const { runtime, role } = await roleOf(ctx, ["charte-studio", "audit-ux-conversion"])
  const write = (name: string, prompt: string) => generateForRun(ctx, { role, name, system: runtime.system, prompt, maxOutputTokens: PAGE_OUTPUT_TOKENS, abortSignal: job.signal, stream: true }, deps)
  let answer = await write("build_page", input.kind === "revise" ? revisePrompt(pageCtx, base!, input.instruction) : pagePrompt(pageCtx))

  const candidates: Candidate[] = []
  const session = await (deps.renderer ?? noBrowser)()
  try {
    for (let round = 0; ; round++) {
      const cut = answer.finishReason === "length"
      const page = cut ? null : await build(answer.text)
      if (!page) {
        if (candidates.length) {
          notes.push(cut ? "La dernière correction a été coupée avant la fin : la version précédente est gardée." : "La dernière correction n’a pas rendu de page lisible : la version précédente est gardée.")
          break
        }
        if (cut) throw new LeadError("invalid", "La page générée a été coupée avant la fin (longueur maximale atteinte) : rien n’est publié. Simplifiez le brief (moins de sections) et relancez.", 400)
        throw new RetryableError("Le Designer n’a pas rendu de page lisible.")
      }
      let started = Date.now()
      const rendered = await session.render(page.html, files)
      await recordStep(ctx, { type: "TOOL", name: "render_preview", input: { round }, output: { heights: rendered.heights, axe: rendered.axe && { critical: rendered.axe.critical, serious: rendered.axe.serious }, removed: page.report.removed, h1: page.markup.h1 }, durationMs: Date.now() - started })
      started = Date.now()
      const { critique, note } = await critiqueOf(ctx, runtime.system, page, rendered, brief, site.companyName, job.signal, deps)
      const roundNotes = note ? [note] : []
      candidates.push({ page, rendered, checks: checksOf(page, rendered, critique, round, roundNotes), model: answer.model, round })
      const last = candidates[candidates.length - 1]
      if (last.checks.passed || round >= MAX_ROUNDS || !critique) break
      if ((await remainingMicros(ctx.id)) < ROUND_RESERVE_MICROS) {
        notes.push("Correction non faite : le plafond de l’exécution est presque atteint. La meilleure version est publiée.")
        break
      }
      try {
        answer = await write("fix_page", fixPrompt(pageCtx, page.body, { critique, axe: rendered.axe, markup: page.markup }))
      } catch (error) {
        if (isRunOver(error)) throw error
        notes.push(`La correction n’a pas abouti (${error instanceof Error ? error.message : "erreur"}) : la meilleure version est publiée.`)
        break
      }
    }
  } finally {
    await session.close()
  }

  // Publication: the best version, its renders and its checks.
  const chosen = best(candidates)
  const checks: VersionChecks = { ...chosen.checks, rounds: candidates.length - 1, notes: [...notes, ...chosen.checks.notes].slice(0, 10) }
  const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: ctx.id }, select: { costMicros: true } })
  const last = await prisma.generatedSiteVersion.aggregate({ where: { siteId: site.id }, _max: { number: true } })
  const number = (last._max.number ?? 0) + 1
  const now = deps.now?.() ?? new Date()
  await prisma.$transaction([
    prisma.generatedSiteVersion.create({
      data: {
        siteId: site.id,
        number,
        instruction: input.kind === "revise" ? input.instruction : null,
        runId: ctx.id,
        html: chosen.page.html,
        desktop: Buffer.from(chosen.rendered.desktop),
        mobile: Buffer.from(chosen.rendered.mobile),
        thumb: Buffer.from(chosen.rendered.thumb),
        checks: checks as object,
        model: chosen.model,
        costMicros: run.costMicros,
        createdById: ctx.requester?.id ?? null,
      },
    }),
    prisma.generatedSite.update({ where: { id: site.id }, data: { currentVersion: number, status: "READY", purgeAfter: addDays(now, PURGE_DAYS) } }),
    prisma.activity.create({
      data: { workspaceId: ctx.workspaceId, leadId: site.leadId, actorId: ctx.requester?.id ?? null, actorKind: "AGENT", kind: "SYSTEM", body: `Maquette du Studio Web prête (version ${number})`, data: { siteId: site.id, version: number, runId: ctx.id } },
    }),
  ])
  await recordStep(ctx, { type: "TOOL", name: "publish_preview", output: { version: number, round: chosen.round, passed: checks.passed, critique: checks.critique?.average ?? null } })

  try {
    await measure(ctx, site, number, deps)
  } catch (error) {
    // The version is published: a measure that fails only leaves its scores empty.
    console.warn("[STUDIO_PAGESPEED]", error instanceof Error ? error.message : error)
  }
  return { siteId: site.id, version: number }
}

export async function runDesigner(job: HandlerContext, deps: DesignerDeps = {}): Promise<{ output: { siteId: string; version?: number } }> {
  const input = designerInputSchema.safeParse(job.input)
  if (!input.success) throw new LeadError("invalid", "Demande du Studio illisible.", 400)
  const site = await prisma.generatedSite.findFirst({ where: { id: input.data.siteId, workspaceId: job.run.workspaceId } })
  if (!site) throw new LeadError("not_found", "Maquette introuvable", 404)
  if (site.status === "PURGED") throw new LeadError("conflict", "Cette maquette a été supprimée après 90 jours.", 409)
  if (input.data.kind === "brief") return { output: await writeBrief(job, site, deps) }
  return { output: await buildVersion(job, site, input.data, deps) }
}
