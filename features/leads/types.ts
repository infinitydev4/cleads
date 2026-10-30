import type { LeadStatus } from "@prisma/client"
import type { ScoreReason } from "./scoring"

export const LEAD_STATUSES = ["NEW", "CONTACTED", "REPLIED", "QUALIFIED", "DISQUALIFIED", "DO_NOT_CONTACT"] as const satisfies readonly LeadStatus[]

export interface LeadRow {
  id: string
  name: string
  city: string | null
  sector: string | null
  contactName: string | null
  email: string | null
  emailKind: "NOMINATIVE" | "GENERIC" | "UNKNOWN" | null
  phone: string | null
  website: string | null
  status: LeadStatus
  score: number
  ownerId: string | null
  ownerName: string | null
  tags: string[]
  source: string
  lastContactedAt: string | null
  createdAt: string
}

export interface LeadList {
  rows: LeadRow[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

export interface LeadDetail {
  id: string
  status: LeadStatus
  score: number
  scoreReasons: ScoreReason[]
  source: string
  tags: string[]
  ownerId: string | null
  ownerName: string | null
  lastContactedAt: string | null
  createdAt: string
  company: {
    id: string
    name: string
    website: string | null
    domain: string | null
    phone: string | null
    email: string | null
    address: string | null
    city: string | null
    postalCode: string | null
    country: string
    sector: string | null
    siret: string | null
    rating: number | null
    reviewCount: number | null
    completeness: number | null
  } | null
  contact: {
    id: string
    name: string | null
    jobTitle: string | null
    email: string | null
    emailKind: "NOMINATIVE" | "GENERIC" | "UNKNOWN"
    phone: string | null
    doNotContact: boolean
    doNotContactReason: string | null
    source: string
    collectedFrom: string | null
    collectedAt: string | null
    legalBasis: string | null
  } | null
  activities: { id: string; kind: string; body: string | null; actorName: string | null; actorKind: string; occurredAt: string; outcome: string | null; durationMin: number | null }[]
  qualification: {
    need?: string
    budget?: "unknown" | "none" | "yes"
    budgetAmountCents?: number
    authority?: "unknown" | "decision_maker" | "influencer" | "user"
    timing?: "unknown" | "now" | "1_3_months" | "3_6_months" | "later"
    notes?: string
    disqualification?: { reason: string; detail?: string }
    updatedAt?: string
  } | null
  deals: { id: string; stage: string; amountCents: number | null; expectedCloseAt: string | null; lostReason: string | null; ownerId: string | null; ownerName: string | null; canMove: boolean }[]
  meetings: { id: string; startsAt: string; endsAt: string; status: string; type: string; hostName: string | null }[]
  tasks: { id: string; title: string; dueAt: string | null; doneAt: string | null; assigneeId: string | null; assigneeName: string | null; canChange: boolean }[]
  /** What the signed-in person may do with this fiche, computed on the server. */
  can: { write: boolean; log: boolean; assignOthers: boolean; delete: boolean; qualify: boolean; meet: boolean; meetAnywhere: boolean }
}
