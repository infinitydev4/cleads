import { untrusted, UNTRUSTED_RULE } from "@/lib/ai/untrusted"
import { generateForRun, type ModelDeps } from "@/features/ai/calls"
import type { AgentRuntime } from "@/features/ai/runtime"
import type { RunContext } from "@/features/ai/runs"
import type { SiteFacts } from "./collect"
import type { AuditFacts, Measured } from "./rules"
import { AREA_LABELS, SEVERITY_LABELS } from "./labels"
import { analysisSchema, siteContentSchema, type Analysis, type Point, type SiteContent } from "./schemas"

/**
 * The two model steps of the audit (docs/crm-v1/AGENTS-IA.md §2 and §13).
 * 1. Extraction, by the "fast" role and without any tool: the pages are untrusted content; what comes out is bounded,
 *    structured, and only refers to pages by their identifier.
 * 2. Analysis, by the agent's role (Sonnet by default): the expert reads the measured facts and the screenshots and
 *    says what they mean. Anything that does not point to existing evidence is dropped.
 */
const PAGE_CHARS = 6_000
const TOTAL_CHARS = 24_000
/**
 * Room for each answer. The models reason before they write, and their reasoning counts against these limits: the first
 * real analysis (2 November 2026) used 2 859 tokens of the 3 000 it had, one step away from an answer cut off and lost.
 */
export const EXTRACTION_OUTPUT_TOKENS = 4_000
export const ANALYSIS_OUTPUT_TOKENS = 6_000

export async function extractContent(ctx: RunContext, site: SiteFacts, deps: ModelDeps = {}, signal?: AbortSignal): Promise<{ content: SiteContent | null; model: string | null }> {
  if (!site.pages.length) return { content: null, model: null }
  let budget = TOTAL_CHARS
  const blocks = site.pages.map((p, i) => {
    const body = [`Page P${i + 1}`, `Titre : ${p.title ?? "(aucun)"}`, `Titre principal : ${p.h1.join(" | ") || "(aucun)"}`, "", p.text.slice(0, Math.min(PAGE_CHARS, budget))].join("\n")
    budget = Math.max(0, budget - PAGE_CHARS)
    return untrusted(body, { source: p.url, maxChars: PAGE_CHARS + 500 })
  })
  const { output, model } = await generateForRun(
    ctx,
    {
      role: "fast",
      name: "extract_site",
      system: [
        "Tu lis les pages du site d'une entreprise pour en relever des faits : ce qu'elle fait, ses services, sa zone, sa promesse, ses appels à l'action, ses preuves. Tu ne juges pas et tu n'inventes rien : si une information n'est pas écrite, tu la laisses vide.",
        UNTRUSTED_RULE,
        "Pour chaque élément relevé, indique la page où il se trouve par son identifiant (P1, P2…).",
      ].join("\n\n"),
      prompt: `Pages du site :\n\n${blocks.join("\n\n")}`,
      schema: siteContentSchema,
      maxOutputTokens: EXTRACTION_OUTPUT_TOKENS,
      abortSignal: signal,
    },
    deps
  )
  if (!output) return { content: null, model }
  const pages = new Set(site.pages.map((_, i) => `P${i + 1}`))
  const onPage = <T extends { page: string }>(list: T[]) => list.filter((x) => pages.has(x.page))
  return { content: { ...output, ctas: onPage(output.ctas), proofs: onPage(output.proofs), outdatedSigns: onPage(output.outdatedSigns), frictions: onPage(output.frictions) }, model }
}

function evidenceLines(measured: Measured): string {
  return measured.evidence.map((e) => `- ${e.id} : ${e.label}${e.value ? ` — ${e.value}` : ""}${e.url ? ` (${e.url})` : ""}`).join("\n")
}

/** The second step's prompt: facts first, then what is asked, so the instructions come after the untrusted parts. */
export function analysisPrompt(facts: AuditFacts, measured: Measured, content: SiteContent | null): string {
  const scores = Object.entries(measured.scores)
    .map(([k, v]) => `${AREA_LABELS[k as keyof typeof AREA_LABELS]} ${v}/100`)
    .join(", ")
  const found = measured.findings.map((f) => `- [${SEVERITY_LABELS[f.severity]}] ${f.title} (${f.evidence.join(", ")})`).join("\n")
  const captures = measured.captures.length ? measured.captures.map((c) => `${c.id} = capture ${c.kind === "mobile" ? "mobile" : "ordinateur"}`).join(", ") : "aucune capture disponible"
  return [
    `Entreprise : ${facts.listing.name}${facts.sector ? ` — ${facts.sector}` : ""}${facts.listing.city ? ` — ${facts.listing.city}` : ""}`,
    `Preuves disponibles (cite-les par leur identifiant) :\n${evidenceLines(measured)}`,
    `Constats déjà mesurés (ne les répète pas ; appuie-toi dessus) :\n${found || "- aucun"}`,
    `Sous-scores mesurés : ${scores || "aucun"}`,
    content ? `Ce que disent les pages (relevé automatique, non vérifié) :\n${untrusted(JSON.stringify(content, null, 1), { source: "relevé des pages du site", maxChars: 8_000 })}` : "Le contenu du site n'a pas pu être lu.",
    `Captures jointes, dans cet ordre : ${captures}.`,
    [
      "Rends ton analyse d'expert :",
      "- imageScore : modernité et cohérence visuelle d'après les captures, de 0 à 100 ; null sans capture ;",
      "- conversionScore : capacité du site à transformer une visite en demande (promesse, preuves, appels à l'action, freins), de 0 à 100 ; null sans site lisible ;",
      "- findings : au plus 10 constats nouveaux (ce que montrent les captures et le contenu), chacun avec au moins une preuve citée par son identifiant ;",
      "- strengths, frictions, opportunities : courts, concrets, chacun avec ses preuves ; une opportunité dit ce que l'entreprise gagnerait ;",
      "- signals : seulement parmi site_outdated, weak_cta, no_booking, unclear_entity, visual_sector, avec preuve ;",
      "- summary : trois points pour le closer qui appelle demain, du plus important au moins important, en langage simple.",
      "Un élément sans preuve existante sera supprimé. N'invente ni chiffre, ni avis, ni fait.",
    ].join("\n"),
  ].join("\n\n")
}

export async function analyze(
  ctx: RunContext,
  runtime: Pick<AgentRuntime, "agent" | "system">,
  facts: AuditFacts,
  measured: Measured,
  content: SiteContent | null,
  deps: ModelDeps = {},
  signal?: AbortSignal
): Promise<{ analysis: Analysis | null; model: string | null }> {
  const role = runtime.agent.modelRole === "decision" ? "writer" : runtime.agent.modelRole
  const images = measured.captures.flatMap((c) => {
    const r = facts.psi[c.kind]
    return r?.ok && r.screenshot ? [{ data: new Uint8Array(r.screenshot.data), mediaType: r.screenshot.mediaType }] : []
  })
  const { output, model } = await generateForRun(
    ctx,
    { role, name: "analyze_audit", system: runtime.system, prompt: analysisPrompt(facts, measured, content), schema: analysisSchema, images, maxOutputTokens: ANALYSIS_OUTPUT_TOKENS, abortSignal: signal },
    deps
  )
  return { analysis: output ?? null, model }
}

/** Keeps only what points to existing evidence; an item left without any is dropped. */
export function keepEvidenced<T extends { evidence: string[] }>(items: readonly T[], known: ReadonlySet<string>): T[] {
  return items.flatMap((item) => {
    const evidence = [...new Set(item.evidence.filter((id) => known.has(id)))]
    return evidence.length ? [{ ...item, evidence }] : []
  })
}

export const toPoints = (items: readonly { text: string; evidence: string[] }[]): Point[] => items.map((i) => ({ text: i.text, evidence: i.evidence }))
