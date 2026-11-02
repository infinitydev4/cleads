import type { ReplyClass, ReplyUrgency, TriageOutcome } from "@prisma/client"

/** Words shown for suggested filings (E22); safe to import from the browser. */
export const URGENCY_LABELS: Record<ReplyUrgency, string> = { HIGH: "Urgent", NORMAL: "Cette semaine", LOW: "Sans urgence" }

export interface TriageView {
  replyClass: ReplyClass | null
  /** 0-1: how sure Jev is of the class. */
  confidence: number | null
  outcome: TriageOutcome
  urgency: ReplyUrgency | null
  needsAction: boolean | null
}

/** A suggestion is offered when Jev is at least fairly sure; under the lower threshold the reply stays « À classer ». */
export const isOffered = (t: Pick<TriageView, "replyClass" | "outcome"> | null | undefined): t is TriageView & { replyClass: ReplyClass } => !!t?.replyClass && t.outcome !== "HUMAN"

export const percent = (confidence: number | null) => (confidence == null ? "" : `${Math.round(confidence * 100)} %`)
