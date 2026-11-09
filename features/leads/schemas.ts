import { z } from "zod"
import { LEAD_STATUSES } from "./types"

const text = (max = 300) => z.string().trim().max(max)
const optionalText = (max = 300) => text(max).optional().transform((v) => v || undefined)

export const SORTS = ["score", "created", "name", "contacted", "status"] as const
export type LeadSort = (typeof SORTS)[number]

export const RELEVANCE_FILTERS = ["relevant", "maybe", "not", "pending", "unsorted"] as const
export type RelevanceFilter = (typeof RELEVANCE_FILTERS)[number]

/** E30: created in the last six months, a recent signal, a takeover or a new leader, in proceedings or closed. */
export const REGISTRY_FILTERS = ["new", "signal", "takeover", "blocked"] as const
export type RegistryFilter = (typeof REGISTRY_FILTERS)[number]

/**
 * The closer's desk (9 November 2026): the call file in four segments. Hot (worth calling first, priority 1), a
 * callback due today or late, no website, never contacted. The rules are in features/leads/insights.ts.
 */
export const FOCUS_FILTERS = ["hot", "callback", "nosite", "fresh"] as const
export type FocusFilter = (typeof FOCUS_FILTERS)[number]

/** What stands for a site (9 November 2026): no real site at all, only a social or directory page, a real site. */
export const SITE_FILTERS = ["nosite", "social", "real"] as const
export type SiteFilter = (typeof SITE_FILTERS)[number]

export interface LeadFilters {
  q?: string
  status: (typeof LEAD_STATUSES)[number][]
  /** "me", "none" (unassigned pool) or a user id. */
  owner?: string
  source?: string
  sector?: string
  city?: string
  tag?: string
  hasEmail?: boolean
  hasPhone?: boolean
  minScore?: number
  batch?: string
  /** A campaign id, or "none" for fiches outside every campaign (E15). */
  campaign?: string
  /** E25: Jev's sorting for the campaign (or any campaign): relevant, maybe, not relevant, to decide, not sorted. */
  relevance?: RelevanceFilter
  /** E30: what the registry and the BODACC say. */
  registry?: RegistryFilter
  /** The closer's desk: one segment of the call file. */
  focus?: FocusFilter
  /** ISO 3166-1 alpha-2 country of the company. */
  country?: string
  site?: SiteFilter
  sort: LeadSort
  dir: "asc" | "desc"
  page: number
  pageSize: number
}

type Params = Record<string, string | string[] | undefined>

/** Reads filters from a URL: unknown or invalid values are ignored, never an error (a stale link must still open). */
export function parseLeadFilters(params: Params): LeadFilters {
  const one = (key: string) => {
    const v = params[key]
    const value = Array.isArray(v) ? v[0] : v
    return value?.trim() ? value.trim().slice(0, 200) : undefined
  }
  const status = (one("status") ?? "")
    .split(",")
    .filter((s): s is (typeof LEAD_STATUSES)[number] => (LEAD_STATUSES as readonly string[]).includes(s))
  const sort = SORTS.find((s) => s === one("sort")) ?? "score"
  const minScore = Number(one("minScore"))
  const page = Math.floor(Number(one("page")))
  const pageSize = Math.floor(Number(one("pageSize")))
  return {
    q: one("q"),
    status,
    owner: one("owner"),
    source: one("source"),
    sector: one("sector"),
    city: one("city"),
    tag: one("tag")?.toLowerCase(),
    hasEmail: one("hasEmail") === "1" || undefined,
    hasPhone: one("hasPhone") === "1" || undefined,
    minScore: Number.isFinite(minScore) && minScore > 0 ? Math.min(100, minScore) : undefined,
    batch: one("batch"),
    campaign: one("campaign"),
    relevance: RELEVANCE_FILTERS.find((r) => r === one("relevance")),
    registry: REGISTRY_FILTERS.find((r) => r === one("registry")),
    focus: FOCUS_FILTERS.find((r) => r === one("focus")),
    country: /^[A-Za-z]{2}$/.test(one("country") ?? "") ? one("country")!.toUpperCase() : undefined,
    site: SITE_FILTERS.find((r) => r === one("site")),
    sort,
    dir: one("dir") === "asc" ? "asc" : one("dir") === "desc" ? "desc" : sort === "name" ? "asc" : "desc",
    page: page >= 1 ? page : 1,
    pageSize: pageSize >= 1 ? Math.min(pageSize, 100) : 50,
  }
}

/** The filters that define a saved view (no paging). */
export const viewFiltersSchema = z.object({
  q: optionalText(),
  status: z.array(z.enum(LEAD_STATUSES)).default([]),
  owner: optionalText(100),
  source: optionalText(30),
  sector: optionalText(100),
  city: optionalText(100),
  tag: optionalText(30),
  hasEmail: z.boolean().optional(),
  hasPhone: z.boolean().optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  campaign: optionalText(100),
  relevance: z.enum(RELEVANCE_FILTERS).optional(),
  registry: z.enum(REGISTRY_FILTERS).optional(),
  focus: z.enum(FOCUS_FILTERS).optional(),
  country: z.string().regex(/^[A-Z]{2}$/).optional(),
  site: z.enum(SITE_FILTERS).optional(),
  sort: z.enum(SORTS).default("score"),
  dir: z.enum(["asc", "desc"]).default("desc"),
})

const companyFields = {
  name: text(200).min(2, "Indiquez le nom de l’entreprise"),
  website: optionalText(300),
  phone: optionalText(40),
  email: optionalText(254),
  address: optionalText(300),
  city: optionalText(100),
  postalCode: optionalText(20),
  country: text(2).optional(),
  sector: optionalText(100),
  siret: optionalText(20),
}
const contactFields = {
  name: optionalText(150),
  jobTitle: optionalText(150),
  email: optionalText(254),
  phone: optionalText(40),
}

export const createLeadSchema = z.object({
  company: z.object(companyFields),
  contact: z.object(contactFields).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  note: optionalText(2000),
})

export const updateLeadSchema = z
  .object({
    status: z.enum(LEAD_STATUSES).optional(),
    ownerId: z.string().min(1).nullable().optional(),
    tags: z.array(z.string().max(40)).max(20).optional(),
    /** E15: file the fiche in a campaign, or take it out (null). */
    campaignId: z.string().min(1).nullable().optional(),
    company: z.object(companyFields).partial().optional(),
    contact: z.object(contactFields).partial().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Aucun changement demandé" })

export { activitySchema } from "@/features/activity/rules"

export const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("assign"), ownerId: z.string().min(1).nullable() }),
    z.object({ type: z.literal("status"), status: z.enum(LEAD_STATUSES) }),
    z.object({ type: z.literal("tag"), tag: z.string().min(1).max(40) }),
    z.object({ type: z.literal("untag"), tag: z.string().min(1).max(40) }),
    z.object({ type: z.literal("campaign"), campaignId: z.string().min(1).nullable() }),
  ]),
})

export const savedViewSchema = z.object({
  name: text(60).min(1, "Donnez un nom à la vue"),
  filters: viewFiltersSchema,
  shared: z.boolean().default(false),
})

export type CreateLeadInput = z.infer<typeof createLeadSchema>
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>
export type BulkInput = z.infer<typeof bulkSchema>
