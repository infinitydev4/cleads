import { z } from "zod"
import { SIGNAL_KEYS, type OfferSignal } from "@/features/offers/signals"

/**
 * The audit's report (docs/crm-v1/AGENTS-IA.md §13) and what the two model steps may answer. Every finding, strength,
 * friction, opportunity and signal points to evidence by its identifier: P for a page, M for a measure, C for a
 * screenshot, S for a source. Items whose evidence does not exist are dropped before saving.
 */
export const AREAS = ["technique", "vitesse", "mobile", "seoLocal", "geo", "conversion", "presence", "image"] as const
export type Area = (typeof AREAS)[number]
export type Scores = Record<Area, number | null>

export const SEVERITIES = ["high", "medium", "low"] as const
export type Severity = (typeof SEVERITIES)[number]

const ids = z.array(z.string().max(8)).max(8)

export const evidenceSchema = z.object({
  id: z.string().max(8),
  kind: z.enum(["page", "measure", "capture", "source"]),
  label: z.string().max(200),
  value: z.string().max(300).nullable(),
  url: z.string().max(2_000).nullable(),
})
export type Evidence = z.infer<typeof evidenceSchema>

export const findingSchema = z.object({
  area: z.enum(AREAS),
  severity: z.enum(SEVERITIES),
  title: z.string().max(140),
  detail: z.string().max(600),
  evidence: ids,
  /** "measure": a rule on a measured fact; "analysis": the model's reading of the pages and screenshots. */
  origin: z.enum(["measure", "analysis"]),
})
export type Finding = z.infer<typeof findingSchema>

export const pointSchema = z.object({ text: z.string().max(300), evidence: ids })
export type Point = z.infer<typeof pointSchema>

export const signalHitSchema = z.object({ key: z.enum(SIGNAL_KEYS as [OfferSignal, ...OfferSignal[]]), evidence: ids })
export type SignalHit = z.infer<typeof signalHitSchema>

export const personSchema = z.object({ name: z.string().max(120), role: z.string().max(120).nullable(), source: z.string().max(200), legalBasis: z.string().max(300), collectedAt: z.string() })
export type ProposedContact = z.infer<typeof personSchema>

export const registrySchema = z.object({
  siren: z.string(),
  name: z.string(),
  naf: z.string().nullable(),
  legalForm: z.string().nullable(),
  createdOn: z.string().nullable(),
  active: z.boolean(),
  employees: z.string().nullable(),
  labels: z.array(z.string()),
  opposition: z.boolean(),
  url: z.string(),
})

export const auditReportSchema = z.object({
  findings: z.array(findingSchema).max(40),
  strengths: z.array(pointSchema).max(8),
  frictions: z.array(pointSchema).max(8),
  opportunities: z.array(pointSchema).max(8),
  signals: z.array(signalHitSchema).max(30),
  evidence: z.array(evidenceSchema).max(60),
  people: z.array(personSchema).max(3),
  registry: registrySchema.nullable(),
  site: z.object({ reachable: z.boolean(), pages: z.array(z.string()).max(5), cms: z.string().nullable(), blockedByRobots: z.boolean() }).nullable(),
  /** What could not be checked, and why. */
  notes: z.array(z.string().max(300)).max(12),
  models: z.object({ extraction: z.string().nullable(), analysis: z.string().nullable() }),
})
export type AuditReport = z.infer<typeof auditReportSchema>

// ── Model steps ──────────────────────────────────────────────────────────────────────────────────────────────────

const page = z.string().max(8).describe("Identifiant de la page (P1, P2…)")

/** Step 1, without tools: what the site's own text says, structured and bounded. */
export const siteContentSchema = z.object({
  activity: z.string().max(240).describe("Ce que fait l'entreprise, en une phrase"),
  services: z.array(z.string().max(90)).max(12),
  area: z.string().max(160).nullable().describe("Zone d'intervention, si le site la dit"),
  audience: z.string().max(160).nullable().describe("Clientèle visée, si le site la dit"),
  headline: z.string().max(240).nullable().describe("La promesse principale, telle qu'écrite"),
  ctas: z.array(z.object({ label: z.string().max(80), kind: z.enum(["phone", "form", "booking", "email", "quote", "other"]), page })).max(10),
  proofs: z.array(z.object({ kind: z.enum(["reviews", "references", "label", "years", "photos", "other"]), text: z.string().max(200), page })).max(10),
  faq: z.boolean().describe("Le site répond-il aux questions des clients (FAQ ou équivalent) ?"),
  entityClear: z.boolean().describe("Le nom, le métier, la zone et la clientèle sont-ils écrits clairement ?"),
  outdatedSigns: z.array(z.object({ text: z.string().max(200), page })).max(6),
  frictions: z.array(z.object({ text: z.string().max(200), page })).max(6),
})
export type SiteContent = z.infer<typeof siteContentSchema>

/** Signals the analysis may raise from its reading; the measured ones come from rules. */
export const JUDGED_SIGNALS = ["site_outdated", "weak_cta", "no_booking", "unclear_entity", "visual_sector"] as const

const judged = z.object({ text: z.string().max(300), evidence: ids.min(1) })

/** Step 2: the expert's reading of the facts and the screenshots. */
export const analysisSchema = z.object({
  imageScore: z.number().int().min(0).max(100).nullable().describe("Modernité et cohérence visuelle d'après les captures ; null sans capture"),
  conversionScore: z.number().int().min(0).max(100).nullable().describe("Capacité du site à transformer une visite en demande"),
  findings: z
    .array(z.object({ area: z.enum(AREAS), severity: z.enum(SEVERITIES), title: z.string().max(140), detail: z.string().max(600), evidence: ids.min(1) }))
    .max(10)
    .describe("Constats d'analyse (captures, contenu), sans répéter les constats mesurés"),
  strengths: z.array(judged).max(5),
  frictions: z.array(judged).max(5),
  opportunities: z.array(judged).max(6),
  signals: z.array(z.object({ key: z.enum(JUDGED_SIGNALS), evidence: ids.min(1) })).max(5),
  summary: z.array(z.string().max(260)).min(1).max(3).describe("Trois points pour le closer, du plus important au moins important"),
})
export type Analysis = z.infer<typeof analysisSchema>

export const startAuditSchema = z.object({ force: z.boolean().optional() }).strict()
