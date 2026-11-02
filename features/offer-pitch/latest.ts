import { prisma } from "@/lib/prisma"

/**
 * The fiche's latest pitch in a few numbers, for its tab of suggested offers (E21). Kept apart from the service so that
 * the fiche itself (features/leads/service.ts) can read it without an import cycle.
 */
export async function latestPitchSummary(workspaceId: string, leadId: string): Promise<{ offers: number; createdAt: string } | null> {
  const row = await prisma.offerPitch.findFirst({ where: { workspaceId, leadId }, orderBy: { createdAt: "desc" }, select: { createdAt: true, _count: { select: { recommendations: true } } } })
  return row ? { offers: row._count.recommendations, createdAt: row.createdAt.toISOString() } : null
}
