import { prisma } from "@/lib/prisma"
import type { SuiteId } from "./labels"

/**
 * The cases the team labelled in the CRM (E27), the evaluation set that grows with use: replies a person filed in the
 * mailbox, fiches a person judged for their campaign. Newest first, 500 at most. Referred to as `team:<id>`.
 */
export const TEAM_PREFIX = "team:"
export const TEAM_MAX_CASES = 500

/** Replies filed by a person: the mailbox's reader files out-of-office notices alone, and those are not labels. */
export async function teamReplyIds(workspaceId: string, take = TEAM_MAX_CASES): Promise<string[]> {
  const filed = await prisma.activity.findMany({
    where: { workspaceId, kind: "EMAIL", data: { path: ["event"], equals: "reply_classified" } },
    select: { data: true },
    orderBy: { createdAt: "desc" },
    take: 5_000,
  })
  const ids = [...new Set(filed.map((a) => (a.data as Record<string, unknown> | null)?.emailId).filter((x): x is string => typeof x === "string"))]
  if (!ids.length) return []
  const rows = await prisma.emailMessage.findMany({ where: { id: { in: ids }, workspaceId, direction: "INBOUND", isTest: false, replyClass: { not: null } }, select: { id: true }, orderBy: { createdAt: "desc" }, take })
  return rows.map((r) => r.id)
}

export async function teamCaseIds(workspaceId: string, suite: SuiteId): Promise<string[]> {
  if (suite === "replies") return (await teamReplyIds(workspaceId)).map((id) => `${TEAM_PREFIX}${id}`)
  if (suite === "qualifier") {
    const rows = await prisma.leadRelevance.findMany({ where: { workspaceId, decision: { not: null } }, select: { id: true }, orderBy: { decidedAt: "desc" }, take: TEAM_MAX_CASES })
    return rows.map((r) => `${TEAM_PREFIX}${r.id}`)
  }
  return []
}
