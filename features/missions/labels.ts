import type { AgentMissionScheduleStatus, AgentMissionStatus, AgentMissionStepStatus } from "@prisma/client"
import type { ApprovalLevel } from "./schemas"

/**
 * What the person reads about a mission (E28): its status, its steps', and the views the panel and Agents IA ›
 * Missions show. Safe to import from the browser.
 */
type Tone = "neutral" | "info" | "warning" | "success" | "destructive"

export const MISSION_STATUS_LABELS: Record<AgentMissionStatus, string> = {
  PROPOSED: "À lancer",
  REFUSED: "Refusée",
  EXPIRED: "Expirée",
  RUNNING: "En cours",
  PAUSED: "En pause",
  SUCCEEDED: "Terminée",
  FAILED: "En échec",
  CANCELLED: "Annulée",
}

export const MISSION_STATUS_TONE: Record<AgentMissionStatus, Tone> = {
  PROPOSED: "warning",
  REFUSED: "neutral",
  EXPIRED: "neutral",
  RUNNING: "info",
  PAUSED: "warning",
  SUCCEEDED: "success",
  FAILED: "destructive",
  CANCELLED: "neutral",
}

export const ACTIVE_MISSION_STATUSES: readonly AgentMissionStatus[] = ["PROPOSED", "RUNNING", "PAUSED"]

/** A step as the card shows it: to come, at work, waiting for something, over. */
export type StepState = "todo" | "working" | "waiting" | "approval" | "done" | "skipped" | "failed"

export const STEP_STATE_OF: Record<AgentMissionStepStatus, StepState> = {
  PENDING: "todo",
  RUNNING: "working",
  WAITING: "waiting",
  DONE: "done",
  SKIPPED: "skipped",
  FAILED: "failed",
  UNCERTAIN: "failed",
  CANCELLED: "skipped",
}

export const SCHEDULE_STATUS_LABELS: Record<AgentMissionScheduleStatus, string> = { ACTIVE: "Active", PAUSED: "En pause", STOPPED: "Arrêtée" }

export const LEVEL_NOTES: Record<ApprovalLevel, string | null> = {
  auto: null,
  confirm: null,
  explicit: "Attendra votre propre clic : elle contacte des prospects.",
}

export interface MissionStepView {
  key: string
  /** 1-based, as the person counts. */
  index: number
  text: string
  level: ApprovalLevel
  state: StepState
  /** Where it stands, or what it did: « 340 trouvées, 120 joignables ». */
  detail: string | null
  /** A click this step waits for, when the person may give it. */
  approvalId: string | null
}

export interface MissionReportView {
  lines: string[]
  leads: number
  tag: string | null
  listUrl: string | null
  campaigns: { id: string; name: string }[]
}

export interface MissionView {
  id: string
  title: string
  status: AgentMissionStatus
  requestedBy: string | null
  mine: boolean
  createdAt: string
  approvedAt: string | null
  finishedAt: string | null
  expiresAt: string | null
  steps: MissionStepView[]
  cost: { probableEur: number; maxEur: number; capEur: number; spentEur: number; settingCapEur: number }
  recurrence: { text: string; scheduleId: string | null; status: AgentMissionScheduleStatus | null; nextRunAt: string | null } | null
  pause: { kind: string; reason: string } | null
  report: MissionReportView | null
  /** What the viewer may do now. */
  can: { approve: boolean; pause: boolean; resume: boolean; cancel: boolean; stopRecurrence: boolean }
}

export interface MissionRunView {
  id: string
  agentLabel: string
  task: string | null
  status: string
  costEur: number
  createdAt: string
  lead: { id: string; name: string } | null
}

export interface MissionDetail extends MissionView {
  runs: MissionRunView[]
}

export interface ScheduleView {
  id: string
  title: string
  status: AgentMissionScheduleStatus
  recurrence: string
  nextRunAt: string | null
  failures: number
  pauseReason: string | null
  requestedBy: string | null
  lastMission: { id: string; status: AgentMissionStatus; createdAt: string } | null
  can: { pause: boolean; resume: boolean; stop: boolean }
}
