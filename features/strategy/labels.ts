import type { StrategyTargetStatus } from "@prisma/client"
import type { Basis } from "./schemas"

/** How the Stratège's proposals read in the CRM (E25). */
export const BASIS_LABELS: Record<Basis, string> = {
  crm: "Chiffres du CRM",
  extractor: "Extractor",
  catalogue: "Catalogue",
  hypothesis: "Hypothèse",
}

export const BASIS_TONE: Record<Basis, "info" | "neutral" | "success" | "warning"> = {
  crm: "info",
  extractor: "neutral",
  catalogue: "success",
  hypothesis: "warning",
}

export const TARGET_STATUS_LABELS: Record<StrategyTargetStatus, string> = {
  PROPOSED: "Proposée",
  CAMPAIGN: "Campagne créée",
  LAUNCHED: "Recherche lancée",
  DISMISSED: "Écartée",
}

export const TARGET_STATUS_TONE: Record<StrategyTargetStatus, "neutral" | "info" | "success" | "outline"> = {
  PROPOSED: "neutral",
  CAMPAIGN: "info",
  LAUNCHED: "success",
  DISMISSED: "outline",
}
