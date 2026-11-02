import type { AgentRunStatus, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { toCrmRole } from "@/lib/crm/roles"
import { can, canAccessRecord } from "@/lib/rbac"
import { LeadError } from "@/features/leads/errors"
import { ACTIVE_RUN_STATUSES, SYSTEM_USER, addUsage, chargeRun, checkBudgetAlerts, getAiSettings, microsToEur, reserveBudget } from "@/lib/ai/budget"
import { costMicros, priceTable, type ModelPrice, type TokenUsage } from "@/lib/ai/pricing"
import { forLog } from "@/lib/ai/untrusted"
import { agentLabel, isAgentId, type AgentId } from "./agents"
import { effectiveAgent } from "./definitions"

/**
 * AI runs (docs/crm-v1/AGENTS-IA.md §10): one execution of an agent, who it acts for, what it did and what it cost.
 * Starting a run reserves the agent's cap; every model call is billed to it; ending it releases what is left.
 */
export interface RunContext {
  id: string
  workspaceId: string
  agentId: AgentId
  /** The person the run acts for, with their current role; null for scheduled work. Tools check this person's rights. */
  requester: CurrentUser | null
  /** Usage key: the requester's id, or "system". */
  userKey: string
  leadId: string | null
}

const MANAGERS = ["OWNER", "MANAGER"]
export const isManager = (u: CurrentUser) => MANAGERS.includes(u.role)

export interface StartRunInput {
  agentId: AgentId
  leadId?: string | null
  campaignId?: string | null
  parentRunId?: string | null
  input?: Prisma.InputJsonValue
  /** RUNNING for work done during the request; QUEUED for the worker (E18). */
  status?: "QUEUED" | "RUNNING"
  /** Higher runs first in the queue. */
  priority?: number
}

const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === "P2002"

async function checkTargets(workspaceId: string, actor: CurrentUser | null, input: StartRunInput): Promise<void> {
  if (input.leadId) {
    const lead = await prisma.lead.findFirst({ where: { id: input.leadId, workspaceId }, select: { ownerId: true } })
    if (!lead) throw new LeadError("not_found", "Fiche introuvable", 404)
    if (actor && !canAccessRecord(actor, "lead:write", lead.ownerId)) {
      throw new LeadError("forbidden", "Cette fiche ne vous est pas attribuée : l'IA ne peut pas y travailler pour vous.", 403)
    }
  }
  if (input.campaignId && !(await prisma.campaign.count({ where: { id: input.campaignId, workspaceId } }))) throw new LeadError("not_found", "Campagne introuvable", 404)
  if (input.parentRunId && !(await prisma.agentRun.count({ where: { id: input.parentRunId, workspaceId } }))) throw new LeadError("not_found", "Exécution introuvable", 404)
}

async function createRun(workspaceId: string, requester: CurrentUser | null, input: StartRunInput): Promise<RunContext> {
  // The workspace may lower an agent's cap or switch it off (E19, features/ai/definitions.ts), never raise it.
  const agent = await effectiveAgent(workspaceId, input.agentId)
  if (!agent.enabled) throw new LeadError("conflict", `L'agent « ${agent.def.label} » est désactivé : le propriétaire peut le réactiver dans Agents IA.`, 409)
  const cap = agent.capMicros
  const status = input.status ?? "QUEUED"
  const userKey = requester?.id ?? SYSTEM_USER
  const run = await prisma
    .$transaction(async (tx) => {
      await reserveBudget(tx, { workspaceId, userKey, capMicros: cap })
      return tx.agentRun.create({
        data: {
          workspaceId,
          agentId: input.agentId,
          status,
          requestedById: requester?.id ?? null,
          leadId: input.leadId ?? null,
          campaignId: input.campaignId ?? null,
          parentRunId: input.parentRunId ?? null,
          input: input.input,
          priority: input.priority ?? 0,
          capMicros: cap,
          reservedMicros: cap,
          startedAt: status === "RUNNING" ? new Date() : null,
        },
        select: { id: true },
      })
    })
    .catch((error: unknown) => {
      // One run of an agent at a time per fiche (unique index of migration 20261103090000_ai_worker).
      if (isUniqueViolation(error)) throw new LeadError("conflict", "Cet agent travaille déjà sur cette fiche : attendez la fin de l'exécution en cours.", 409)
      throw error
    })
  await audit({
    action: "ai.run_started",
    actorId: requester?.id ?? null,
    workspaceId,
    entityType: "AgentRun",
    entityId: run.id,
    metadata: { agentId: input.agentId, leadId: input.leadId ?? null },
  })
  return { id: run.id, workspaceId, agentId: input.agentId, requester, userKey, leadId: input.leadId ?? null }
}

/** Starts a run for a member: the right to use AI, the right to work on the fiche, then the agent's cap is reserved. */
export async function startRun(actor: CurrentUser, input: StartRunInput): Promise<RunContext> {
  if (!can(actor.role, "ai:use")) throw new LeadError("forbidden", "Votre rôle ne permet pas de lancer l'IA.", 403)
  await checkTargets(actor.workspaceId, actor, input)
  return createRun(actor.workspaceId, actor, input)
}

/** Starts scheduled work nobody asked for (E18): no personal quota, and only tools that need no one's rights. */
export async function startSystemRun(workspaceId: string, input: StartRunInput): Promise<RunContext> {
  await checkTargets(workspaceId, null, input)
  return createRun(workspaceId, null, input)
}

/**
 * Rebuilds the context of an existing run (the worker resuming it, E18). The requester's role is read again: a role
 * change or a deactivation applies at once, and a deactivated requester leaves the run with no rights.
 */
export async function loadRunContext(runId: string): Promise<RunContext> {
  const run = await prisma.agentRun.findUnique({
    where: { id: runId },
    select: { id: true, workspaceId: true, agentId: true, leadId: true, requestedById: true, requestedBy: { select: { id: true, name: true, email: true, image: true, role: true, active: true, workspaceId: true } } },
  })
  if (!run || !isAgentId(run.agentId)) throw new LeadError("not_found", "Exécution introuvable", 404)
  const u = run.requestedBy
  const role = toCrmRole(u?.role)
  const requester =
    u && u.active && role && u.workspaceId === run.workspaceId ? { id: u.id, workspaceId: run.workspaceId, name: u.name ?? u.email ?? "", email: u.email ?? "", image: u.image, role } : null
  return { id: run.id, workspaceId: run.workspaceId, agentId: run.agentId, requester, userKey: run.requestedById ?? SYSTEM_USER, leadId: run.leadId }
}

/** A queued run taken by the worker. False when it was cancelled or taken in the meantime. */
export async function markRunning(runId: string): Promise<boolean> {
  const res = await prisma.agentRun.updateMany({ where: { id: runId, status: "QUEUED" }, data: { status: "RUNNING", startedAt: new Date() } })
  return res.count === 1
}

/** Budget the run may still spend; refuses when the run is over. */
export async function remainingMicros(runId: string): Promise<number> {
  const run = await prisma.agentRun.findUnique({ where: { id: runId }, select: { capMicros: true, costMicros: true, status: true } })
  if (!run) throw new LeadError("not_found", "Exécution introuvable", 404)
  if (!(ACTIVE_RUN_STATUSES as readonly string[]).includes(run.status)) throw new LeadError("conflict", "Cette exécution est terminée.", 409)
  return Math.max(run.capMicros - run.costMicros, 0)
}

export interface ModelStepInput {
  type: "MODEL" | "DECISION"
  name: string
  model: string
  usage: TokenUsage
  durationMs: number
  input?: unknown
  output?: unknown
  generationId?: string | null
  prices?: Record<string, ModelPrice>
}

const json = (value: unknown) => (value === undefined ? undefined : forLog(value))

/** Bills a model call to its run: its cost goes to the run and to the day's usage in one transaction. */
export async function recordModelStep(ctx: RunContext, step: ModelStepInput): Promise<{ index: number; costMicros: number }> {
  const [settings, prices] = await Promise.all([getAiSettings(ctx.workspaceId), step.prices ?? priceTable()])
  const { micros } = costMicros(prices[step.model], step.usage, settings.eurPerUsd)
  const index = await prisma.$transaction(async (tx) => {
    const charged = await chargeRun(tx, ctx.id, micros)
    await tx.agentStep.create({
      data: {
        runId: ctx.id,
        index: charged.index,
        type: step.type,
        name: step.name,
        model: step.model,
        input: json(step.input),
        output: json(step.output),
        inputTokens: step.usage.inputTokens,
        outputTokens: step.usage.outputTokens,
        cachedInputTokens: step.usage.cacheReadTokens,
        costMicros: micros,
        durationMs: Math.max(Math.round(step.durationMs), 0),
        generationId: step.generationId ?? null,
      },
    })
    await addUsage(tx, { workspaceId: ctx.workspaceId, userKey: ctx.userKey, agentId: ctx.agentId, model: step.model, usage: step.usage, micros })
    return charged.index
  })
  if (micros > 0) await checkBudgetAlerts(ctx.workspaceId)
  return { index, costMicros: micros }
}

/** Records a step that costs nothing: a tool call or an approval request. */
export async function recordStep(ctx: RunContext, step: { type: "TOOL" | "APPROVAL"; name: string; input?: unknown; output?: unknown; durationMs?: number }): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const charged = await chargeRun(tx, ctx.id, 0)
    await tx.agentStep.create({
      data: { runId: ctx.id, index: charged.index, type: step.type, name: step.name, input: json(step.input), output: json(step.output), durationMs: Math.max(Math.round(step.durationMs ?? 0), 0) },
    })
    return charged.index
  })
}

export type EndStatus = Extract<AgentRunStatus, "SUCCEEDED" | "FAILED" | "CANCELLED" | "BUDGET_EXCEEDED" | "EXPIRED">

/**
 * Ends an active run and releases what it still held. False when it had already ended. A worker passes its id so it
 * never ends a run another worker took over after a stall.
 */
export async function finishRun(runId: string, end: { status: EndStatus; output?: unknown; error?: string | null; lockedBy?: string }): Promise<boolean> {
  const res = await prisma.agentRun.updateMany({
    where: { id: runId, status: { in: [...ACTIVE_RUN_STATUSES] }, ...(end.lockedBy ? { lockedBy: end.lockedBy } : {}) },
    data: { status: end.status, finishedAt: new Date(), reservedMicros: 0, output: end.output === undefined ? undefined : forLog(end.output, 8_000), error: end.error?.slice(0, 2_000) ?? null },
  })
  return res.count === 1
}

/** Stops a run: its requester, a manager or the owner. Pending approvals are refused with it. */
export async function cancelRun(actor: CurrentUser, runId: string): Promise<void> {
  const run = await prisma.agentRun.findFirst({ where: { id: runId, workspaceId: actor.workspaceId }, select: { requestedById: true, status: true, agentId: true } })
  if (!run) throw new LeadError("not_found", "Exécution introuvable", 404)
  if (run.requestedById !== actor.id && !isManager(actor)) {
    throw new LeadError("forbidden", "Seule la personne qui l'a lancée, un manager ou le propriétaire peut arrêter cette exécution.", 403)
  }
  if (!(ACTIVE_RUN_STATUSES as readonly string[]).includes(run.status)) throw new LeadError("conflict", "Cette exécution est déjà terminée.", 409)
  const now = new Date()
  await prisma.agentApproval.updateMany({ where: { runId, status: "PENDING" }, data: { status: "REJECTED", decidedById: actor.id, decidedAt: now, note: "Exécution arrêtée" } })
  await finishRun(runId, { status: "CANCELLED" })
  await audit({ action: "ai.run_cancelled", actorId: actor.id, workspaceId: actor.workspaceId, entityType: "AgentRun", entityId: runId, metadata: { agentId: run.agentId } })
}

export interface RunView {
  id: string
  agentId: string
  agentLabel: string
  status: AgentRunStatus
  requestedBy: string | null
  lead: { id: string; name: string } | null
  costEur: number
  capEur: number
  steps: number
  error: string | null
  createdAt: string
  finishedAt: string | null
  canCancel: boolean
}

const leadName = (l: { company: { name: string } | null; contact: { name: string | null; email: string | null } | null }) => l.company?.name ?? l.contact?.name ?? l.contact?.email ?? "Fiche"

/** Recent runs: all of them for owners and managers, one's own for the others. */
export async function listRuns(actor: CurrentUser, opts: { leadId?: string; limit?: number } = {}): Promise<RunView[]> {
  if (!can(actor.role, "ai:read")) throw new LeadError("forbidden", "Accès refusé", 403)
  const rows = await prisma.agentRun.findMany({
    where: { workspaceId: actor.workspaceId, ...(opts.leadId ? { leadId: opts.leadId } : {}), ...(isManager(actor) ? {} : { requestedById: actor.id }) },
    include: { requestedBy: { select: { name: true, email: true } }, lead: { select: { id: true, company: { select: { name: true } }, contact: { select: { name: true, email: true } } } } },
    orderBy: { createdAt: "desc" },
    take: Math.min(opts.limit ?? 20, 100),
  })
  return rows.map((r) => ({
    id: r.id,
    agentId: r.agentId,
    agentLabel: agentLabel(r.agentId),
    status: r.status,
    requestedBy: r.requestedBy?.name ?? r.requestedBy?.email ?? null,
    lead: r.lead ? { id: r.lead.id, name: leadName(r.lead) } : null,
    costEur: microsToEur(r.costMicros),
    capEur: microsToEur(r.capMicros),
    steps: r.stepCount,
    error: r.error,
    createdAt: r.createdAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    canCancel: (ACTIVE_RUN_STATUSES as readonly string[]).includes(r.status) && (r.requestedById === actor.id || isManager(actor)),
  }))
}

export interface StepView {
  index: number
  type: string
  name: string
  model: string | null
  inputTokens: number
  outputTokens: number
  costEur: number
  durationMs: number
  input: unknown
  output: unknown
  createdAt: string
}

export interface RunDetail extends Omit<RunView, "steps"> {
  input: unknown
  output: unknown
  steps: StepView[]
}

/** One run with its steps, for the person who asked for it, a manager or the owner. */
export async function getRunDetail(actor: CurrentUser, runId: string): Promise<RunDetail> {
  if (!can(actor.role, "ai:read")) throw new LeadError("forbidden", "Accès refusé", 403)
  const r = await prisma.agentRun.findFirst({
    where: { id: runId, workspaceId: actor.workspaceId, ...(isManager(actor) ? {} : { requestedById: actor.id }) },
    include: {
      requestedBy: { select: { name: true, email: true } },
      lead: { select: { id: true, company: { select: { name: true } }, contact: { select: { name: true, email: true } } } },
      steps: { orderBy: { index: "asc" }, take: 100 },
    },
  })
  if (!r) throw new LeadError("not_found", "Exécution introuvable", 404)
  return {
    id: r.id,
    agentId: r.agentId,
    agentLabel: agentLabel(r.agentId),
    status: r.status,
    requestedBy: r.requestedBy?.name ?? r.requestedBy?.email ?? null,
    lead: r.lead ? { id: r.lead.id, name: leadName(r.lead) } : null,
    costEur: microsToEur(r.costMicros),
    capEur: microsToEur(r.capMicros),
    steps: r.steps.map((s) => ({
      index: s.index,
      type: s.type,
      name: s.name,
      model: s.model,
      inputTokens: s.inputTokens,
      outputTokens: s.outputTokens,
      costEur: microsToEur(s.costMicros),
      durationMs: s.durationMs,
      input: s.input,
      output: s.output,
      createdAt: s.createdAt.toISOString(),
    })),
    error: r.error,
    createdAt: r.createdAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    canCancel: (ACTIVE_RUN_STATUSES as readonly string[]).includes(r.status) && (r.requestedById === actor.id || isManager(actor)),
    input: r.input,
    output: r.output,
  }
}
