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

const pointSchema = z.object({ text: z.string().trim().min(2).max(300), evidence: z.array(evidenceId).max(4) })
const sectionSchema = z.object({ kind: z.enum(SECTION_KINDS), title: z.string().trim().min(2).max(100), points: z.array(pointSchema).max(8) })

/** The brief as stored and as the person edits it: a point a person writes needs no evidence, it is theirs. */
export const BRIEF_LIMITS = { positioning: 400, audience: 240, tone: 200, headline: 120, subheadline: 300, title: 100, point: 300, alt: 200, why: 300, cta: 60, check: 240 } as const
export const briefSchema = z
  .object({
    positioning: z.string().trim().min(10).max(BRIEF_LIMITS.positioning),
    audience: z.string().trim().max(BRIEF_LIMITS.audience),
    tone: z.string().trim().max(BRIEF_LIMITS.tone),
    headline: z.string().trim().min(4).max(BRIEF_LIMITS.headline),
    subheadline: z.string().trim().max(BRIEF_LIMITS.subheadline),
    sections: z.array(sectionSchema).min(3).max(9),
    palette: z.object({ primary: hex, accent: hex.nullable(), why: z.string().trim().max(BRIEF_LIMITS.why) }),
    fonts: z.object({ heading: z.string().max(40), body: z.string().max(40), why: z.string().trim().max(BRIEF_LIMITS.why) }),
    images: z.array(z.object({ name: z.string().regex(ASSET_NAME), use: z.enum(IMAGE_USES), alt: z.string().trim().max(BRIEF_LIMITS.alt) })).max(10),
    cta: z.object({ kind: z.enum(CTA_KINDS), label: z.string().trim().min(2).max(BRIEF_LIMITS.cta) }),
    changes: z.array(pointSchema).min(1).max(6),
    /** What is missing or must be confirmed with the prospect: for the team, never on the page. */
    toCheck: z.array(z.string().trim().min(2).max(BRIEF_LIMITS.check)).max(12).default([]),
    /** What the person adds for the Designer, in their own words. */
    notes: z.string().trim().max(600).default(""),
  })
  .strict()
export type Brief = z.infer<typeof briefSchema>

/**
 * What the Designer must answer. An image or a font outside the lists is impossible to name; everything else is loose on
 * purpose. Providers do not enforce lengths, counts or patterns, and one point a little too long must not cost the
 * whole (expensive) answer: the code clips, sorts and drops afterwards (features/studio/brief.ts), as the first real
 * mock-up showed with the critique.
 */
export function briefOutputSchema(opts: { assets: readonly string[]; fonts: readonly string[] }) {
  const name = opts.assets.length ? z.enum(opts.assets as [string, ...string[]]) : z.string()
  const font = z.enum(opts.fonts as [string, ...string[]])
  const sourced = z.object({ text: z.string(), evidence: z.array(z.string()).describe("Identifiants des preuves : P1… (pages), F1… (fiche), A1… (audit)") })
  return z.object({
    positioning: z.string().describe("Qui, quoi, où, pour qui : une phrase de 300 caractères au plus"),
    audience: z.string(),
    tone: z.string().describe("Le ton, en quelques mots (rassurant, expert, chaleureux…)"),
    headline: z.string().describe("Titre du premier écran, tourné vers le bénéfice du client : 90 caractères au plus"),
    subheadline: z.string().describe("Le métier, la zone et la preuve la plus forte : 220 caractères au plus"),
    sections: z
      .array(z.object({ kind: z.enum(SECTION_KINDS), title: z.string().describe("Titre lu par les visiteurs, 60 caractères au plus"), points: z.array(sourced).describe("Le texte que liront les visiteurs, 8 points au plus") }))
      .describe("4 à 7 sections, dans l'ordre de la page"),
    palette: z.object({ primary: z.string().describe("Couleur #rrggbb"), accent: z.string().nullable().describe("Couleur #rrggbb, ou null"), why: z.string() }),
    fonts: z.object({ heading: font, body: font, why: z.string() }),
    images: z.array(z.object({ name, use: z.enum(IMAGE_USES), alt: z.string().describe("Texte alternatif : ce que montre l'image") })),
    cta: z.object({ kind: z.enum(CTA_KINDS), label: z.string().describe("Libellé du bouton principal, verbe d'action, 40 caractères au plus") }),
    changes: z.array(sourced).describe("Ce qui change par rapport au site actuel : 3 à 5 points, chacun avec sa preuve"),
    toCheck: z.array(z.string()).describe("Ce qui manque ou reste à vérifier avec le prospect (horaires, email, détail des projets…) : pour l'équipe, jamais sur la page"),
  })
}
export type BriefOutput = z.infer<ReturnType<typeof briefOutputSchema>>

// ── Critique ─────────────────────────────────────────────────────────────────────────────────────────────────────

export const CRITERIA = ["hierarchy", "readability", "contrast", "mobile", "brand", "conversion"] as const
export type Criterion = (typeof CRITERIA)[number]
const grade = z.number().describe("De 1 (à refaire) à 5 (excellent)")

/** What the critic answers: loose, like the brief (its first real answer was refused for a defect described at length). */
export const critiqueSchema = z.object({
  scores: z.object({ hierarchy: grade, readability: grade, contrast: grade, mobile: grade, brand: grade, conversion: grade }),
  issues: z
    .array(z.object({ severity: z.enum(["high", "medium", "low"]), criterion: z.enum(CRITERIA), problem: z.string(), fix: z.string() }))
    .describe("Les défauts visibles sur les captures, du plus grave au moins grave, huit au plus"),
  summary: z.string(),
})
export type CritiqueOutput = z.infer<typeof critiqueSchema>

/** The critique as kept: grades from 1 to 5, eight issues at most, texts of a reasonable length. */
export interface Critique {
  scores: Record<Criterion, number>
  issues: { severity: "high" | "medium" | "low"; criterion: Criterion; problem: string; fix: string }[]
  summary: string
}

const clipText = (text: string, max: number) => {
  const t = text.replace(/\s+/g, " ").trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  const space = cut.lastIndexOf(" ")
  return `${space > max * 0.6 ? cut.slice(0, space) : cut}…`
}
export { clipText }

export function normalizeCritique(raw: CritiqueOutput): Critique {
  // A 0-10 answer is brought back to 1-5; anything else is rounded and kept in range.
  const tenths = Object.values(raw.scores).some((v) => v > 5)
  const grade = (v: number) => Math.min(5, Math.max(1, Math.round(Number.isFinite(v) ? (tenths ? v / 2 : v) : 3)))
  const scores = Object.fromEntries(CRITERIA.map((c) => [c, grade(raw.scores[c])])) as Record<Criterion, number>
  return {
    scores,
    issues: raw.issues.slice(0, 8).map((i) => ({ severity: i.severity, criterion: i.criterion, problem: clipText(i.problem, 400), fix: clipText(i.fix, 500) })),
    summary: clipText(raw.summary, 500),
  }
}

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
