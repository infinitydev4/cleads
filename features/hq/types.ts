import type { CampaignStatus, DealStage, LeadStatus, MeetingStatus, SearchStatus } from "@prisma/client"
import type { CrmRole } from "@/lib/crm/roles"
import type { PeriodDays } from "@/features/metrics/definitions"
import type { CampaignView } from "@/features/campaigns/service"
import type { AgentId } from "@/features/ai/agents"
import type { ApprovalView } from "@/features/ai/approvals"
import type { WorkerStatus } from "@/features/ai/queue"
import type { RunView } from "@/features/ai/runs"
import type { SiteSummary } from "@/features/studio/labels"
import type { AgentState } from "./agency"
import type { CharacterId } from "./characters"
import type { ZoneId } from "./zones"

/** What the 3D view receives. Every number is computed on what the person may see (features/hq/service.ts). */

export interface Trend {
  value: number
  previous: number
  /** % change; null when the previous period is 0. */
  delta: number | null
}

export interface ZoneSummary {
  /** Short live figure shown on the space's label ("12 à qualifier"); null when the person cannot see the module. */
  badge: string | null
  tone: "neutral" | "active" | "attention"
  /** The person has no right on the module: the space is visible, its panel explains why it is empty. */
  locked: boolean
}

export interface HqMember {
  id: string
  name: string
  /** Shown to colleagues like in the assignee lists of the CRM. */
  email: string | null
  initials: string
  role: CrmRole
  character: CharacterId
  station: ZoneId | "hq"
  seat: number
  status: "meeting" | "online" | "offline"
  isMe: boolean
  /** Only for people who see the whole team (and for oneself). */
  load: { openTasks: number; overdue: number; meetingsToday: number; openLeads: number; openDeals: number } | null
}

export interface LeadMini {
  id: string
  name: string
  city: string | null
  sector: string | null
  status: LeadStatus
  score: number
  ownerName: string | null
  campaignName: string | null
}

export interface CampaignPerf {
  id: string
  name: string
  status: CampaignStatus
  leads: number
  meetings: number
  conversion: number | null
  replyRate: number | null
}

export interface HqOverview {
  generatedAt: string
  days: PeriodDays
  viewer: { id: string; name: string; role: CrmRole; character: CharacterId }
  kpis: {
    leads: Trend
    meetings: Trend
    conversion: { value: number | null; previous: number | null; deltaPts: number | null }
    campaigns: { active: number; total: number; createdInPeriod: number }
  }
  journey: { key: string; label: string; zone: ZoneId; count: number }[]
  conversion: number | null
  zones: Record<ZoneId, ZoneSummary>
  campaigns: CampaignPerf[]
  members: HqMember[]
  recentLeads: LeadMini[]
  /** Live figures some objects of the scene show (server racks, kanban board, charts, flows). */
  signals: {
    searchesRunning: number
    emails7d: number
    dealsByStage: Record<DealStage, number>
    meetingsNext7: number
    weekly: { weekEnding: string; leads: number; meetings: number }[]
    mailboxesActive: number
  }
  /** The AI agency (E26); null for a role that cannot use the AI. Refreshed on its own while agents work. */
  agency: AgencyPulse | null
}

/** One agent as the scene shows it, from the runs the person may see (all for owners and managers, their own otherwise). */
export interface AgentPulse {
  id: AgentId
  state: AgentState
  running: number
  queued: number
  waiting: number
  /** The run shown at the agent's post: the newest running one, else the newest waiting, else the newest queued. */
  current: { runId: string; lead: { id: string; name: string } | null } | null
  /** The newest run that ended a moment ago (features/hq/agency.ts JUST_DONE_MS). */
  lastDone: { runId: string; ok: boolean; finishedAt: string } | null
  today: { runs: number; costEur: number }
}

export interface StudioPulse {
  /** The latest mock-ups with a picture, for the gallery wall (four at most). */
  latest: { id: string; name: string; thumb: string; version: number }[]
  /** Sites whose brief or page is being made now. */
  building: number
  /** Briefs waiting for a person. */
  briefs: number
  /** Sites with at least one published version. */
  ready: number
}

export interface AgencyPulse {
  generatedAt: string
  agents: AgentPulse[]
  /** Approvals waiting for the person (theirs, or the team's for owners and managers). */
  approvals: number
  worker: { online: boolean; queued: number }
  /** The AI gateway key is set on this server. */
  configured: boolean
  /** Null without the Studio right. */
  studio: StudioPulse | null
}

export interface MeetingMini {
  id: string
  leadId: string | null
  leadName: string
  hostName: string
  startsAt: string
  status: MeetingStatus
  needsOutcome: boolean
}

export type ZoneDetail =
  | {
      zone: "sources"
      searches: { id: string; label: string; status: SearchStatus; found: number; imported: number; createdAt: string; campaignName: string | null }[]
      health: { state: string; blocked: string[] } | null
      bySource: { source: string; label: string; count: number }[]
      imports: { batches: number; created: number }
      can: { search: boolean; import: boolean }
    }
  | {
      zone: "qualification"
      toQualify: LeadMini[]
      counts: { replied: number; contacted: number; fresh: number }
      qualified: number
      disqualified: number
    }
  | {
      zone: "coordination"
      today: { overdue: number; dueToday: number; meetings: number; toClose: number }
      tasks: { id: string; title: string; dueAt: string | null; leadId: string; leadName: string; overdue: boolean }[]
      team: { id: string; name: string; role: CrmRole; openTasks: number; overdue: number; meetingsToday: number }[] | null
    }
  | {
      zone: "outreach"
      emailsToday: number
      emails7d: number
      replies7d: number
      unread: number
      calls7d: number
      sequences: { active: number; enrollments: number }
      mailboxes: { address: string; status: string; sentToday: number; allowanceToday: number }[] | null
      channels: { id: "email" | "phone" | "linkedin" | "whatsapp"; label: string; state: "active" | "idle" | "soon"; detail: string }[]
    }
  | {
      zone: "pipeline"
      stages: { stage: DealStage; label: string; count: number; amountCents: number; amountsKnown: number }[]
      deals: { id: string; leadId: string; name: string; stage: DealStage; amountCents: number | null; ownerName: string | null }[]
    }
  | {
      zone: "meetings"
      today: MeetingMini[]
      upcoming: MeetingMini[]
      next7: number
      toClose: MeetingMini[]
    }
  | {
      zone: "analytics"
      journey: { key: string; label: string; zone: ZoneId; count: number }[]
      previous: { key: string; count: number }[]
      conversion: number | null
      weekly: { weekEnding: string; leads: number; meetings: number }[]
      campaigns: CampaignPerf[]
    }
  | {
      zone: "campaigns"
      campaigns: CampaignView[]
      canManage: boolean
    }
  | {
      zone: "agents"
      agents: { id: AgentId; label: string; mission: string; output: string; approval: string; model: string; enabled: boolean }[]
      approvals: ApprovalView[]
      runs: RunView[]
      month: { spentEur: number; capEur: number }
      worker: WorkerStatus
      configured: boolean
    }
  | {
      zone: "studio"
      sites: SiteSummary[]
      counts: { ready: number; building: number; briefs: number; visits: number }
    }
  | { zone: ZoneId; locked: true; reason: string }
