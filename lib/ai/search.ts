import { gateway, type Tool } from "ai"
import { isSearchTool, type SearchTool } from "./pricing"

/**
 * E30: web searches through the AI Gateway (D46), with no key of their own. The Gateway runs them for a model that
 * calls its exaSearch or perplexitySearch tool, then lets the model read the results; each one is billed per search on
 * top of the model's tokens (lib/ai/pricing.ts). The code fixes their options here (France, French, a few results),
 * and keeps what they returned as sources: a claim is kept only when it cites one of them.
 *
 * The tools are registered under their pricing keys ("exa_search", "perplexity_search"), so a call's searches are
 * counted and its sources read by name, whatever options it used.
 */
export interface WebSource {
  tool: SearchTool
  url: string
  title: string
  /** What the result says: title, author, excerpts or snippet, on one line. */
  text: string
  /** Publication date, when the source gives one (ISO or as written). */
  date: string | null
}

const YEAR_MS = 365 * 24 * 3600_000

/** Exa's index of people (public professional profiles), in France. */
export const exaPeople = (): Tool => gateway.tools.exaSearch({ category: "people", numResults: 6, userLocation: "FR", contents: { highlights: { maxCharacters: 500 } } })

/**
 * The company's own accounts on the four networks of D45, from Perplexity's web index: Exa's barely holds Facebook or
 * Instagram pages (its answer on the real dry run of 2026-11-04 was only LinkedIn profiles and posts).
 */
export const SOCIAL_DOMAINS = ["instagram.com", "facebook.com", "linkedin.com", "tiktok.com"] as const
export const perplexitySocials = (): Tool => gateway.tools.perplexitySearch({ country: "FR", maxResults: 10, maxTokensPerPage: 256, searchDomainFilter: [...SOCIAL_DOMAINS] })

/** News of the last twelve months, for a meeting's brief. */
export const exaNews = (now = new Date()): Tool =>
  gateway.tools.exaSearch({ category: "news", numResults: 6, userLocation: "FR", startPublishedDate: new Date(now.getTime() - YEAR_MS).toISOString(), contents: { highlights: { maxCharacters: 600 } } })

/** Perplexity's ranked web results, French pages from France. */
export const perplexityFr = (maxResults = 8): Tool => gateway.tools.perplexitySearch({ country: "FR", searchLanguageFilter: ["fr"], maxResults, maxTokensPerPage: 512 })

const clip = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "")
/** A date as the source gives it; an ISO instant (Exa's crawl dates) is kept to its day. */
const dateOf = (...values: unknown[]) => {
  const v = values.map((x) => clip(x, 40)).find(Boolean)
  return v ? (/^\d{4}-\d{2}-\d{2}T/.test(v) ? v.slice(0, 10) : v) : null
}
const httpUrl = (value: unknown) => (typeof value === "string" && /^https?:\/\//i.test(value) ? value.trim() : null)

function exaSources(output: { results?: unknown }): WebSource[] {
  if (!Array.isArray(output.results)) return []
  return output.results.flatMap((r: Record<string, unknown>) => {
    const url = httpUrl(r?.url)
    if (!url) return []
    const highlights = Array.isArray(r.highlights) ? r.highlights.filter((h): h is string => typeof h === "string") : []
    const text = [clip(r.title, 300), clip(r.author, 120), ...highlights.map((h) => clip(h, 700)), clip(r.summary, 700), clip(r.text, 1_500)].filter(Boolean).join(" … ")
    return [{ tool: "exa_search" as const, url, title: clip(r.title, 300), text, date: dateOf(r.publishedDate) }]
  })
}

function perplexitySources(output: { results?: unknown }): WebSource[] {
  if (!Array.isArray(output.results)) return []
  return output.results.flatMap((r: Record<string, unknown>) => {
    const url = httpUrl(r?.url)
    if (!url) return []
    // Perplexity's own field is last_updated (seen on the real dry run); date and lastUpdated as documented.
    return [{ tool: "perplexity_search" as const, url, title: clip(r.title, 300), text: [clip(r.title, 300), clip(r.snippet, 1_500)].filter(Boolean).join(" … "), date: dateOf(r.date, r.last_updated, r.lastUpdated) }]
  })
}

/**
 * The sources a model's searches returned, read from the Gateway's tool results in its answer (`content` of a step,
 * or of all steps). A failed search (an error object) gives none; the same page twice is kept once.
 */
export function sourcesOf(content: readonly unknown[]): WebSource[] {
  const seen = new Set<string>()
  const out: WebSource[] = []
  for (const part of content as { type?: unknown; toolName?: unknown; providerExecuted?: unknown; output?: unknown }[]) {
    if (part?.type !== "tool-result" || !isSearchTool(part.toolName) || !part.output || typeof part.output !== "object") continue
    const output = part.output as { results?: unknown; error?: unknown }
    if (output.error) continue
    for (const s of part.toolName === "exa_search" ? exaSources(output) : perplexitySources(output)) {
      const key = urlKey(s.url)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(s)
    }
  }
  return out
}

/** A search that answered with an error (quota, timeout): its message, for the run's history. */
export function searchErrors(content: readonly unknown[]): string[] {
  return (content as { type?: unknown; toolName?: unknown; output?: unknown }[]).flatMap((part) => {
    if (part?.type !== "tool-result" || !isSearchTool(part.toolName)) return []
    const output = part.output as { error?: unknown; message?: unknown } | null
    return output && typeof output === "object" && output.error ? [`${String(output.error)}${typeof output.message === "string" ? ` : ${output.message.slice(0, 200)}` : ""}`] : []
  })
}

/**
 * A source as the run's history keeps it: a person's profile (linkedin.com/in/…) without its handle, since a search
 * about a company may bring some back (real dry run of 2026-11-04). The fiche keeps what a person confirms.
 */
export function urlForLog(url: string): string {
  try {
    const u = new URL(url)
    return /(^|\.)linkedin\.com$/i.test(u.hostname) && /^\/in\//i.test(u.pathname) ? "https://www.linkedin.com/in/…" : url
  } catch {
    return "…"
  }
}

/** One page, whatever its scheme, "www.", trailing slash, query or fragment: what two citations of it share. */
export function urlKey(url: string): string {
  try {
    const u = new URL(url)
    return `${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`
  } catch {
    return url.trim().toLowerCase()
  }
}

/** Text compared without accents, case or punctuation: an excerpt is found in a source even if spaced differently. */
export const flat = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

/** Whether an excerpt a model quoted is really in the source: at least 12 characters, found word for word. */
export function quotes(source: Pick<WebSource, "text">, excerpt: string | null | undefined): boolean {
  const e = flat(excerpt ?? "")
  return e.length >= 12 && flat(source.text).includes(e)
}
