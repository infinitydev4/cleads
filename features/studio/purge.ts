import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

/**
 * Housekeeping of the Studio Web (E23), in the worker's maintenance: PageSpeed tokens past their quarter of an hour are
 * forgotten, and sites past their date lose their content (pages, renders, images, brief). The record stays, with its
 * visits and cost, so the fiche's history still says a mock-up was made. A deleted fiche takes its sites with it.
 */
const BATCH = 20

export async function purgeStudio(now = new Date()): Promise<{ purged: number; probes: number }> {
  const probes = await prisma.generatedSiteVersion.updateMany({ where: { probeExpiresAt: { lt: now } }, data: { probeHash: null, probeExpiresAt: null } })
  const due = await prisma.generatedSite.findMany({ where: { purgeAfter: { lt: now }, status: { not: "PURGED" } }, select: { id: true, lastRunId: true }, take: BATCH })
  let purged = 0
  for (const site of due) {
    // A site the Designer is working on waits for the next pass.
    if (site.lastRunId && (await prisma.agentRun.count({ where: { id: site.lastRunId, status: { in: ["QUEUED", "RUNNING", "WAITING_APPROVAL"] } } }))) continue
    await prisma.$transaction([
      prisma.generatedSiteAsset.deleteMany({ where: { siteId: site.id } }),
      prisma.generatedSiteVersion.updateMany({ where: { siteId: site.id }, data: { html: null, desktop: null, mobile: null, thumb: null, probeHash: null, probeExpiresAt: null } }),
      prisma.generatedSite.update({ where: { id: site.id }, data: { status: "PURGED", purgedAt: now, brief: Prisma.DbNull, collected: Prisma.DbNull, linkNonce: null, tokenHash: null, linkExpiresAt: null } }),
    ])
    purged++
  }
  return { purged, probes: probes.count }
}
