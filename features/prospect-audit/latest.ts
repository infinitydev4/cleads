import { prisma } from "@/lib/prisma"
import { potentialOf } from "./labels"
import { hostOf } from "./net"
import { AREAS, type Scores } from "./schemas"

/**
 * Which audit a fiche shows (E20): its own latest, or a fresh one made for another fiche of the same domain. Kept apart
 * from the service so that the fiche itself (features/leads/service.ts) can read the audit's line for its score.
 */
export const domainOf = (company: { domain: string | null; website: string | null } | null) => company?.domain ?? hostOf(company?.website)

/** The fiche's own latest audit, or a fresh one made for another fiche of the same domain, whichever is newer. */
export async function latestFor(workspaceId: string, lead: { id: string; company: { domain: string | null; website: string | null } | null }, now = new Date()) {
  const domain = domainOf(lead.company)
  return prisma.prospectAudit.findFirst({
    where: { workspaceId, OR: [{ leadId: lead.id }, ...(domain ? [{ domain, validUntil: { gt: now } }] : [])] },
    orderBy: { createdAt: "desc" },
    include: { captures: { select: { kind: true } } },
  })
}

/** The line the fiche's score shows for the audit: its rules do not change, the audit only adds its reading. */
export async function leadAiReason(workspaceId: string, lead: { id: string; company: { domain: string | null; website: string | null } | null }): Promise<{ label: string; confidence: number; createdAt: string } | null> {
  const row = await latestFor(workspaceId, lead)
  if (!row) return null
  const potential = potentialOf(row.score)
  if (!potential) return null
  const scores = (row.scores ?? {}) as Partial<Scores>
  const measured = AREAS.filter((a) => typeof scores[a] === "number").length
  return { label: `Audit IA : ${potential.label.toLowerCase()} (${row.score}/100)`, confidence: Math.round((measured / AREAS.length) * 100) / 100, createdAt: row.createdAt.toISOString() }
}
