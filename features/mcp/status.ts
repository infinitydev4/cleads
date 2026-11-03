import { prisma } from "@/lib/prisma"
import type { CurrentUser } from "@/lib/auth/guard"
import { LeadError } from "@/features/leads/errors"
import { RUN_STATUS_LABELS } from "@/features/ai/labels"
import { runStatus } from "@/features/ai/runs"
import { clientOfInput } from "./names"

/**
 * What an MCP client reads back after asking (E29): where an action waiting in « À valider » stands, and where a piece of
 * AI work it started stands. Only the member's own requests.
 */

export const appOrigin = () => new URL(process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "https://cleads.fr").origin
export const approvalsLink = () => `${appOrigin()}/app/agents?tab=approvals`

const STATES = {
  PENDING: "en attente de validation dans Cleads",
  REJECTED: "refusée : rien n'a été fait",
  EXPIRED: "expirée : rien n'a été fait",
} as const

export async function actionStatus(user: CurrentUser, approvalId: string) {
  const a = await prisma.agentApproval.findFirst({
    where: { id: approvalId, workspaceId: user.workspaceId, requestedById: user.id },
    select: { id: true, tool: true, summary: true, status: true, expiresAt: true, decidedAt: true, note: true, executionStartedAt: true, executedAt: true, result: true, decidedBy: { select: { name: true, email: true } }, run: { select: { input: true } } },
  })
  if (!a || !clientOfInput(a.run.input)) throw new LeadError("not_found", "Action introuvable : son approvalId vient de la réponse qui l'a mise en attente.", 404)
  const result = (a.result ?? null) as { output?: unknown; error?: string } | null
  const state =
    a.status === "APPROVED"
      ? a.executedAt
        ? result?.error
          ? `validée, mais en échec : ${result.error}`
          : "validée et faite"
        : a.executionStartedAt
          ? "validée, peut-être faite : vérifiez dans Cleads avant de la redemander"
          : "validée, en cours"
      : STATES[a.status]
  return {
    approvalId: a.id,
    action: a.tool,
    summary: a.summary,
    state,
    ...(a.status === "PENDING" ? { expiresAt: a.expiresAt.toISOString(), link: approvalsLink() } : {}),
    ...(a.decidedAt ? { decidedAt: a.decidedAt.toISOString(), decidedBy: a.decidedBy?.name ?? a.decidedBy?.email ?? null } : {}),
    ...(a.note ? { note: a.note } : {}),
    ...(a.executedAt && result && !result.error ? { result: result.output ?? null } : {}),
  }
}

export async function aiWorkStatus(user: CurrentUser, runId: string) {
  const r = await runStatus(user, runId)
  return {
    runId: r.id,
    agent: r.agentLabel,
    state: RUN_STATUS_LABELS[r.status].toLowerCase(),
    finished: !!r.finishedAt,
    ...(r.error ? { error: r.error } : {}),
    costEur: r.costEur,
    link: `${appOrigin()}/app/agents?tab=runs`,
  }
}
