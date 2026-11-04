/**
 * What a call costs. Prices come from the AI Gateway's public model list (US dollars per token), cached for 12 hours,
 * over a built-in snapshot used when the list cannot be read. A cost is estimated when the call is recorded, from the
 * usage the model reports; each step keeps the Gateway's generation id so the estimate can be checked later.
 */
export interface ModelPrice {
  input: number
  output: number
  cacheRead?: number
  cacheWrite?: number
}

/** Snapshot of 2026-11-02. Some models cost more above 100 000 input tokens: our calls stay far below. */
export const DEFAULT_PRICES: Record<string, ModelPrice> = {
  "typesafe-ai/jev": { input: 0.000000042, output: 0 },
  "openai/gpt-6-luna-decisions": { input: 0.0000001, output: 0, cacheRead: 0.00000001, cacheWrite: 0.000000125 },
  "perplexity/pplx-decider-v1.2": { input: 0.00000002, output: 0 },
  "anthropic/claude-haiku-5.5": { input: 0.0000001, output: 0.0000005, cacheRead: 0.00000001, cacheWrite: 0.000000125 },
  "openai/gpt-6-luna": { input: 0.0000001, output: 0.0000005, cacheRead: 0.00000001, cacheWrite: 0.000000125 },
  "mistral/mistral-small": { input: 0.00000015, output: 0.0000006, cacheRead: 0.000000015 },
  "google/gemini-3.1-flash-lite": { input: 0.00000025, output: 0.0000015 },
  "anthropic/claude-sonnet-5.5": { input: 0.000002, output: 0.00001, cacheRead: 0.0000001, cacheWrite: 0.0000025 },
  "openai/gpt-6.1-sol": { input: 0.000002, output: 0.00001, cacheRead: 0.0000001, cacheWrite: 0.0000025 },
  "mistral/mistral-large-4": { input: 0.0000007, output: 0.0000021, cacheRead: 0.00000007 },
  "google/gemini-4-argon": { input: 0.000002, output: 0.00001, cacheRead: 0.0000001 },
  "anthropic/claude-opus-5.5": { input: 0.000004, output: 0.00002, cacheRead: 0.0000002, cacheWrite: 0.000005 },
  "openai/gpt-6-astra": { input: 0.00001, output: 0.00005, cacheRead: 0.000001, cacheWrite: 0.0000125 },
}

/** For a model missing from the list: the dearest known price, so an estimate never understates a cost. */
export const UNKNOWN_PRICE: ModelPrice = { input: 0.00001, output: 0.00005 }

const MODELS_URL = "https://ai-gateway.vercel.sh/v1/models"
const TTL_MS = 12 * 3600_000
const RETRY_MS = 10 * 60_000
let cached: { at: number; table: Record<string, ModelPrice> } | null = null

const amount = (v: unknown) => {
  const n = typeof v === "string" || typeof v === "number" ? Number(v) : NaN
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/** Reads the Gateway's model list; models without a usable price are left out. */
export function parsePriceTable(body: unknown): Record<string, ModelPrice> {
  const data = (body as { data?: unknown } | null)?.data
  if (!Array.isArray(data)) return {}
  const out: Record<string, ModelPrice> = {}
  for (const m of data as { id?: unknown; pricing?: Record<string, unknown> | null }[]) {
    if (typeof m?.id !== "string" || !m.pricing) continue
    const input = amount(m.pricing.input)
    const output = amount(m.pricing.output)
    if (input === undefined || output === undefined) continue
    out[m.id] = { input, output, cacheRead: amount(m.pricing.input_cache_read), cacheWrite: amount(m.pricing.input_cache_write) }
  }
  return out
}

/** Current prices: the Gateway's list over the snapshot. Never throws; after a failed read it retries in 10 minutes. */
export async function priceTable(opts: { fetch?: typeof fetch; now?: number } = {}): Promise<Record<string, ModelPrice>> {
  const now = opts.now ?? Date.now()
  if (cached && now - cached.at < TTL_MS) return cached.table
  try {
    const res = await (opts.fetch ?? fetch)(MODELS_URL, { signal: AbortSignal.timeout(5000), headers: { accept: "application/json" } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const table = { ...DEFAULT_PRICES, ...parsePriceTable(await res.json()) }
    cached = { at: now, table }
    return table
  } catch (error) {
    console.warn("[AI_PRICES]", error instanceof Error ? error.message : error)
    const table = cached?.table ?? DEFAULT_PRICES
    cached = { at: now - TTL_MS + RETRY_MS, table }
    return table
  }
}

/** Tests only. */
export function resetPriceCache() {
  cached = null
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

interface SdkUsage {
  inputTokens?: number
  outputTokens?: number
  inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number }
}

/** From the AI SDK's usage (text or decision calls); unknown counts are zero. */
export function tokenUsage(u: SdkUsage | undefined): TokenUsage {
  return {
    inputTokens: u?.inputTokens ?? 0,
    outputTokens: u?.outputTokens ?? 0,
    cacheReadTokens: u?.inputTokenDetails?.cacheReadTokens ?? 0,
    cacheWriteTokens: u?.inputTokenDetails?.cacheWriteTokens ?? 0,
  }
}

/** Cost in micro-euros, rounded up. A missing price is estimated at UNKNOWN_PRICE (`estimated: true`). */
export function costMicros(price: ModelPrice | undefined, usage: TokenUsage, eurPerUsd: number): { micros: number; estimated: boolean } {
  const p = price ?? UNKNOWN_PRICE
  const fresh = Math.max(usage.inputTokens - usage.cacheReadTokens - usage.cacheWriteTokens, 0)
  const usd =
    fresh * p.input + usage.cacheReadTokens * (p.cacheRead ?? p.input) + usage.cacheWriteTokens * (p.cacheWrite ?? p.input) + usage.outputTokens * p.output
  // Round to a thousandth of a micro-euro first, so float noise never adds a whole micro-euro.
  return { micros: Math.ceil(Math.round(usd * eurPerUsd * 1e9) / 1000), estimated: !price }
}

/** The dearest of several models, field by field: what a call costs at worst when the Gateway may fall back. */
export function worstPrice(models: readonly string[], table: Record<string, ModelPrice>): ModelPrice {
  const prices = models.map((m) => table[m] ?? UNKNOWN_PRICE)
  return {
    input: Math.max(...prices.map((p) => p.input)),
    output: Math.max(...prices.map((p) => p.output)),
  }
}

/**
 * E28: dictation, billed by the minute of audio (USD). A prudent figure until the Gateway's own price for the model is
 * read on a first real call; a model missing here is billed at the dearest one.
 */
export const TRANSCRIPTION_USD_PER_MINUTE: Record<string, number> = {
  "mistral/voxtral-mini-transcribe-3": 0.003,
  "openai/gpt-4o-mini-transcribe": 0.003,
  "openai/whisper-1": 0.006,
}

export function transcriptionMicros(model: string, seconds: number, eurPerUsd: number): number {
  const perMinute = TRANSCRIPTION_USD_PER_MINUTE[model] ?? Math.max(...Object.values(TRANSCRIPTION_USD_PER_MINUTE))
  return Math.ceil((Math.max(seconds, 1) / 60) * perMinute * eurPerUsd * 1e6)
}

/**
 * E30: web searches the Gateway runs for a model (its exaSearch and perplexitySearch tools, lib/ai/search.ts), billed
 * per search on top of the model's tokens. List prices of 2026-11-04 (USD). The price list of the Gateway gives token
 * prices only, so these are counted here: a search is billed when the model asks for it, failed or not, and a
 * Perplexity call with several queries is billed one search per query, so an estimate never understates a cost. Each
 * tool has its own usage key, shown apart in Réglages › IA.
 */
export const SEARCH_PRICES = {
  exa_search: { usage: "exa/search", usdPerSearch: 0.007 },
  perplexity_search: { usage: "perplexity/search", usdPerSearch: 0.005 },
} as const
export type SearchTool = keyof typeof SEARCH_PRICES
export type SearchCounts = Partial<Record<SearchTool, number>>
export const isSearchTool = (name: unknown): name is SearchTool => typeof name === "string" && Object.hasOwn(SEARCH_PRICES, name)

/** The searches the Gateway ran in a model's answer: its provider-executed calls of a search tool. */
export function countSearches(content: readonly unknown[]): SearchCounts {
  const out: SearchCounts = {}
  for (const part of content as { type?: unknown; toolName?: unknown; providerExecuted?: unknown; input?: unknown }[]) {
    if (part?.type !== "tool-call" || !part.providerExecuted || !isSearchTool(part.toolName)) continue
    const query = (part.input as { query?: unknown } | null)?.query
    out[part.toolName] = (out[part.toolName] ?? 0) + (Array.isArray(query) ? Math.max(query.length, 1) : 1)
  }
  return out
}

export const searchCount = (counts: SearchCounts) => Object.values(counts).reduce((n, c) => n + (c ?? 0), 0)

/** What searches cost, in micro-euros rounded up. */
export function searchMicros(counts: SearchCounts, eurPerUsd: number): number {
  const usd = Object.entries(counts).reduce((sum, [tool, n]) => sum + (n ?? 0) * SEARCH_PRICES[tool as SearchTool].usdPerSearch, 0)
  return Math.ceil(Math.round(usd * eurPerUsd * 1e9) / 1000)
}

/** The most `count` searches can cost with any of these tools: what a call sets aside before it starts. */
export const worstSearchMicros = (tools: readonly SearchTool[], count: number, eurPerUsd: number) =>
  tools.length ? Math.max(...tools.map((t) => searchMicros({ [t]: count }, eurPerUsd))) : 0

/** Rough size of a prompt: 1 token ≈ 3 characters of French, a little pessimistic on purpose. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 3)

/** Largest output that keeps a call within `remainingMicros`, given its estimated input; 0 when even the input does not fit. */
export function maxOutputTokensWithin(price: ModelPrice, remainingMicros: number, inputTokens: number, eurPerUsd: number): number {
  const left = remainingMicros - inputTokens * price.input * eurPerUsd * 1e6
  if (left <= 0) return 0
  if (price.output === 0) return Number.MAX_SAFE_INTEGER
  return Math.floor(left / (price.output * eurPerUsd * 1e6))
}

/** Price per million tokens, for people: "2 $ / 10 $" or "0,042 $ (sortie gratuite)". */
export function formatPrice(price: ModelPrice | undefined): string {
  if (!price) return "prix inconnu"
  const nf = new Intl.NumberFormat("fr-FR", { maximumSignificantDigits: 3 })
  const perM = (v: number) => `${nf.format(v * 1e6)} $`
  return price.output === 0 ? `${perM(price.input)} (sortie gratuite)` : `${perM(price.input)} / ${perM(price.output)}`
}
