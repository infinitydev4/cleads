import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { campaignStatus } from "@/lib/crm/status"
import { LeadError } from "@/features/leads/errors"
import { campaignCohorts, cohortOf, topSectors, type CohortCounts } from "@/features/metrics/service"
import { defineTool, type ToolContext } from "@/features/ai/tools"

/**
 * campaign_metrics (E25): what the agency's campaigns and sectors gave, read by the Stratège. The same definitions as
 * the Campaigns page, over the fiches the person who asked may see.
 */
const pct = (r: number | null) => (r == null ? null : Math.round(r * 1_000) / 10)
const results = (c: CohortCounts) => ({ leads: c.leads, contacted: c.contacted, replied: c.replied, qualified: c.qualified, meetings: c.meetings, won: c.won, replyRatePct: pct(c.replyRate), conversionPct: pct(c.conversion) })

function personOf(ctx: ToolContext) {
  const user = ctx.run.requester
  if (!user) throw new LeadError("forbidden", "Le Stratège travaille toujours pour une personne.", 403)
  return user
}

export const campaignMetricsTool = defineTool({
  name: "campaign_metrics",
  description:
    "Résultats des campagnes de l'agence (fiches, contactées, réponses, qualifiées, rendez-vous, gagnées, taux) et des secteurs d'où viennent ses fiches, sur toute leur vie. À lire avant de proposer une cible : ce qui a marché, ce qui n'a rien donné, ce qui n'a pas encore été essayé.",
  permission: "campaign:read",
  approval: "auto",
  costClass: "free",
  input: z.object({ includeArchived: z.boolean().optional().describe("Inclure les campagnes archivées (leurs résultats restent instructifs)") }),
  execute: async (ctx, input) => {
    const user = personOf(ctx)
    const campaigns = await prisma.campaign.findMany({
      where: { workspaceId: user.workspaceId, ...(input.includeArchived ? {} : { archivedAt: null }) },
      select: { id: true, name: true, status: true, sector: true, area: true, archivedAt: true, offer: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 15,
    })
    const [cohorts, sectors] = await Promise.all([campaignCohorts(user, campaigns.map((c) => c.id)), topSectors(user, 8)])
    const bySector = await Promise.all(sectors.map(async (s) => ({ sector: s.sector, results: results(await cohortOf(user, { company: { is: { sector: s.sector } } })) })))
    return {
      campaigns: campaigns.map((c) => ({
        name: c.name,
        status: c.archivedAt ? "Archivée" : campaignStatus[c.status].label,
        sector: c.sector,
        area: c.area,
        offer: c.offer?.name ?? null,
        results: results(cohorts.get(c.id) ?? { leads: 0, contacted: 0, replied: 0, qualified: 0, meetings: 0, won: 0, replyRate: null, conversion: null }),
      })),
      sectors: bySector,
      definitions:
        "contacted : au moins un email envoyé (hors test) ou un appel ; replied : une réponse humaine par email ; qualified : une opportunité ; meetings : un rendez-vous hors annulés ; won : une opportunité gagnée. Taux en pourcentage, null quand rien n'a été envoyé.",
    }
  },
})
