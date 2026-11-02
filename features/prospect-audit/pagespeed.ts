import { z } from "zod"

/**
 * PageSpeed Insights (docs/crm-v1/AGENTS-IA.md §13): Lighthouse scores, Core Web Vitals and the screenshot Google takes
 * of the page, on mobile and on desktop. Free with a key (GOOGLE_PAGESPEED_API_KEY); the shared quota without one is
 * almost always exhausted. The screenshots feed the visual analysis: no browser runs on our server.
 */
export type Strategy = "mobile" | "desktop"

export interface PsiOk {
  ok: true
  strategy: Strategy
  finalUrl: string | null
  /** 0-100, null when Lighthouse did not compute it. */
  scores: { performance: number | null; accessibility: number | null; bestPractices: number | null; seo: number | null }
  lab: { lcpMs: number | null; cls: number | null; tbtMs: number | null; fcpMs: number | null }
  /** Real visitors' data (Chrome UX Report) when Google has enough of it. */
  field: { category: string | null; lcpMs: number | null; inpMs: number | null; cls: number | null } | null
  viewport: boolean | null
  screenshot: { data: Buffer; mediaType: string } | null
  reportUrl: string
}

export interface PsiFailed {
  ok: false
  strategy: Strategy
  error: string
}

export type PsiResult = PsiOk | PsiFailed

const score = z.object({ score: z.number().nullable().optional() }).passthrough().optional()
const audit = z.object({ score: z.number().nullable().optional(), numericValue: z.number().optional(), details: z.object({ type: z.string().optional(), data: z.string().optional() }).passthrough().optional() }).passthrough().optional()
const metric = z.object({ percentile: z.number().optional(), category: z.string().optional() }).passthrough().optional()

const psiSchema = z
  .object({
    lighthouseResult: z
      .object({
        finalDisplayedUrl: z.string().optional(),
        finalUrl: z.string().optional(),
        runtimeError: z.object({ code: z.string().optional(), message: z.string().optional() }).passthrough().optional(),
        categories: z.object({ performance: score, accessibility: score, "best-practices": score, seo: score }).passthrough().default({}),
        audits: z.record(z.string(), audit).default({}),
      })
      .passthrough(),
    loadingExperience: z.object({ overall_category: z.string().optional(), metrics: z.record(z.string(), metric).optional() }).passthrough().optional(),
  })
  .passthrough()

const pct = (s: { score?: number | null } | undefined) => (typeof s?.score === "number" ? Math.round(s.score * 100) : null)
const num = (a: { numericValue?: number } | undefined) => (typeof a?.numericValue === "number" ? a.numericValue : null)

/** The public report, the one to show a prospect. */
export const reportUrl = (url: string, strategy: Strategy) => `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(url)}&form_factor=${strategy}`

export function parsePsi(json: unknown, url: string, strategy: Strategy): PsiResult {
  const parsed = psiSchema.safeParse(json)
  if (!parsed.success) return { ok: false, strategy, error: "Réponse PageSpeed illisible" }
  const lr = parsed.data.lighthouseResult
  if (lr.runtimeError?.code && lr.runtimeError.code !== "NO_ERROR") return { ok: false, strategy, error: `PageSpeed n'a pas pu charger la page (${lr.runtimeError.code})` }
  const a = lr.audits
  const shot = a["final-screenshot"]?.details?.data
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(shot ?? "")
  const data = m ? Buffer.from(m[2], "base64") : null
  const fieldMetrics = parsed.data.loadingExperience?.metrics
  const field = fieldMetrics
    ? {
        category: parsed.data.loadingExperience?.overall_category ?? null,
        lcpMs: fieldMetrics.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null,
        inpMs: fieldMetrics.INTERACTION_TO_NEXT_PAINT?.percentile ?? null,
        cls: typeof fieldMetrics.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile === "number" ? fieldMetrics.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : null,
      }
    : null
  return {
    ok: true,
    strategy,
    finalUrl: lr.finalDisplayedUrl ?? lr.finalUrl ?? null,
    scores: { performance: pct(lr.categories.performance), accessibility: pct(lr.categories.accessibility), bestPractices: pct(lr.categories["best-practices"]), seo: pct(lr.categories.seo) },
    lab: { lcpMs: num(a["largest-contentful-paint"]), cls: num(a["cumulative-layout-shift"]), tbtMs: num(a["total-blocking-time"]), fcpMs: num(a["first-contentful-paint"]) },
    field,
    viewport: typeof a.viewport?.score === "number" ? a.viewport.score === 1 : null,
    // A screenshot is at most a few hundred kilobytes; anything bigger is not kept.
    screenshot: data && data.length > 0 && data.length <= 600_000 ? { data, mediaType: m![1] } : null,
    reportUrl: reportUrl(url, strategy),
  }
}

export interface PsiDeps {
  key?: string | null
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export async function runPageSpeed(url: string, strategy: Strategy, deps: PsiDeps = {}): Promise<PsiResult> {
  const key = deps.key === undefined ? process.env.GOOGLE_PAGESPEED_API_KEY : deps.key
  if (!key) return { ok: false, strategy, error: "Clé PageSpeed absente (GOOGLE_PAGESPEED_API_KEY)" }
  const params = new URLSearchParams({ url, strategy, key })
  for (const c of ["performance", "accessibility", "best-practices", "seo"]) params.append("category", c)
  try {
    const res = await (deps.fetchImpl ?? fetch)(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`, { signal: AbortSignal.timeout(deps.timeoutMs ?? 90_000), headers: { Accept: "application/json" } })
    if (res.status === 429) return { ok: false, strategy, error: "Quota PageSpeed atteint pour aujourd'hui" }
    if (!res.ok) return { ok: false, strategy, error: `PageSpeed a répondu ${res.status}` }
    return parsePsi(await res.json(), url, strategy)
  } catch (error) {
    return { ok: false, strategy, error: error instanceof Error && error.name === "TimeoutError" ? "PageSpeed n'a pas répondu à temps" : "PageSpeed injoignable" }
  }
}
