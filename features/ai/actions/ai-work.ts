import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { LeadError } from "@/features/leads/errors"
import { latestFor } from "@/features/prospect-audit/latest"
import { requestAudit } from "@/features/prospect-audit/service"
import { decideRecommendation, requestPitch } from "@/features/offer-pitch/service"
import { REASON_LABELS, REJECTION_REASONS } from "@/features/offer-pitch/labels"
import { requestFirstDraft, requestReplyDraft } from "@/features/email-draft/service"
import { requestBuild, requestRevision, shareLink, startStudio } from "@/features/studio/service"
import { actOnTarget, requestStrategy } from "@/features/strategy/service"
import { requestResearch } from "@/features/research/service"
import { JOB_LABELS, RESEARCH_JOBS, TYPICAL_COST } from "@/features/research/labels"
import { MAX_SEARCH_RESULTS } from "@/features/search/schemas"
import { defineTool } from "@/features/ai/tools"
import { capOf, clip, idOf, iso, leadId, personOf, plural, runCard, visibleName } from "./shared"

/**
 * Work handed to the specialists (E24, E28, family "ai_work"): it runs in the worker and shows as a live card. Each
 * call waits for a click (its own, or the plan's), with the most it can cost in the approval.
 */

export const startAuditTool = defineTool({
  name: "start_audit",
  description: "Confie à l'Auditeur un audit IA du site et de la présence en ligne de la fiche (une à trois minutes, dans le worker). Lis d'abord get_lead_audit : un audit de moins de 30 jours se relit, il ne se refait que si la personne le demande (force).",
  permission: "ai:use",
  approval: "user",
  costClass: "metered",
  family: "ai_work",
  input: z.object({ leadId, force: z.boolean().optional().describe("Refaire l'audit même s'il en existe un récent") }),
  summarize: async (input, ctx) => {
    const user = personOf(ctx)
    const name = await visibleName(user, input.leadId)
    if (!input.force) {
      const lead = await prisma.lead.findFirst({ where: { id: input.leadId, workspaceId: user.workspaceId }, select: { id: true, company: { select: { domain: true, website: true } } } })
      const fresh = lead && (await latestFor(user.workspaceId, lead))
      if (fresh && fresh.validUntil > new Date()) throw new LeadError("conflict", `Un audit du ${iso(fresh.createdAt)} couvre déjà cette fiche : lis-le avec get_lead_audit, ou demande à la personne s'il faut le refaire (force).`, 409)
    }
    return `${input.force ? "Refaire" : "Lancer"} l'audit IA de ${name} (une à trois minutes, ${await capOf(user, "auditor")} au plus).`
  },
  execute: async (ctx, input) => {
    const result = await requestAudit(personOf(ctx), input.leadId, { force: input.force })
    return result.reused ? { started: false, reused: true, leadId: input.leadId, note: "Un audit récent existait déjà : lis-le avec get_lead_audit." } : runCard("auditor", result.runId, { leadId: input.leadId })
  },
})

/** E30 lot 2: the Enquêteur's work on one fiche. */
export const startResearchTool = defineTool({
  name: "start_research",
  description:
    "Confie une recherche web à l'Enquêteur (une à deux minutes, dans le worker) : « people » cherche les décideurs (dirigeants du registre, responsable marketing ou commercial) et les comptes de réseaux sociaux ; « brief » prépare le brief d'un rendez-vous (meetingId) ou d'un premier échange ; « geo » sonde la présence de l'entreprise dans les sources des moteurs de réponse pour son métier et sa ville. Lis d'abord get_lead_research.",
  permission: "ai:use",
  approval: "user",
  costClass: "metered",
  family: "ai_work",
  input: z.object({ leadId, job: z.enum(RESEARCH_JOBS).describe("people, brief ou geo"), meetingId: idOf("du rendez-vous que le brief prépare, s'il y en a un (list_meetings)").optional() }),
  summarize: async (input, ctx) => {
    const name = await visibleName(personOf(ctx), input.leadId)
    const what = { people: `chercher les décideurs et les réseaux sociaux de ${name}`, brief: `préparer le brief${input.meetingId ? " du rendez-vous" : ""} de ${name}`, geo: `sonder la présence de ${name} dans les moteurs de réponse` }[input.job]
    return `Demander à l'Enquêteur de ${what} (${TYPICAL_COST[input.job]}, recherches web comprises).`
  },
  execute: async (ctx, input) => {
    const { runId } = await requestResearch(personOf(ctx), input.leadId, input.job, { meetingId: input.meetingId })
    return runCard("researcher", runId, { leadId: input.leadId, job: JOB_LABELS[input.job] })
  },
})

export const suggestOffersTool = defineTool({
  name: "suggest_offers",
  description: "Confie au Conseiller offres le choix des offres du catalogue pour la fiche, à partir de son audit (une minute environ, dans le worker) : offres classées, script d'appel, objections, angle d'email.",
  permission: "ai:use",
  approval: "user",
  costClass: "metered",
  family: "ai_work",
  input: z.object({ leadId }),
  summarize: async (input, ctx) => {
    const user = personOf(ctx)
    return `Demander au Conseiller les offres à proposer à ${await visibleName(user, input.leadId)} (${await capOf(user, "offers")} au plus).`
  },
  execute: async (ctx, input) => runCard("offers", (await requestPitch(personOf(ctx), input.leadId)).runId, { leadId: input.leadId }),
})

export const decideOfferTool = defineTool({
  name: "decide_offer",
  description: "Retient (ACCEPTED) ou écarte (REJECTED, avec une raison) une offre suggérée à une fiche (recommendationId lu avec get_lead_offers), ou la remet en suggestion (SUGGESTED).",
  permission: "ai:use",
  approval: "user",
  costClass: "free",
  family: "ai_work",
  input: z.object({ leadId, recommendationId: idOf("de l'offre suggérée (recommendationId)"), status: z.enum(["ACCEPTED", "REJECTED", "SUGGESTED"]), reason: z.enum(REJECTION_REASONS).optional(), note: z.string().trim().max(300).optional() }),
  summarize: async (input, ctx) => {
    const user = personOf(ctx)
    const name = await visibleName(user, input.leadId)
    const rec = await prisma.offerRecommendation.findFirst({ where: { id: input.recommendationId, workspaceId: user.workspaceId }, select: { offer: { select: { name: true } } } })
    if (!rec) throw new LeadError("not_found", "Offre suggérée introuvable : retrouve son recommendationId avec get_lead_offers.", 404)
    const verb = input.status === "ACCEPTED" ? "Retenir" : input.status === "REJECTED" ? "Écarter" : "Remettre en suggestion"
    return `${verb} l'offre « ${rec.offer?.name ?? "suggérée"} » pour ${name}${input.status === "REJECTED" && input.reason ? ` (${REASON_LABELS[input.reason]})` : ""}.`
  },
  execute: async (ctx, input) => {
    const r = await decideRecommendation(personOf(ctx), input.leadId, input.recommendationId, input.status === "REJECTED" ? { status: "REJECTED", reason: input.reason, note: input.note } : { status: input.status })
    return { done: true, leadId: input.leadId, offer: r.offer.name, status: r.status }
  },
})

export const draftEmailTool = defineTool({
  name: "draft_email",
  description: "Confie au Rédacteur un premier email pour la fiche, tiré de son audit (quelques secondes, dans le worker). Le brouillon s'ouvre ensuite dans la fenêtre d'email de la fiche : la personne le relit, choisit sa boîte et l'envoie elle-même.",
  permission: "email:send",
  approval: "user",
  costClass: "metered",
  family: "ai_work",
  input: z.object({ leadId }),
  summarize: async (input, ctx) => {
    const user = personOf(ctx)
    return `Demander au Rédacteur un premier email pour ${await visibleName(user, input.leadId)}, à relire avant tout envoi (${await capOf(user, "writer")} au plus).`
  },
  execute: async (ctx, input) => {
    const { runId } = await requestFirstDraft(personOf(ctx), input.leadId)
    return runCard("writer", runId, { leadId: input.leadId, open: `/app/leads/${input.leadId}?brouillon=${runId}` })
  },
})

export const draftReplyTool = defineTool({
  name: "draft_reply",
  description: "Confie au Rédacteur la réponse à l'email d'un prospect (replyId lu avec list_replies). La personne la relit et l'envoie elle-même depuis la boîte de réception.",
  permission: "email:send",
  approval: "user",
  costClass: "metered",
  family: "ai_work",
  input: z.object({ replyId: idOf("de la réponse (replyId)") }),
  summarize: async (input, ctx) => {
    const user = personOf(ctx)
    const m = await prisma.emailMessage.findFirst({ where: { id: input.replyId, workspaceId: user.workspaceId }, select: { subject: true, leadId: true } })
    if (!m) throw new LeadError("not_found", "Réponse introuvable : retrouve son replyId avec list_replies.", 404)
    const who = m.leadId ? await visibleName(user, m.leadId) : "ce prospect"
    return `Demander au Rédacteur une réponse à ${who} (« ${clip(m.subject, 80)} »), à relire avant tout envoi (${await capOf(user, "writer")} au plus).`
  },
  execute: async (ctx, input) => runCard("writer", (await requestReplyDraft(personOf(ctx), input.replyId)).runId, { open: "/app/mailbox" }),
})

export const startStudioTool = defineTool({
  name: "start_studio",
  description: "Confie au Designer une landing de démonstration pour la fiche, construite à partir de son site (Studio Web) : il écrit d'abord un brief à relire, puis la page est générée (studio_build).",
  permission: "studio:generate",
  approval: "user",
  costClass: "metered",
  family: "ai_work",
  input: z.object({ leadId }),
  summarize: async (input, ctx) => {
    const user = personOf(ctx)
    return `Ouvrir une maquette du Studio Web pour ${await visibleName(user, input.leadId)} : le Designer écrit d'abord le brief (${await capOf(user, "designer")} au plus par étape).`
  },
  execute: async (ctx, input) => {
    const { siteId, runId } = await startStudio(personOf(ctx), input.leadId)
    return runCard("designer", runId, { leadId: input.leadId, siteId, open: `/app/studio/${siteId}` })
  },
})

async function siteName(ctx: Parameters<typeof personOf>[0], siteId: string): Promise<string> {
  const user = personOf(ctx)
  const site = await prisma.generatedSite.findFirst({ where: { id: siteId, workspaceId: user.workspaceId }, select: { leadId: true } })
  if (!site?.leadId) throw new LeadError("not_found", "Maquette introuvable : retrouve son siteId avec get_lead.", 404)
  return visibleName(user, site.leadId)
}

export const studioBuildTool = defineTool({
  name: "studio_build",
  description: "Fait générer la page d'une maquette (siteId lu avec get_lead) une fois son brief relu : plusieurs minutes, dans le worker.",
  permission: "studio:generate",
  approval: "user",
  costClass: "metered",
  family: "ai_work",
  input: z.object({ siteId: idOf("de la maquette (siteId)") }),
  summarize: async (input, ctx) => `Générer la maquette de ${await siteName(ctx, input.siteId)} à partir de son brief (${await capOf(personOf(ctx), "designer")} au plus).`,
  execute: async (ctx, input) => runCard("designer", (await requestBuild(personOf(ctx), input.siteId)).runId, { siteId: input.siteId, open: `/app/studio/${input.siteId}` }),
})

export const studioReviseTool = defineTool({
  name: "studio_revise",
  description: "Demande une retouche d'une maquette (siteId), décrite en une instruction claire (ex. « mets les avis clients avant les services »).",
  permission: "studio:generate",
  approval: "user",
  costClass: "metered",
  family: "ai_work",
  input: z.object({ siteId: idOf("de la maquette (siteId)"), instruction: z.string().trim().min(5).max(1_000) }),
  summarize: async (input, ctx) => `Retoucher la maquette de ${await siteName(ctx, input.siteId)} : « ${clip(input.instruction, 200)} » (${await capOf(personOf(ctx), "designer")} au plus).`,
  execute: async (ctx, input) => runCard("designer", (await requestRevision(personOf(ctx), input.siteId, input.instruction)).runId, { siteId: input.siteId, open: `/app/studio/${input.siteId}` }),
})

export const shareStudioLinkTool = defineTool({
  name: "share_studio_link",
  description: "Crée le lien public d'une maquette (siteId), à envoyer au prospect : quiconque a le lien peut la voir jusqu'à son expiration, et ses visites sont suivies.",
  permission: "studio:generate",
  approval: "user",
  costClass: "external",
  family: "ai_work",
  input: z.object({ siteId: idOf("de la maquette (siteId)") }),
  summarize: async (input, ctx) => `Créer le lien public de la maquette de ${await siteName(ctx, input.siteId)} : toute personne qui l'a pourra la voir jusqu'à son expiration.`,
  execute: async (ctx, input) => {
    const link = await shareLink(personOf(ctx), input.siteId, "create")
    return { done: true, siteId: input.siteId, url: link.url, expiresAt: iso(link.expiresAt), open: `/app/studio/${input.siteId}` }
  },
})

export const proposeTargetsTool = defineTool({
  name: "propose_targets",
  description:
    "Confie au Stratège le choix des cibles : 2 à 4 secteurs à prospecter, avec la zone, l'offre phare, l'angle et la recherche conseillée, à partir des résultats des campagnes, des offres actives et de l'Extractor (une à deux minutes, dans le worker). Ses cibles se lisent ensuite avec get_strategy.",
  permission: "campaign:manage",
  approval: "user",
  costClass: "metered",
  family: "ai_work",
  input: z.object({ zone: z.string().trim().max(120).optional().describe("Zone visée, ex. Nantes"), focus: z.string().trim().max(400).optional().describe("Précisions : métiers, taille, ce que la personne cherche"), offerSlug: z.string().trim().max(80).optional().describe("Une offre active à pousser") }),
  summarize: async (input, ctx) => `Demander au Stratège des cibles${input.zone ? ` à ${input.zone}` : ""}${input.focus ? ` (${clip(input.focus, 120)})` : ""} (${await capOf(personOf(ctx), "strategist")} au plus).`,
  execute: async (ctx, input) => {
    const { runId, proposalId } = await requestStrategy(personOf(ctx), { zone: input.zone, focus: input.focus, offerSlug: input.offerSlug })
    return runCard("strategist", runId, { proposalId, open: "/app/campaigns" })
  },
})

async function targetOf(workspaceId: string, id: string) {
  const t = await prisma.strategyTarget.findFirst({ where: { id, proposal: { workspaceId } }, select: { sector: true, campaignName: true, activity: true, location: true, maxResults: true } })
  if (!t) throw new LeadError("not_found", "Cible introuvable : retrouve son targetId avec get_strategy.", 404)
  return t
}

export const actOnTargetTool = defineTool({
  name: "act_on_target",
  description:
    "Donne suite à une cible du Stratège (targetId lu avec get_strategy) : « campaign » crée sa campagne en brouillon, « search » crée la campagne si besoin et lance la recherche (activité, lieu, nombre de résultats), « dismiss » l'écarte.",
  permission: "campaign:manage",
  approval: "user",
  costClass: "free",
  family: "prospecting",
  input: z.object({
    targetId: idOf("de la cible (targetId)"),
    action: z.enum(["campaign", "search", "dismiss"]),
    activity: z.string().trim().min(2).max(100).optional(),
    location: z.string().trim().min(2).max(120).optional(),
    maxResults: z.number().int().min(10).max(MAX_SEARCH_RESULTS).optional(),
  }),
  summarize: async (input, ctx) => {
    const t = await targetOf(personOf(ctx).workspaceId, input.targetId)
    if (input.action === "dismiss") return `Écarter la cible « ${t.sector} ».`
    if (input.action === "campaign") return `Créer la campagne « ${t.campaignName} » (cible « ${t.sector} »), en brouillon.`
    return `Lancer pour la cible « ${t.sector} » la recherche « ${input.activity ?? t.activity} — ${input.location ?? t.location} » (${plural(input.maxResults ?? t.maxResults, "entreprise", "entreprises")} au plus), dans la campagne « ${t.campaignName} ».`
  },
  execute: async (ctx, input) => {
    const user = personOf(ctx)
    if (input.action !== "search") {
      const status = await actOnTarget(user, input.targetId, { action: input.action })
      const t = input.action === "campaign" ? await prisma.strategyTarget.findUnique({ where: { id: input.targetId }, select: { campaignId: true } }) : null
      return { done: true, targetId: input.targetId, status, campaignId: t?.campaignId ?? null }
    }
    const t = await targetOf(user.workspaceId, input.targetId)
    const search = { activity: input.activity ?? t.activity, location: input.location ?? t.location, maxResults: input.maxResults ?? t.maxResults }
    const status = await actOnTarget(user, input.targetId, { action: "search", search })
    // What a mission's next steps cite: the target's campaign and search (E28).
    const launched = await prisma.strategyTarget.findUnique({ where: { id: input.targetId }, select: { campaignId: true, searchId: true } })
    return { done: true, targetId: input.targetId, status, campaignId: launched?.campaignId ?? null, searchId: launched?.searchId ?? null, open: launched?.searchId ? `/app/search/${launched.searchId}` : undefined }
  },
})

export const AI_ACTIONS = [startAuditTool, startResearchTool, suggestOffersTool, decideOfferTool, draftEmailTool, draftReplyTool, startStudioTool, studioBuildTool, studioReviseTool, shareStudioLinkTool, proposeTargetsTool, actOnTargetTool] as const
