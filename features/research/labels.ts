import type { CandidateStatus } from "@prisma/client"

/** What the Enquêteur's work is called on screen (E30 lot 2). Safe in the browser. */
export const RESEARCH_JOBS = ["people", "brief", "geo"] as const
export type ResearchJob = (typeof RESEARCH_JOBS)[number]

export const JOB_LABELS: Record<ResearchJob, string> = { people: "Décideurs et réseaux", brief: "Brief de rendez-vous", geo: "Sonde GEO" }

export const CANDIDATE_STATUS_LABELS: Record<CandidateStatus, string> = { PROBABLE: "Probable", TO_CHECK: "À vérifier", CONFIRMED: "Confirmé", DISMISSED: "Écarté" }

export const CANDIDATE_ROLE_LABELS = { EXECUTIVE: "Dirigeant", DECISION_MAKER: "Marketing ou commercial", OTHER: "Autre" } as const

export const NETWORK_LABELS: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", tiktok: "TikTok", x: "X", youtube: "YouTube", pinterest: "Pinterest" }

/** What one job usually costs, for the buttons (measured on fictional cases, rounded up). */
export const TYPICAL_COST = { people: "≈ 0,02 €", brief: "≈ 0,08 €", geo: "≈ 0,02 €" } as const satisfies Record<ResearchJob, string>
