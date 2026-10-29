import { emailDomain, normalizeEmail } from "@/lib/crm/normalize"

/**
 * Rule-based prospect score, 0 to 100. Every point is explained, so a person can see why a fiche ranks where it does.
 * The weights are a starting point to calibrate on real outcomes (which scored fiches answer, qualify, sign);
 * they are not a prediction.
 */
export interface ScoreInput {
  email?: string | null
  emailKind?: "NOMINATIVE" | "GENERIC" | "UNKNOWN" | null
  phone?: string | null
  website?: string | null
  domain?: string | null
  rating?: number | null
  reviewCount?: number | null
  completeness?: number | null
  contactName?: string | null
  address?: string | null
  city?: string | null
}

export interface ScoreReason {
  code: string
  label: string
  points: number
}

export const SCORE_RULES = {
  emailNominative: 25,
  emailGeneric: 12,
  phone: 10,
  website: 10,
  siteMatchesEmail: 10,
  ratingHigh: 10,
  ratingGood: 6,
  reviewsMany: 10,
  reviewsSome: 5,
  completenessHigh: 10,
  completenessGood: 5,
  contactName: 5,
  address: 10,
} as const

export function scoreLead(input: ScoreInput): { score: number; reasons: ScoreReason[] } {
  const reasons: ScoreReason[] = []
  const add = (code: keyof typeof SCORE_RULES, label: string) => reasons.push({ code, label, points: SCORE_RULES[code] })
  const email = normalizeEmail(input.email)

  if (email) {
    if (input.emailKind === "NOMINATIVE") add("emailNominative", "Email nominatif")
    else if (input.emailKind === "GENERIC") add("emailGeneric", "Email générique")
    else add("emailGeneric", "Email trouvé")
  }
  if (input.phone) add("phone", "Téléphone")
  if (input.website) add("website", "Site web")
  if (email && input.domain && emailDomain(email) === input.domain) add("siteMatchesEmail", "Email sur le domaine du site")
  if (typeof input.rating === "number") {
    if (input.rating >= 4.5) add("ratingHigh", `Note ${input.rating}/5`)
    else if (input.rating >= 4) add("ratingGood", `Note ${input.rating}/5`)
  }
  if (typeof input.reviewCount === "number") {
    if (input.reviewCount >= 50) add("reviewsMany", `${input.reviewCount} avis`)
    else if (input.reviewCount >= 10) add("reviewsSome", `${input.reviewCount} avis`)
  }
  if (typeof input.completeness === "number") {
    if (input.completeness >= 80) add("completenessHigh", "Fiche source complète")
    else if (input.completeness >= 60) add("completenessGood", "Fiche source assez complète")
  }
  if (input.contactName?.trim()) add("contactName", "Interlocuteur identifié")
  if (input.address && input.city) add("address", "Adresse complète")

  return { score: Math.min(100, reasons.reduce((sum, r) => sum + r.points, 0)), reasons }
}
