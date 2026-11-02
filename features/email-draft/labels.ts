import type { AgentRunStatus, DraftKind } from "@prisma/client"
import type { Evidence } from "@/features/prospect-audit/schemas"

/** What the browser shows of a draft (E22); safe to import from the browser. */
export interface DraftView {
  id: string
  kind: DraftKind
  subject: string
  body: string
  /** The audit facts the message cites, each with its evidence. */
  facts: { text: string; evidence: Evidence[] }[]
  /** What the person must check before sending. */
  notes: string[]
  model: string | null
  costEur: number
  createdAt: string
}

export interface DraftState {
  runId: string
  status: AgentRunStatus
  error: string | null
  draft: DraftView | null
}

export const NO_AUDIT_FOR_DRAFT = "Auditez d’abord la fiche : le brouillon s’appuie sur les constats de l’audit."

export const DRAFT_KIND_LABELS: Record<DraftKind, string> = { FIRST_EMAIL: "Premier email", REPLY: "Réponse", SEQUENCE_STEP: "Étape de séquence" }

export const isActiveRun = (status: AgentRunStatus) => status === "QUEUED" || status === "RUNNING" || status === "WAITING_APPROVAL"
