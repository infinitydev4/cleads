import { z } from "zod"
import { prisma } from "@/lib/prisma"
import type { HandlerContext } from "@/features/ai/handlers"
import { LeadError } from "@/features/leads/errors"
import { notify } from "@/features/signals/store"
import { runBrief } from "./brief"
import { runGeo } from "./geo"
import { PEOPLE_BATCH, runPeople } from "./people"
import { RESEARCH_JOBS, type ResearchJob } from "./labels"
import type { ResearchDeps } from "./search"

/**
 * The Enquêteur in the worker (E30 lot 2): three coded jobs, chosen by the run's input `job`. Each one decides its
 * searches itself, reads their results with a model, and keeps only what the results really say.
 * - people: decision makers and social accounts of one fiche, or of up to ten fiches of a campaign;
 * - brief: the brief of a meeting, or of a fiche on demand;
 * - geo: the GEO probe of a fiche.
 */
const peopleInput = z.object({ job: z.literal("people"), leadIds: z.array(z.string().max(40)).min(1).max(PEOPLE_BATCH), force: z.boolean().optional(), campaignId: z.string().max(40).optional() })

export const jobOf = (input: unknown): ResearchJob | null => {
  const job = input && typeof input === "object" ? (input as Record<string, unknown>).job : null
  return typeof job === "string" && (RESEARCH_JOBS as readonly string[]).includes(job) ? (job as ResearchJob) : null
}

export async function runResearcher(job: HandlerContext, deps: ResearchDeps = {}) {
  const ctx = job.run
  switch (jobOf(job.input)) {
    case "people": {
      const input = peopleInput.safeParse(job.input)
      if (!input.success) throw new LeadError("invalid", "Liste de fiches illisible.", 400)
      const report = await runPeople(ctx, input.data.leadIds, { force: input.data.force, signal: job.signal }, deps)
      // A campaign's search runs in the background: its requester hears of it. On a fiche, the card shows the result.
      if (input.data.campaignId && ctx.requester) {
        const campaign = await prisma.campaign.findUnique({ where: { id: input.data.campaignId }, select: { name: true } })
        await notify([ctx.requester.id], {
          title: `Décideurs : ${report.people} profil${report.people > 1 ? "s" : ""} à vérifier`,
          message: `${report.searched} fiche${report.searched > 1 ? "s" : ""} cherchée${report.searched > 1 ? "s" : ""}${campaign ? ` dans « ${campaign.name} »` : ""} : ${report.probable} profil${report.probable > 1 ? "s" : ""} probable${report.probable > 1 ? "s" : ""}, ${report.accounts} compte${report.accounts > 1 ? "s" : ""} de réseau social ajouté${report.accounts > 1 ? "s" : ""}. Chaque profil attend votre confirmation sur sa fiche.`,
        })
      }
      return { output: report }
    }
    case "geo": {
      const finding = await runGeo(ctx, { signal: job.signal }, deps)
      return { output: { present: finding.present, sources: finding.sources, questions: finding.questions } }
    }
    case "brief":
      return { output: await runBrief(ctx, job.input, { signal: job.signal }, deps) }
    default:
      throw new LeadError("invalid", "Travail de l'Enquêteur inconnu.", 400)
  }
}
