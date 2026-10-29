import { z } from "zod"

export const MAX_SEARCH_RESULTS = 1000
export const DEFAULT_SEARCH_RESULTS = 100

export const startSearchSchema = z.object({
  activity: z.string().trim().min(2, "Indiquez une activité (ex. plombier)").max(100),
  location: z.string().trim().min(2, "Indiquez une zone (ex. Lyon, France)").max(120),
  country: z.string().trim().length(2).toUpperCase().optional().or(z.literal("").transform(() => undefined)),
  enrich: z.boolean().default(true),
  maxResults: z.number().int().min(10).max(MAX_SEARCH_RESULTS).default(DEFAULT_SEARCH_RESULTS),
})
export type StartSearchInput = z.infer<typeof startSearchSchema>

export const importOptionsSchema = z.object({
  commit: z.boolean().default(false),
  /** Only records the extractor judges reachable and operating. */
  useful: z.boolean().default(true),
  hasEmail: z.boolean().default(false),
  minCompleteness: z.number().int().min(0).max(100).default(0),
})
export type ImportOptions = z.infer<typeof importOptionsSchema>
