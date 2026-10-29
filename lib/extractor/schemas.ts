import { z } from "zod"

/**
 * What the CRM relies on in the Extractor's responses (see its openapi.yaml). Unknown fields are ignored and
 * missing optional ones tolerated, so the extractor can grow without breaking the CRM; a change to something
 * listed here fails loudly (contract tests) instead of silently corrupting imports.
 */
const num = z.number().optional()

export const countersSchema = z.object({
  tasks_total: num, tasks_done: num, tasks_failed: num, raw_found: num, unique: num, complete: num, crm_useful: num, enriched: num,
})

export const jobSchema = z.object({
  id: z.string(),
  status: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
  counters: countersSchema.default({}),
  error: z.string().optional(),
  created_at: z.string().optional(),
  started_at: z.string().optional(),
  finished_at: z.string().optional(),
})

export const createJobResponseSchema = z.object({
  job: jobSchema,
  planned_sources: z.array(z.string()).optional(),
  skipped_sources: z.record(z.string(), z.string()).optional(),
})
export const jobResponseSchema = z.object({ job: jobSchema })

export const businessSchema = z.object({
  id: z.number(),
  dedup_key: z.string().optional(),
  name: z.string(),
  category: z.string().optional(),
  address: z.string().optional(),
  street: z.string().optional(),
  postal_code: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  domain: z.string().optional(),
  emails: z.array(z.string()).optional(),
  socials: z.record(z.string(), z.string()).optional(),
  rating: z.number().optional(),
  reviews_count: z.number().optional(),
  status: z.string().optional(),
  place_id: z.string().optional(),
  siren: z.string().optional(),
  siret: z.string().optional(),
  naf: z.string().optional(),
  sources: z.array(z.string()).optional(),
  completeness: z.number().optional(),
  source_url: z.string().optional(),
})
export type ExtractorBusiness = z.infer<typeof businessSchema>

export const businessesPageSchema = z.object({
  items: z.array(businessSchema),
  next_cursor: z.string().optional(),
  has_more: z.boolean().optional(),
  job_status: z.string().optional(),
  counters: countersSchema.optional(),
})

export const sectorsSchema = z.object({
  sectors: z.array(z.object({ key: z.string(), label: z.string(), synonyms: z.array(z.string()).optional() })),
})

export const healthSchema = z.object({
  status: z.enum(["ok", "degraded", "down"]),
  summary: z.string().default(""),
  checked_at: z.string().optional(),
  sources: z
    .array(z.object({ name: z.string(), verdict: z.enum(["ok", "idle", "throttled", "blocked", "failing", "no_worker"]), detail: z.string().optional(), circuit_open: z.boolean().optional() }))
    .default([]),
})

export const jobErrorsSchema = z.object({ summary: z.string().default(""), job_error: z.string().optional(), tasks_failed: z.number().optional(), tasks_retrying: z.number().optional() })

export const webhookEventSchema = z.object({ event: z.string(), job: jobSchema })

export type ExtractorJob = z.infer<typeof jobSchema>
export type ExtractorHealth = z.infer<typeof healthSchema>
export type ExtractorCounters = z.infer<typeof countersSchema>
