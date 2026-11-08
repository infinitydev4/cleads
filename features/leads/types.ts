import type { LeadStatus } from "@prisma/client"
import type { CallScript, Objection } from "@/features/offer-pitch/schemas"
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

/** The closer's desk (9 November 2026, features/leads/insights.ts): no site, a site to improve, a correct one, not audited. */
export type SiteState = "none" | "weak" | "ok" | "unknown"
/** 1: call first, 2: a good fiche with nothing urgent, 3: wait. */
export type Priority = 1 | 2 | 3

/** What a row of the list shows at a glance; computed when read, never stored. */
export interface RowInsight {
  site: SiteState
  /** The best offer of the latest pitch the team has not rejected. */
  offer: { name: string; price: string } | null
  /** The next open task: a callback, a follow-up. */
  next: { title: string; dueAt: string | null; late: boolean } | null
  /** The latest registry or advertising signal of the last 30 days. */
  signal: string | null
  priority: Priority
}

export type LeadListRow = LeadRow & RowInsight

/** What the fiche puts first to prepare a call: why now, and the latest call script. */
export interface CallBrief {
  priority: Priority
  site: SiteState
  siteScore: number | null
  audited: boolean
  reasons: { text: string; source: string; url: string | null }[]
  pitch: {
    headline: string
    createdAt: string
    script: CallScript | null
    objections: Objection[]
    offers: { name: string; price: string; why: string; gain: string }[]
  } | null
}

export interface LeadList {
  rows: LeadListRow[]
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
  /** E15: the campaign the fiche is worked in. */
  campaign: { id: string; name: string; archived: boolean } | null
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
  activities: { id: string; kind: string; body: string | null; actorName: string | null; actorKind: string; occurredAt: string; outcome: string | null; durationMin: number | null; event: string | null; via: string | null }[]
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
  can: { write: boolean; log: boolean; assignOthers: boolean; delete: boolean; qualify: boolean; meet: boolean; meetAnywhere: boolean; email: boolean; campaign: boolean; audit: boolean; offers: boolean; studio: boolean }
  /** E20: what the latest AI audit adds to the score, without changing its rules. */
  aiReason: { label: string; confidence: number; createdAt: string } | null
  /** E21: the latest pitch of the Conseiller offres, for the tab of suggested offers; null without `ai:use`. */
  pitch: { offers: number; createdAt: string } | null
  /** The closer's desk: why call now and the call script. */
  brief: CallBrief
  /** "focus" for the closer: the call first, the rest folded away; "full" for everyone else. */
  layout: "focus" | "full"
}
