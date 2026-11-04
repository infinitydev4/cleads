import type { Tool } from "ai"
import { UNTRUSTED_RULE, untrusted } from "@/lib/ai/untrusted"
import type { SearchTool } from "@/lib/ai/pricing"
import { urlKey, type WebSource } from "@/lib/ai/search"
import { generateForRun, type ModelDeps } from "@/features/ai/calls"
import type { RunContext } from "@/features/ai/runs"
import type { PageFetcher } from "@/features/prospect-audit/collect"

/**
 * One web search for a coded job of the Enquêteur (E30 lot 2): a short call of the fast model that only runs the search
 * the code wrote, through the Gateway (lib/ai/search.ts), and hands back its results as sources. That call decides
 * nothing: what the results mean is judged in another call, against their own text.
 */
export interface SearchRequest {
  tool: SearchTool
  /** The tool with its options, from lib/ai/search.ts. */
  make: () => Tool
  /** One query, or several for Perplexity (five at most), passed together. */
  query: string | string[]
  /** Step name in the run's history. */
  name: string
  /** It names a person: the run's history keeps this summary, not the query and its results (E30, minimisation). */
  private?: string
}

export interface SearchOutcome {
  sources: WebSource[]
  /** False when the model did not call the search. */
  ran: boolean
  error: string | null
}

export type WebSearcher = (ctx: RunContext, req: SearchRequest, signal?: AbortSignal) => Promise<SearchOutcome>

export interface ResearchDeps extends ModelDeps {
  /** Tests and evaluations: frozen results instead of the Gateway's searches. */
  search?: WebSearcher
  /** Tests: a frozen site instead of the network (the company's own links to its accounts). */
  fetchPage?: PageFetcher
  now?: () => Date
}

const SEARCH_SYSTEM = `Tu lances une recherche web pour un CRM. Appelle l'outil de recherche une seule fois, avec exactement la requête donnée et sans autre paramètre, puis réponds seulement « fait ». Ne commente pas les résultats.
${UNTRUSTED_RULE}`

/** Room for the search call: the fast model may reason a few hundred tokens before calling the tool (real dry run). */
export const SEARCH_OUTPUT_TOKENS = 1_500

/**
 * The Gateway's search, run by the fast model. Several queries are several calls, at once: a model asked to pass a list
 * wrote it as one string (real dry run of 2026-11-04), which made one search of three questions.
 */
export function gatewaySearcher(deps: ModelDeps = {}): WebSearcher {
  const one = async (ctx: RunContext, req: SearchRequest, query: string, signal?: AbortSignal): Promise<SearchOutcome> => {
    const result = await generateForRun(
      ctx,
      {
        role: "fast",
        name: req.name,
        system: SEARCH_SYSTEM,
        prompt: `Requête : ${JSON.stringify(query)}`,
        maxOutputTokens: SEARCH_OUTPUT_TOKENS,
        search: { tools: { [req.tool]: req.make() }, max: 1 },
        abortSignal: signal,
        private: req.private,
      },
      deps
    )
    const ran = (result.searches[req.tool] ?? 0) > 0
    return { sources: result.sources, ran, error: result.searchErrors[0] ?? (ran ? null : "la recherche n'a pas été lancée") }
  }
  return async (ctx, req, signal) => {
    const outcomes = await Promise.all((Array.isArray(req.query) ? req.query : [req.query]).map((q) => one(ctx, req, q, signal)))
    const seen = new Set<string>()
    const sources = outcomes.flatMap((o) => o.sources).filter((s) => !seen.has(urlKey(s.url)) && !!seen.add(urlKey(s.url)))
    return { sources, ran: outcomes.some((o) => o.ran), error: sources.length ? null : (outcomes.find((o) => o.error)?.error ?? null) }
  }
}

/** Sources numbered for a prompt (R1, R2… or S1, S2…), fenced as external content. */
export function numbered(prefix: string, sources: readonly WebSource[], maxChars = 900): string {
  return sources.map((s, i) => `${prefix}${i + 1}. ${s.url}${s.date ? ` (${s.date})` : ""}\n${untrusted(s.text, { source: s.url, maxChars })}`).join("\n")
}
