import { z } from "zod"

/**
 * Shapes of the Studio Web (E23, docs/crm-v1/AGENTS-IA.md §16): what the collector found, the brief the Designer writes
 * and the person edits, the critique of a render, and what a version keeps of its checks and scores.
 */
export const ASSET_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/
export const SECTION_KINDS = ["hero", "services", "proof", "process", "about", "area", "gallery", "faq", "contact"] as const
export type SectionKind = (typeof SECTION_KINDS)[number]
export const IMAGE_USES = ["logo", "hero", "section", "gallery"] as const
export const CTA_KINDS = ["phone", "email", "booking"] as const
export type CtaKind = (typeof CTA_KINDS)[number]

const hex = z.string().regex(/^#[0-9a-f]{6}$/i, "Couleur au format #rrggbb")
/** Where a point comes from: a page of the site (P1…), a fact of the fiche (F1…) or a finding of the audit (A1…). */
const evidenceId = z.string().regex(/^[PFA]\d{1,2}$/)

// ── Collection (no model) ────────────────────────────────────────────────────────────────────────────────────────

export const collectedSchema = z.object({
  url: z.string().nullable(),
  reachable: z.boolean(),
  failure: z.string().nullable(),
  pages: z.array(z.object({ id: z.string(), url: z.string(), title: z.string().nullable() })).max(5),
  colors: z.array(z.object({ hex, source: z.enum(["css", "theme", "logo"]), weight: z.number() })).max(8),
  /** Families the site already uses. */
  fonts: z.array(z.string()).max(6),
  images: z.array(z.object({ name: z.string().regex(ASSET_NAME), kind: z.enum(["logo", "image"]), width: z.number().int(), height: z.number().int(), alt: z.string().nullable(), sourceUrl: z.string() })).max(12),
  contact: z.object({ phone: z.string().nullable(), email: z.string().nullable(), address: z.string().nullable(), booking: z.string().nullable() }),
  /** What the fiche says, numbered F1…: the page may state these. */
  facts: z.array(z.object({ id: z.string(), label: z.string(), value: z.string(), source: z.string() })).max(12),
  notes: z.array(z.string().max(300)).max(12),
})
export type Collected = z.infer<typeof collectedSchema>

// ── Brief ────────────────────────────────────────────────────────────────────────────────────────────────────────

const pointSchema = z.object({ text: z.string().trim().min(2).max(240), evidence: z.array(evidenceId).max(4) })
const sectionSchema = z.object({ kind: z.enum(SECTION_KINDS), title: z.string().trim().min(2).max(80), points: z.array(pointSchema).max(8) })

/** The brief as stored and as the person edits it: a point a person writes needs no evidence, it is theirs. */
export const briefSchema = z
  .object({
    positioning: z.string().trim().min(10).max(300),
    audience: z.string().trim().max(200),
    tone: z.string().trim().max(160),
    headline: z.string().trim().min(4).max(90),
    subheadline: z.string().trim().max(220),
    sections: z.array(sectionSchema).min(3).max(9),
    palette: z.object({ primary: hex, accent: hex.nullable(), why: z.string().trim().max(200) }),
    fonts: z.object({ heading: z.string().max(40), body: z.string().max(40), why: z.string().trim().max(200) }),
    images: z.array(z.object({ name: z.string().regex(ASSET_NAME), use: z.enum(IMAGE_USES), alt: z.string().trim().max(140) })).max(10),
    cta: z.object({ kind: z.enum(CTA_KINDS), label: z.string().trim().min(2).max(40) }),
    changes: z.array(pointSchema).min(1).max(6),
    /** What the person adds for the Designer, in their own words. */
    notes: z.string().trim().max(600).default(""),
  })
  .strict()
export type Brief = z.infer<typeof briefSchema>

/**
 * What the Designer must answer. Points must cite where they come from; an image or a font outside the lists is
 * impossible to name. The code then drops what cites nothing that exists (features/studio/brief.ts).
 */
export function briefOutputSchema(opts: { assets: readonly string[]; fonts: readonly string[] }) {
  const name = opts.assets.length ? z.enum(opts.assets as [string, ...string[]]) : z.string().regex(ASSET_NAME)
  const font = z.enum(opts.fonts as [string, ...string[]])
  // Loose on purpose: one badly cited point must not cost the whole (expensive) answer; the code drops it afterwards.
  const sourced = z.object({ text: z.string().min(2).max(240), evidence: z.array(z.string().max(12)).max(4).describe("Identifiants des preuves : P1… (pages), F1… (fiche), A1… (audit)") })
  return z.object({
    positioning: z.string().min(10).max(300).describe("Qui, quoi, où, pour qui : une phrase"),
    audience: z.string().max(200),
    tone: z.string().max(160).describe("Le ton, en quelques mots (rassurant, expert, chaleureux…)"),
    headline: z.string().min(4).max(90).describe("Titre du premier écran, tourné vers le bénéfice du client"),
    subheadline: z.string().max(220).describe("Le métier, la zone et la preuve la plus forte"),
    sections: z
      .array(z.object({ kind: z.enum(SECTION_KINDS), title: z.string().min(2).max(80), points: z.array(sourced).max(8) }))
      .min(3)
      .max(9)
      .describe("Les sections de la page, dans l'ordre"),
    palette: z.object({ primary: hex, accent: hex.nullable(), why: z.string().max(200) }),
    fonts: z.object({ heading: font, body: font, why: z.string().max(200) }),
    images: z.array(z.object({ name, use: z.enum(IMAGE_USES), alt: z.string().max(140).describe("Texte alternatif : ce que montre l'image") })).max(10),
    cta: z.object({ kind: z.enum(CTA_KINDS), label: z.string().min(2).max(40).describe("Libellé du bouton principal, verbe d'action") }),
    changes: z.array(sourced).min(1).max(6).describe("Ce qui change par rapport au site actuel, chaque point avec sa preuve"),
  })
}
export type BriefOutput = z.infer<ReturnType<typeof briefOutputSchema>>

// ── Critique ─────────────────────────────────────────────────────────────────────────────────────────────────────

export const CRITERIA = ["hierarchy", "readability", "contrast", "mobile", "brand", "conversion"] as const
export type Criterion = (typeof CRITERIA)[number]
const grade = z.number().int().min(1).max(5)

export const critiqueSchema = z.object({
  scores: z.object({ hierarchy: grade, readability: grade, contrast: grade, mobile: grade, brand: grade, conversion: grade }),
  issues: z
    .array(z.object({ severity: z.enum(["high", "medium", "low"]), criterion: z.enum(CRITERIA), problem: z.string().max(240), fix: z.string().max(300) }))
    .max(8)
    .describe("Les défauts visibles sur les captures, du plus grave au moins grave"),
  summary: z.string().max(300),
})
export type Critique = z.infer<typeof critiqueSchema>

// ── Versions ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface AxeViolation {
  id: string
  impact: "critical" | "serious" | "moderate" | "minor"
  help: string
  nodes: number
  /** The first element concerned, shortened. */
  sample: string
}
export interface AxeSummary {
  critical: number
  serious: number
  moderate: number
  minor: number
  violations: AxeViolation[]
}

export interface LabScores {
  performance: number | null
  accessibility: number | null
  bestPractices: number | null
  seo: number | null
  lcpMs: number | null
}

/** PageSpeed of the prospect's site (from its audit) and of the published page, measured the same way. */
export interface VersionScores {
  measuredAt: string
  before: { mobile: number | null; desktop: number | null; date: string | null }
  mobile: LabScores | null
  desktop: LabScores | null
  error: string | null
}

export interface VersionChecks {
  sanitizer: { removed: Record<string, number>; images: number; links: { tel: number; mailto: number; https: number; anchors: number } }
  markup: { h1: number; emptyAlt: number; phoneLink: boolean; emailLink: boolean; placeholders: string[]; bytes: number }
  axe: AxeSummary | null
  critique: (Critique & { average: number }) | null
  /** Corrections made after a critique. */
  rounds: number
  passed: boolean
  /** What the person should know: a correction skipped for budget, a check that could not run… */
  notes: string[]
}

// ── Inputs ───────────────────────────────────────────────────────────────────────────────────────────────────────

export const INSTRUCTION_MAX = 600

export const designerInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("brief"), siteId: z.string().min(1).max(40) }),
  z.object({ kind: z.literal("build"), siteId: z.string().min(1).max(40) }),
  z.object({ kind: z.literal("revise"), siteId: z.string().min(1).max(40), instruction: z.string().min(3).max(INSTRUCTION_MAX) }),
])
export type DesignerInput = z.infer<typeof designerInputSchema>

export const startStudioSchema = z.object({}).strict()
export const updateBriefSchema = z.object({ brief: briefSchema }).strict()
export const reviseSchema = z.object({ instruction: z.string().trim().min(3, "Décrivez la modification en quelques mots.").max(INSTRUCTION_MAX) }).strict()
export const linkSchema = z.object({ action: z.enum(["create", "extend"]) }).strict()
