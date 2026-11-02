import type { AgentId } from "./agents"
import type { RunContext } from "./runs"
import type { ApprovedCall } from "./tools"

/**
 * What each agent does when the worker runs it (E18). An agent's epic (E20 to E25) registers its handler; the worker
 * only takes runs of agents it has a handler for, the others wait in the queue.
 *
 * A handler may run more than once for the same run: after a passing failure, after a worker restart, and after a
 * person approved one of its actions. It must therefore rely on `approved` (the calls already executed, with their
 * results) instead of asking for them again.
 */
export interface HandlerContext {
  run: RunContext
  /** 1 on the first try. */
  attempt: number
  input: unknown
  approved: ApprovedCall[]
  /** Aborted when the run is cancelled or its lease is lost: stop as soon as possible. */
  signal: AbortSignal
}

export type AgentHandler = (job: HandlerContext) => Promise<{ output?: unknown } | void>

/** A passing failure (provider down, timeout): the run is tried again later, three times at most. */
export class RetryableError extends Error {}

const handlers = new Map<AgentId, AgentHandler>()
/** Work any language agent can do, chosen by the run's input `kind` (a skill test, E19), whatever the agent. */
const tasks = new Map<string, AgentHandler>()

export function registerAgentHandler(agentId: AgentId, handler: AgentHandler): void {
  if (handlers.has(agentId)) throw new Error(`Agent ${agentId} : déjà enregistré`)
  handlers.set(agentId, handler)
}

export const agentHandler = (agentId: AgentId) => handlers.get(agentId)
export const handledAgents = (): AgentId[] => [...handlers.keys()]

export function registerTaskHandler(kind: string, handler: AgentHandler): void {
  if (tasks.has(kind)) throw new Error(`Tâche ${kind} : déjà enregistrée`)
  tasks.set(kind, handler)
}

/** The kind written in a run's input (`{ kind: "skill_test", … }`), if any. */
export const taskKindOf = (input: unknown): string | null => {
  const kind = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>).kind : null
  return typeof kind === "string" ? kind : null
}
export const taskHandler = (input: unknown) => {
  const kind = taskKindOf(input)
  return kind ? tasks.get(kind) : undefined
}
export const handledTasks = (): string[] => [...tasks.keys()]

/** Tests only. */
export function clearAgentHandlers() {
  handlers.clear()
  tasks.clear()
}
