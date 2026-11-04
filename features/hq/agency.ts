import type { AgentId } from "@/features/ai/agents"
import { formatCount } from "@/features/metrics/definitions"
import type { AgencyPulse, ZoneSummary } from "./types"

/**
 * The AI agency in the 3D view (E26): where each agent works and what it is doing. The specialists sit round the core
 * of the control room ("Agents IA"), the core is the copilot, and the designer works in the Studio Web. Pure and safe
 * to import from the browser, so the scene, the HUD and the tests agree.
 */

/**
 * The control room's posts, in the order of the acquisition journey: targets, sorting, research (E30), audit, offers,
 * email, replies.
 */
export const CONTROL_ROOM = ["strategist", "qualifier", "researcher", "auditor", "offers", "writer", "replies"] as const satisfies readonly AgentId[]

/** The agents as the HUD lists them: the copilot (the agency's head), the control room in journey order, the designer. */
export const AGENCY_ORDER: readonly AgentId[] = ["copilot", ...CONTROL_ROOM, "designer"]

export type Post ={ zone: "agents"; kind: "station"; index: number } | { zone: "agents"; kind: "core" } | { zone: "studio"; kind: "desk" }

export function postOf(id: AgentId): Post {
  if (id === "copilot") return { zone: "agents", kind: "core" }
  if (id === "designer") return { zone: "studio", kind: "desk" }
  return { zone: "agents", kind: "station", index: (CONTROL_ROOM as readonly string[]).indexOf(id) }
}

/** What an agent is doing now, as the scene shows it. */
export type AgentState = "working" | "queued" | "waiting" | "idle" | "off"

export const AGENT_STATE_LABELS: Record<AgentState, string> = {
  working: "Au travail",
  queued: "En file",
  waiting: "Attend une validation",
  idle: "Au repos",
  off: "Désactivé",
}

/**
 * From the agent's active runs: a call waiting for a person comes first (someone has to act), then work in progress,
 * then work waiting for the worker. A switched-off agent may still finish what it started.
 */
export function agentStateOf(a: { enabled: boolean; running: number; queued: number; waiting: number }): AgentState {
  if (a.waiting > 0) return "waiting"
  if (a.running > 0) return "working"
  if (a.queued > 0) return "queued"
  return a.enabled ? "idle" : "off"
}

/** How long after its end a run still counts as "just finished" (the agent greets a success once). */
export const JUST_DONE_MS = 60_000

const plural = (n: number, one: string, many: string) => `${formatCount(n)} ${n > 1 ? many : one}`

/**
 * The badges of the two AI spaces: what waits for a person first, then what is moving. Computed from the pulse alone,
 * so the view keeps them live between two refreshes of the whole overview.
 */
export function agencySummaries(pulse: AgencyPulse | null, locked: { agents: boolean; studio: boolean }): { agents: ZoneSummary; studio: ZoneSummary } {
  const closed: ZoneSummary = { badge: null, tone: "neutral", locked: true }
  const open = (badge: string, tone: ZoneSummary["tone"] = "neutral"): ZoneSummary => ({ badge, tone, locked: false })
  let agents = closed
  if (pulse && !locked.agents) {
    const sum = (f: (a: AgencyPulse["agents"][number]) => number) => pulse.agents.reduce((n, a) => n + f(a), 0)
    const working = pulse.agents.filter((a) => a.running > 0).length
    if (pulse.approvals) agents = open(`${formatCount(pulse.approvals)} à valider`, "attention")
    else if (working) agents = open(plural(working, "agent au travail", "agents au travail"), "active")
    else if (sum((a) => a.queued)) agents = open(plural(sum((a) => a.queued), "exécution en file", "exécutions en file"))
    else if (sum((a) => a.today.runs)) agents = open(plural(sum((a) => a.today.runs), "exécution aujourd’hui", "exécutions aujourd’hui"))
    else agents = open("Au repos")
  }
  let studio = closed
  const s = pulse?.studio
  if (s && !locked.studio) {
    if (s.briefs) studio = open(plural(s.briefs, "brief à relire", "briefs à relire"), "attention")
    else if (s.building) studio = open(plural(s.building, "maquette en cours", "maquettes en cours"), "active")
    else studio = open(s.ready ? plural(s.ready, "maquette prête", "maquettes prêtes") : "Aucune maquette")
  }
  return { agents, studio }
}
