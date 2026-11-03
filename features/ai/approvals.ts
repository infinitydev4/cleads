import type { AgentApprovalStatus, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { PERMISSIONS, can, type Permission } from "@/lib/rbac"
import { LeadError } from "@/features/leads/errors"
import { ACTIVE_RUN_STATUSES } from "@/lib/ai/budget"
import { agentLabel } from "./agents"
import { isManager, recordStep, type RunContext } from "./runs"
import { wakeMissionOfRun } from "@/features/missions/wake"
import { clientOfInput } from "@/features/mcp/names"

/**
 * Human approval (D18, docs/crm-v1/AGENTS-IA.md §10). A tool call that leaves the CRM (an email, a search, a link sent
 * to a prospect) waits here and its run pauses. Approving puts the run back in the queue so the worker executes the
 * call exactly as shown (E18); refusing ends the run once nothing else waits.
 */
export const APPROVAL_TTL_HOURS = 72

const isPermission = (value: string): value is Permission => (PERMISSIONS as string[]).includes(value)

export async function requestApproval(
  ctx: RunContext,
  input: { tool: string; permission: Permission | null; payload: Prisma.InputJsonValue; summary: string; ttlHours?: number }
): Promise<string> {
  const expiresAt = new Date(Date.now() + (input.ttlHours ?? APPROVAL_TTL_HOURS) * 3600_000)
  const id = await prisma.$transaction(async (tx) => {
    const approval = await tx.agentApproval.create({
      data: {
        workspaceId: ctx.workspaceId,
        runId: ctx.id,
        tool: input.tool,
        permission: input.permission,
        payload: input.payload,
        summary: input.summary.trim().slice(0, 500),
        requestedById: ctx.requester?.id ?? null,
        expiresAt,
      },
      select: { id: true },
    })
    await tx.agentRun.updateMany({ where: { id: ctx.id, status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "WAITING_APPROVAL" } })
    return approval.id
  })
  await recordStep(ctx, { type: "APPROVAL", name: input.tool, input: { approvalId: id, summary: input.summary } })
  return id
}

export interface ApprovalView {
  id: string
  runId: string
  agentLabel: string
  tool: string
  summary: string
  status: AgentApprovalStatus
  requestedBy: string | null
  lead: { id: string; name: string } | null
  createdAt: string
  expiresAt: string
  decidedBy: string | null
  decidedAt: string | null
  note: string | null
  canDecide: boolean
}

const include = {
  requestedBy: { select: { name: true, email: true } },
  decidedBy: { select: { name: true, email: true } },
  run: { select: { agentId: true, input: true, lead: { select: { id: true, company: { select: { name: true } }, contact: { select: { name: true, email: true } } } } } },
} satisfies Prisma.AgentApprovalInclude

type Row = Prisma.AgentApprovalGetPayload<{ include: typeof include }>
const who = (u: { name: string | null; email: string | null } | null) => u?.name ?? u?.email ?? null

function toView(a: Row, actor: CurrentUser): ApprovalView {
  const lead = a.run.lead
  // E29: an MCP client's action names the client that asked for it.
  const client = clientOfInput(a.run.input)
  return {
    id: a.id,
    runId: a.runId,
    agentLabel: client ? `${client} (MCP)` : agentLabel(a.run.agentId),
    tool: a.tool,
    summary: a.summary,
    status: a.status,
    requestedBy: who(a.requestedBy),
    lead: lead ? { id: lead.id, name: lead.company?.name ?? lead.contact?.name ?? lead.contact?.email ?? "Fiche" } : null,
    createdAt: a.createdAt.toISOString(),
    expiresAt: a.expiresAt.toISOString(),
    decidedBy: who(a.decidedBy),
    decidedAt: a.decidedAt?.toISOString() ?? null,
    note: a.note,
    canDecide: a.status === "PENDING" && a.expiresAt > new Date() && (a.requestedById === actor.id || isManager(actor)),
  }
}

/** Approvals visible to the person: all of the workspace for owners and managers, their own for the others. */
export async function listApprovals(actor: CurrentUser, opts: { status?: AgentApprovalStatus; limit?: number } = {}): Promise<ApprovalView[]> {
  if (!can(actor.role, "ai:read")) throw new LeadError("forbidden", "Accès refusé", 403)
  const rows = await prisma.agentApproval.findMany({
    where: { workspaceId: actor.workspaceId, status: opts.status ?? "PENDING", ...(isManager(actor) ? {} : { requestedById: actor.id }) },
    include,
    orderBy: { createdAt: "desc" },
    take: Math.min(opts.limit ?? 20, 100),
  })
  return rows.map((r) => toView(r, actor))
}

/**
 * Approves or refuses a waiting call. Who may decide: the person the run acts for, a manager or the owner; to approve,
 * that person must also hold the right the call needs (they could have done it themselves).
 */
export async function decideApproval(actor: CurrentUser, approvalId: string, decision: { approve: boolean; note?: string | null }): Promise<ApprovalView> {
  const a = await prisma.agentApproval.findFirst({
    where: { id: approvalId, workspaceId: actor.workspaceId },
    select: { id: true, runId: true, tool: true, permission: true, status: true, requestedById: true, expiresAt: true, run: { select: { input: true } } },
  })
  if (!a) throw new LeadError("not_found", "Demande introuvable", 404)
  if (a.status !== "PENDING") throw new LeadError("conflict", "Cette demande a déjà été traitée.", 409)
  const now = new Date()
  if (a.expiresAt <= now) {
    await expireApprovals(now)
    throw new LeadError("conflict", "Cette demande a expiré : relancez l'action si elle est toujours utile.", 409)
  }
  if (a.requestedById !== actor.id && !isManager(actor)) {
    throw new LeadError("forbidden", "Seule la personne qui a lancé l'action, un manager ou le propriétaire peut la valider.", 403)
  }
  if (decision.approve) {
    const needed = a.permission && isPermission(a.permission) ? a.permission : null
    if (!can(actor.role, "ai:use") || (a.permission && !needed) || (needed && !can(actor.role, needed))) {
      throw new LeadError("forbidden", "Vous n'avez pas vous-même le droit de faire cette action : demandez à quelqu'un qui l'a.", 403)
    }
  }
  const note = decision.note?.trim().slice(0, 500) || null
  await prisma.$transaction(async (tx) => {
    const done = await tx.agentApproval.updateMany({
      where: { id: a.id, status: "PENDING" },
      data: { status: decision.approve ? "APPROVED" : "REJECTED", decidedById: actor.id, decidedAt: now, note },
    })
    if (done.count !== 1) throw new LeadError("conflict", "Cette demande a déjà été traitée.", 409)
    const pending = await tx.agentApproval.count({ where: { runId: a.runId, status: "PENDING" } })
    if (pending > 0) return
    if (decision.approve) {
      // Back in the queue ahead of new work; the wait for a person does not count as a failed try.
      await tx.agentRun.updateMany({ where: { id: a.runId, status: "WAITING_APPROVAL" }, data: { status: "QUEUED", attempts: 0, priority: 1, notBefore: null, lockedBy: null, heartbeatAt: null } })
    } else {
      await tx.agentRun.updateMany({
        where: { id: a.runId, status: { in: [...ACTIVE_RUN_STATUSES] } },
        data: { status: "CANCELLED", finishedAt: now, reservedMicros: 0, error: note ? `Action refusée : ${note}` : "Action refusée" },
      })
    }
  })
  // A mission waiting on this click looks again (E28): a refusal ends its step at once.
  await wakeMissionOfRun(a.runId)
  await audit({
    action: decision.approve ? "ai.approval_approved" : "ai.approval_rejected",
    actorId: actor.id,
    workspaceId: actor.workspaceId,
    entityType: "AgentApproval",
    entityId: a.id,
    metadata: { runId: a.runId, tool: a.tool },
  })
  // E29 (D37): no worker takes an MCP client's action; once approved, it runs here, exactly as shown. Loaded on demand:
  // the server's code stays out of every other approval.
  if (decision.approve && clientOfInput(a.run.input)) await (await import("@/features/mcp/approvals")).runApprovedMcpAction(a.runId)
  return toView(await prisma.agentApproval.findUniqueOrThrow({ where: { id: a.id }, include }), actor)
}

/** Marks overdue approvals as expired and ends the runs that waited only for them. Returns how many expired. */
export async function expireApprovals(now = new Date(), db: Prisma.TransactionClient | typeof prisma = prisma): Promise<number> {
  const overdue = await db.agentApproval.findMany({ where: { status: "PENDING", expiresAt: { lte: now } }, select: { id: true, runId: true } })
  if (!overdue.length) return 0
  await db.agentApproval.updateMany({ where: { id: { in: overdue.map((o) => o.id) }, status: "PENDING" }, data: { status: "EXPIRED", decidedAt: now } })
  for (const runId of new Set(overdue.map((o) => o.runId))) {
    const pending = await db.agentApproval.count({ where: { runId, status: "PENDING" } })
    if (pending === 0) {
      await db.agentRun.updateMany({
        where: { id: runId, status: "WAITING_APPROVAL" },
        data: { status: "EXPIRED", finishedAt: now, reservedMicros: 0, error: "Validation non donnée à temps" },
      })
    }
  }
  return overdue.length
}
