import type { RelevanceVerdict } from "@prisma/client"

/** Jev's verdicts on a fiche, in words (E25). */
export const VERDICT_LABELS: Record<RelevanceVerdict, string> = {
  RELEVANT: "Pertinente",
  MAYBE: "Possible",
  NOT_RELEVANT: "Non pertinente",
}
