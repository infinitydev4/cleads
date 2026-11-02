import type { AgentApprovalStatus, AgentRunStatus } from "@prisma/client"

/** Words shown for runs and approvals; safe to import from the browser. */
export const RUN_STATUS_LABELS: Record<AgentRunStatus, string> = {
  QUEUED: "En file",
  RUNNING: "En cours",
  WAITING_APPROVAL: "À valider",
  SUCCEEDED: "Terminée",
  FAILED: "En échec",
  CANCELLED: "Arrêtée",
  BUDGET_EXCEEDED: "Plafond atteint",
  EXPIRED: "Expirée",
}

export const RUN_STATUS_TONE: Record<AgentRunStatus, "neutral" | "info" | "warning" | "success" | "destructive"> = {
  QUEUED: "neutral",
  RUNNING: "info",
  WAITING_APPROVAL: "warning",
  SUCCEEDED: "success",
  FAILED: "destructive",
  CANCELLED: "neutral",
  BUDGET_EXCEEDED: "warning",
  EXPIRED: "neutral",
}

export const APPROVAL_STATUS_LABELS: Record<AgentApprovalStatus, string> = {
  PENDING: "En attente",
  APPROVED: "Approuvée",
  REJECTED: "Refusée",
  EXPIRED: "Expirée",
}

export const ACTIVE_STATUSES: readonly AgentRunStatus[] = ["QUEUED", "RUNNING", "WAITING_APPROVAL"]

const euros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" })
const cents = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 4 })
/** Below one euro, up to four decimals: an audit costs cents, a decision a fraction of a cent. */
export const formatEur = (eur: number) => (Math.abs(eur) >= 1 ? euros : cents).format(eur)

/** Parts of an agent's layer that a saved version changed (features/ai/definitions.ts). */
export const CHANGE_LABELS: Record<string, string> = { instructions: "consignes", skills: "skills", model: "modèle", limits: "limites", enabled: "activation" }
