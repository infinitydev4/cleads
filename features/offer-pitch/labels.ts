import type { OfferBilling, RecommendationRole, RecommendationStatus, RejectionReason } from "@prisma/client"
import { formatOfferPrice } from "@/features/offers/labels"

/** Words shown for offer pitches (E21); safe to import from the browser. */
export const ROLE_LABELS: Record<RecommendationRole, string> = {
  MAIN: "Offre principale",
  COMPLEMENT: "Dans le pack",
  ENTRY: "Offre d’entrée",
  LATER: "Pour plus tard",
}

export const ROLE_HINTS: Record<RecommendationRole, string> = {
  MAIN: "Celle à proposer d’abord",
  COMPLEMENT: "Proposée avec l’offre principale",
  ENTRY: "Une première étape moins chère, si le pack est trop lourd",
  LATER: "Pertinente, mais pour une seconde étape",
}

export const STATUS_LABELS: Record<RecommendationStatus, string> = { SUGGESTED: "Suggérée", ACCEPTED: "Retenue", REJECTED: "Écartée" }

export const REJECTION_REASONS = ["NOT_RELEVANT", "TOO_EXPENSIVE", "ALREADY_HAS", "BAD_TIMING", "OTHER"] as const satisfies readonly RejectionReason[]

export const REASON_LABELS: Record<RejectionReason, string> = {
  NOT_RELEVANT: "Pas adaptée à ce prospect",
  TOO_EXPENSIVE: "Trop chère pour lui",
  ALREADY_HAS: "Il a déjà ce service",
  BAD_TIMING: "Pas le bon moment",
  OTHER: "Autre raison",
}

/** The 15-minute call, as the skill script-appel-15min lays it out. */
export const SCRIPT_STEPS = [
  { key: "opening", label: "Ouverture", minutes: 1 },
  { key: "hook", label: "Accroche sur l’audit", minutes: 2 },
  { key: "questions", label: "Découverte", minutes: 5 },
  { key: "proposal", label: "Proposition", minutes: 3 },
  { key: "objections", label: "Objections", minutes: 2 },
  { key: "close", label: "Conclusion", minutes: 2 },
] as const
export type ScriptStep = (typeof SCRIPT_STEPS)[number]["key"]

/** "0–1 min", "1–3 min"… for each step of the call. */
export function stepTimes(): Record<ScriptStep, string> {
  let at = 0
  return Object.fromEntries(
    SCRIPT_STEPS.map((s) => {
      const label = `${at}–${at + s.minutes} min`
      at += s.minutes
      return [s.key, label]
    })
  ) as Record<ScriptStep, string>
}

export function fitLabel(fit: number): { label: string; tone: "success" | "info" | "neutral" } {
  if (fit >= 75) return { label: "Très adaptée", tone: "success" }
  if (fit >= 50) return { label: "Adaptée", tone: "info" }
  return { label: "À vérifier", tone: "neutral" }
}

interface Priced {
  priceMinEur: number | null
  priceMaxEur: number | null
  billing: OfferBilling
}

/**
 * The budget of a pack, added up from the catalogue's ranges: one-off and monthly apart, offers on quote said as such.
 * "2 000 à 6 000 € HT + 300 à 800 € HT par mois". Never a figure the model wrote.
 */
export function packBudget(offers: readonly Priced[]): string | null {
  const parts: string[] = []
  for (const billing of ["ONE_OFF", "MONTHLY"] as const) {
    const list = offers.filter((o) => o.billing === billing && (o.priceMinEur != null || o.priceMaxEur != null))
    if (!list.length) continue
    const min = list.reduce((sum, o) => sum + (o.priceMinEur ?? 0), 0)
    // One open range ("à partir de…") leaves the pack open too.
    const max = list.every((o) => o.priceMaxEur != null) ? list.reduce((sum, o) => sum + (o.priceMaxEur ?? 0), 0) : null
    parts.push(formatOfferPrice({ priceMinEur: min || null, priceMaxEur: max, billing }))
  }
  if (offers.some((o) => o.billing === "QUOTE" || (o.priceMinEur == null && o.priceMaxEur == null))) parts.push(parts.length ? "une partie sur devis" : "Sur devis")
  return parts.length ? parts.join(" + ") : null
}
