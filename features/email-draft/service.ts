import type { EmailDraft } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import type { CurrentUser } from "@/lib/auth/guard"
import { can, canAccessRecord } from "@/lib/rbac"
import { LeadError } from "@/features/leads/errors"
import { isManager, startRun } from "@/features/ai/runs"
import { visibleReply } from "@/features/outreach/replies"
import { latestFor } from "@/features/prospect-audit/latest"
import { visibleLead } from "@/features/prospect-audit/service"
import { evidenceSchema } from "@/features/prospect-audit/schemas"
import { NO_AUDIT_FOR_DRAFT, type DraftState, type DraftView } from "./labels"
import type { StepDraftRequest } from "./schemas"

/**
 * Asking the Rédacteur outreach for a draft (E22), and following it. The work happens in the worker; the person polls
 * the run and gets the draft in the composer, where nothing leaves without being read.
 */
const factSchema = z.object({ text: z.string(), evidence: z.array(evidenceSchema) })

export function toDraftView(d: EmailDraft): DraftView {
  return {
    id: d.id,
    kind: d.kind,
    subject: d.subject,
    body: d.body,
    facts: Array.isArray(d.facts) ? d.facts.flatMap((f) => (factSchema.safeParse(f).success ? [f as DraftView["facts"][number]] : [])) : [],
    notes: d.notes,
    model: d.model,
    costEur: d.costMicros / 1_000_000,
    createdAt: d.createdAt.toISOString(),
  }
}

function mayWrite(actor: CurrentUser) {
  if (!can(actor.role, "ai:use")) throw new LeadError("forbidden", "Votre rôle ne permet pas de lancer l’IA.", 403)
  if (!can(actor.role, "email:send")) throw new LeadError("forbidden", "Votre rôle ne permet pas d’écrire aux prospects.", 403)
}

/** A first email for a fiche, from its latest audit (and its pitch, when there is one). */
export async function requestFirstDraft(actor: CurrentUser, leadId: string): Promise<{ runId: string }> {
  mayWrite(actor)
  const lead = await visibleLead(actor, leadId)
  if (!canAccessRecord(actor, "lead:write", lead.ownerId)) throw new LeadError("forbidden", "Cette fiche ne vous est pas attribuée : l’IA ne peut pas y travailler pour vous.", 403)
  const audit = await latestFor(actor.workspaceId, lead)
  if (!audit) throw new LeadError("conflict", NO_AUDIT_FOR_DRAFT, 409)
  const run = await startRun(actor, { agentId: "writer", leadId: lead.id, status: "QUEUED", priority: 1, input: { kind: "first_email", auditId: audit.id } })
  return { runId: run.id }
}

/** An answer to a reply received, proposing a 15-minute call with the booking link when there is one. */
export async function requestReplyDraft(actor: CurrentUser, replyId: string): Promise<{ runId: string }> {
  mayWrite(actor)
  const reply = await visibleReply(actor, replyId)
  if (!reply.leadId) throw new LeadError("conflict", "Cette réponse n’est liée à aucune fiche.", 409)
  if (reply.replyClass === "STOP") throw new LeadError("conflict", "Cette personne a demandé à ne plus être contactée.", 409)
  const run = await startRun(actor, { agentId: "writer", leadId: reply.leadId, status: "QUEUED", priority: 1, input: { kind: "reply", replyId: reply.id } })
  return { runId: run.id }
}

/** A sequence step: a template with variables, for every fiche the sequence will reach. */
export async function requestStepDraft(actor: CurrentUser, input: StepDraftRequest): Promise<{ runId: string }> {
  if (!can(actor.role, "ai:use")) throw new LeadError("forbidden", "Votre rôle ne permet pas de lancer l’IA.", 403)
  if (!can(actor.role, "sequence:manage")) throw new LeadError("forbidden", "Votre rôle ne permet pas de modifier les séquences.", 403)
  const run = await startRun(actor, { agentId: "writer", status: "QUEUED", priority: 1, input: { kind: "sequence_step", ...input } })
  return { runId: run.id }
}

/** Where a draft stands, for the person who asked for it (or a manager). */
export async function draftState(actor: CurrentUser, runId: string): Promise<DraftState> {
  if (!can(actor.role, "ai:use")) throw new LeadError("forbidden", "Accès refusé", 403)
  const run = await prisma.agentRun.findFirst({
    where: { id: runId, workspaceId: actor.workspaceId, agentId: "writer", ...(isManager(actor) ? {} : { requestedById: actor.id }) },
    select: { id: true, status: true, error: true, draft: true },
  })
  if (!run) throw new LeadError("not_found", "Brouillon introuvable", 404)
  return { runId: run.id, status: run.status, error: run.error, draft: run.draft ? toDraftView(run.draft) : null }
}
