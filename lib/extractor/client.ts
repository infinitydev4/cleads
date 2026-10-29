import type { z } from "zod"
import {
  businessesPageSchema, createJobResponseSchema, healthSchema, jobErrorsSchema, jobResponseSchema, sectorsSchema,
} from "./schemas"

export interface ExtractorConfig {
  url: string
  apiKey: string
}

/** Server-side only. The key is never sent to the browser: the CRM calls the extractor on the user's behalf. */
export function extractorConfig(env: Record<string, string | undefined> = process.env): ExtractorConfig | null {
  const url = env.EXTRACTOR_URL?.trim().replace(/\/+$/, "")
  const apiKey = env.EXTRACTOR_API_KEY?.trim()
  return url && apiKey ? { url, apiKey } : null
}

export type ExtractorErrorKind = "not_configured" | "unreachable" | "unauthorized" | "not_found" | "invalid" | "unavailable" | "bad_response"

/** The message is safe to show: it never contains the API key, only what the extractor said about the request. */
export class ExtractorError extends Error {
  constructor(
    public readonly kind: ExtractorErrorKind,
    message: string,
    public readonly status?: number,
    public readonly code?: string
  ) {
    super(message)
  }
  get retriable() {
    return this.kind === "unreachable" || this.kind === "unavailable"
  }
}

export interface JobSpecInput {
  query?: string
  sector?: string
  /** A place name (geocoded by the extractor), or give `center` and `radius_m` instead. */
  location?: string
  center?: { lat: number; lng: number }
  radius_m?: number
  country?: string
  language?: string
  enrich?: boolean
  max_results?: number
  webhook_url?: string
  sources?: string[]
}

export interface BusinessFilters {
  cursor?: string
  limit?: number
  useful?: boolean
  has_email?: boolean
  has_phone?: boolean
  min_completeness?: number
}

type Fetch = typeof fetch

export class ExtractorClient {
  constructor(
    private readonly config: ExtractorConfig,
    private readonly fetchImpl: Fetch = fetch,
    private readonly timeoutMs = 15_000
  ) {}

  private async request<S extends z.ZodTypeAny>(method: string, path: string, schema: S, body?: unknown, headers: Record<string, string> = {}): Promise<z.infer<S>> {
    let res: Response
    try {
      res = await this.fetchImpl(`${this.config.url}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.config.apiKey}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
        cache: "no-store",
      })
    } catch {
      throw new ExtractorError("unreachable", "Cleads Extractor ne répond pas. Réessayez dans un instant.")
    }
    const text = await res.text()
    const json = (() => {
      try {
        return text ? JSON.parse(text) : null
      } catch {
        return null
      }
    })()

    if (!res.ok) {
      const message = typeof json?.error?.message === "string" ? json.error.message : undefined
      const code = typeof json?.error?.code === "string" ? json.error.code : undefined
      if (res.status === 401 || res.status === 403) throw new ExtractorError("unauthorized", "Cleads Extractor refuse la clé du CRM : vérifiez EXTRACTOR_API_KEY.", res.status, code)
      if (res.status === 404) throw new ExtractorError("not_found", "Recherche introuvable côté Extractor.", res.status, code)
      if (res.status === 400 || res.status === 422) throw new ExtractorError("invalid", message ?? "Requête refusée par l’Extractor.", res.status, code)
      throw new ExtractorError("unavailable", message ?? `Cleads Extractor est indisponible (HTTP ${res.status}).`, res.status, code)
    }
    const parsed = schema.safeParse(json)
    if (!parsed.success) throw new ExtractorError("bad_response", "Réponse inattendue de Cleads Extractor : la version de l’API a peut-être changé.", res.status)
    return parsed.data
  }

  sectors() {
    return this.request("GET", "/v1/sectors", sectorsSchema).then((r) => r.sectors)
  }

  health() {
    return this.request("GET", "/v1/health/summary", healthSchema)
  }

  /** `idempotencyKey` makes a retry return the original job instead of starting a second search. */
  async createJob(spec: JobSpecInput, idempotencyKey: string) {
    return this.request("POST", "/v1/jobs", createJobResponseSchema, spec, { "Idempotency-Key": idempotencyKey })
  }

  getJob(id: string) {
    return this.request("GET", `/v1/jobs/${encodeURIComponent(id)}`, jobResponseSchema).then((r) => r.job)
  }

  async cancelJob(id: string) {
    await this.request("DELETE", `/v1/jobs/${encodeURIComponent(id)}`, jobResponseSchema.partial())
  }

  jobErrors(id: string) {
    return this.request("GET", `/v1/jobs/${encodeURIComponent(id)}/errors`, jobErrorsSchema)
  }

  businesses(id: string, filters: BusinessFilters = {}) {
    const q = new URLSearchParams()
    if (filters.cursor) q.set("cursor", filters.cursor)
    q.set("limit", String(filters.limit ?? 100))
    if (filters.useful) q.set("useful", "true")
    if (filters.has_email) q.set("has_email", "true")
    if (filters.has_phone) q.set("has_phone", "true")
    if (filters.min_completeness) q.set("min_completeness", String(filters.min_completeness))
    return this.request("GET", `/v1/jobs/${encodeURIComponent(id)}/businesses?${q}`, businessesPageSchema)
  }
}

export function getExtractorClient(): ExtractorClient {
  const config = extractorConfig()
  if (!config) throw new ExtractorError("not_configured", "Cleads Extractor n’est pas configuré : renseignez EXTRACTOR_URL et EXTRACTOR_API_KEY.")
  return new ExtractorClient(config)
}
