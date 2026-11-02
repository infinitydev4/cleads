/**
 * Decisions with a probability (Jev, `experimental_decide`). Each question has two thresholds on the confidence of the
 * selected answer: at or above `auto` the suggestion applies (inside the CRM only, never an outside action); between
 * `human` and `auto` it is shown for confirmation; below `human`, or without a probability, a person decides.
 * The Gateway reruns an uncertain answer on the decision fallback before these thresholds apply (decisionFallback).
 */
export interface Thresholds {
  auto: number
  human: number
}

/** Prudent start, to calibrate on the labelled set (E27). */
export const DEFAULT_THRESHOLDS: Thresholds = { auto: 0.85, human: 0.6 }

export type DecisionOutcome = "auto" | "review" | "human"

/** The answers `experimental_decide` returns (AI SDK 7). */
export type DecisionAnswer =
  | { type: "choice"; choice: string; probabilities?: Record<string, number> }
  | { type: "score"; score: number; probabilities?: Record<string, number> }
  | { type: "boolean"; probability: number }
  | { type: "box"; box: { top: number; bottom: number; left: number; right: number } }
  | { type: "refusal" }

export function validThresholds(t: Thresholds): boolean {
  return t.human >= 0 && t.auto <= 1 && t.human <= t.auto
}

/**
 * Confidence in the selected answer: the probability of the chosen option, the most likely level of a score, or the
 * larger of P(true) and P(false). Null when the model gave no distribution (language-model adapters).
 */
export function confidenceOf(answer: DecisionAnswer): number | null {
  switch (answer.type) {
    case "choice":
      return answer.probabilities?.[answer.choice] ?? null
    case "score":
      return answer.probabilities ? Math.max(...Object.values(answer.probabilities)) : null
    case "boolean":
      return Math.max(answer.probability, 1 - answer.probability)
    default:
      return null
  }
}

export function outcomeOf(confidence: number | null, t: Thresholds = DEFAULT_THRESHOLDS): DecisionOutcome {
  if (confidence == null) return "human"
  if (confidence >= t.auto) return "auto"
  if (confidence >= t.human) return "review"
  return "human"
}

/** The selected value, whatever the question type: option, level, or yes / no. */
export function valueOf(answer: DecisionAnswer): string | number | boolean | null {
  switch (answer.type) {
    case "choice":
      return answer.choice
    case "score":
      return answer.score
    case "boolean":
      return answer.probability >= 0.5
    default:
      return null
  }
}

/**
 * The Gateway's model list for a decision: the first fallback reruns any answer whose confidence is below `auto`
 * (choice and score) or whose P(true) sits in the uncertain band (boolean); the others only replace a failed model.
 */
export function decisionFallbacks(fallbacks: readonly string[], t: Thresholds = DEFAULT_THRESHOLDS) {
  if (!fallbacks.length) return []
  // Rounded so the Gateway receives 0.15, not 0.15000000000000002.
  const low = Math.round(Math.min(1 - t.auto, t.auto) * 1e6) / 1e6
  const band: [number, number] = [low, Math.max(1 - t.auto, t.auto)]
  return [{ model: fallbacks[0], when: { any: [{ confidenceBelow: t.auto }, { probabilityBetween: band }] } }, ...fallbacks.slice(1)]
}
