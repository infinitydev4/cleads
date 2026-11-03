import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { LeadError } from "@/features/leads/errors"
import { createCampaign, updateCampaign } from "@/features/campaigns/service"
import { CAMPAIGN_STATUSES } from "@/features/campaigns/schemas"
import { campaignStatus } from "@/lib/crm/status"
import { cancelSearch, getSearchView, importSearch, startSearch } from "@/features/search/service"
import { DEFAULT_SEARCH_RESULTS, MAX_SEARCH_RESULTS } from "@/features/search/schemas"
import { requestRelevance } from "@/features/relevance/service"
import { defineTool } from "@/features/ai/tools"
import { capOf, clip, dayKey, idOf, personOf, plural, runCard } from "./shared"

/**
 * Campaigns and prospecting (E28, families "campaigns" and "prospecting"). A search goes through the CRM's search
 * service (D27), which records it with its campaign and in the journal; the Extractor's MCP stays read-only. All of it
 * waits for a click: the action's own, or the plan's (D28).
 */

async function activeOfferId(workspaceId: string, slug: string | undefined): Promise<{ id: string; name: string } | null> {
  if (!slug) return null
  const offer = await prisma.offer.findFirst({ where: { workspaceId, slug, status: "ACTIVE" }, select: { id: true, name: true } })
  if (!offer) throw new LeadError("not_found", `Offre « ${slug} » introuvable parmi les offres actives : lis-les avec list_offers.`, 404)
  return offer
}

const campaignFields = {
  description: z.string().trim().max(1000).optional(),
  sector: z.string().trim().max(100).optional(),
  area: z.string().trim().max(120).optional().describe("Zone, ex. Nantes et agglomération"),
  goalLeads: z.number().int().min(1).max(1_000_000).optional(),
  goalMeetings: z.number().int().min(1).max(1_000_000).optional(),
  offerSlug: z.string().trim().max(80).optional().describe("L'offre phare, par son identifiant (list_offers)"),
  startsOn: dayKey.optional(),
  endsOn: dayKey.optional(),
}

export const createCampaignTool = defineTool({
  name: "create_campaign",
  description: "Crée une campagne (brouillon par défaut) : nom, secteur, zone, objectifs, offre phare. Ses recherches et ses imports y rangeront les fiches.",
  permission: "campaign:manage",
  approval: "user",
  costClass: "free",
  family: "campaigns",
  input: z.object({ name: z.string().trim().min(2).max(80), status: z.enum(["DRAFT", "ACTIVE"]).optional(), ...campaignFields }),
  summarize: async (input, ctx) => {
    const offer = await activeOfferId(personOf(ctx).workspaceId, input.offerSlug)
    const bits = [input.sector, input.area, offer ? `offre « ${offer.name} »` : null, input.goalLeads ? `objectif ${plural(input.goalLeads, "fiche", "fiches")}` : null].filter(Boolean)
    return `Créer la campagne « ${input.name} »${bits.length ? ` (${bits.join(", ")})` : ""}${input.status === "ACTIVE" ? ", active" : ", en brouillon"}.`
  },
  execute: async (ctx, input) => {
    const user = personOf(ctx)
    const offer = await activeOfferId(user.workspaceId, input.offerSlug)
    const { id } = await createCampaign(user, {
      name: input.name,
      description: input.description ?? null,
      sector: input.sector ?? null,
      area: input.area ?? null,
      ownerId: null,
      startsOn: input.startsOn ?? null,
      endsOn: input.endsOn ?? null,
      goalLeads: input.goalLeads ?? null,
      goalMeetings: input.goalMeetings ?? null,
      offerId: offer?.id ?? null,
      status: input.status ?? "DRAFT",
    })
    return { done: true, campaignId: id, name: input.name, open: `/app/campaigns/${id}` }
  },
})

export const updateCampaignTool = defineTool({
  name: "update_campaign",
  description: "Modifie une campagne (campaignId) : statut (DRAFT, ACTIVE, PAUSED, COMPLETED), nom, secteur, zone, objectifs, offre phare, dates.",
  permission: "campaign:manage",
  approval: "user",
  costClass: "free",
  family: "campaigns",
  input: z.object({ campaignId: idOf("de la campagne"), name: z.string().trim().min(2).max(80).optional(), status: z.enum(CAMPAIGN_STATUSES).optional(), ...campaignFields }),
  summarize: async (input, ctx) => {
    const user = personOf(ctx)
    const c = await prisma.campaign.findFirst({ where: { id: input.campaignId, workspaceId: user.workspaceId }, select: { name: true } })
    if (!c) throw new LeadError("not_found", "Campagne introuvable : retrouve son campaignId avec list_campaigns.", 404)
    const { campaignId: _, status, offerSlug, ...rest } = input
    const changes = [
      status ? `statut « ${campaignStatus[status].label} »` : null,
      offerSlug ? `offre « ${(await activeOfferId(user.workspaceId, offerSlug))!.name} »` : null,
      ...Object.entries(rest)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k} → ${clip(String(v), 60)}`),
    ].filter(Boolean)
    if (!changes.length) throw new LeadError("invalid", "Aucun changement demandé.", 400)
    return `Modifier la campagne « ${c.name} » : ${changes.join(", ")}.`
  },
  execute: async (ctx, input) => {
    const user = personOf(ctx)
    const { campaignId, offerSlug, ...patch } = input
    const offer = await activeOfferId(user.workspaceId, offerSlug)
    const view = await updateCampaign(user, campaignId, { ...patch, ...(offer ? { offerId: offer.id } : {}) })
    return { done: true, campaignId, name: view.name, status: campaignStatus[view.status].label }
  },
})

export const startSearchTool = defineTool({
  name: "start_search",
  description:
    "Lance une recherche d'entreprises sur Cleads Extractor : une activité (ex. architecte, plombier, restaurant) dans une zone (ex. « Nantes, France »), jusqu'à 1 000 entreprises. Avec les emails (enrich, par défaut) elle est plus lente. Elle tourne plusieurs minutes ; ses résultats s'importent ensuite avec import_search, dans la campagne donnée.",
  permission: "search:run",
  approval: "user",
  costClass: "free",
  family: "prospecting",
  input: z.object({
    activity: z.string().trim().min(2).max(100).describe("Le métier ou l'activité, au singulier"),
    location: z.string().trim().min(2).max(120).describe("Ville ou zone, avec le pays : « Nantes, France »"),
    maxResults: z.number().int().min(10).max(MAX_SEARCH_RESULTS).optional().describe(`Nombre d'entreprises au plus (${DEFAULT_SEARCH_RESULTS} par défaut, ${MAX_SEARCH_RESULTS} au plus)`),
    enrich: z.boolean().optional().describe("Chercher les emails sur les sites (plus lent) ; vrai par défaut"),
    country: z.string().length(2).optional().describe("Code pays quand le lieu est ambigu (FR)"),
    campaignId: z.string().min(1).max(64).optional().describe("La campagne où ranger les fiches à l'import"),
  }),
  summarize: async (input, ctx) => {
    const user = personOf(ctx)
    const campaign = input.campaignId ? await prisma.campaign.findFirst({ where: { id: input.campaignId, workspaceId: user.workspaceId, archivedAt: null }, select: { name: true } }) : null
    if (input.campaignId && !campaign) throw new LeadError("not_found", "Campagne introuvable : retrouve son campaignId avec list_campaigns.", 404)
    const n = input.maxResults ?? DEFAULT_SEARCH_RESULTS
    return `Lancer la recherche Extractor « ${input.activity} — ${input.location} » : ${plural(n, "entreprise", "entreprises")} au plus${input.enrich === false ? ", sans les emails" : ", avec les emails (plus lent)"}${campaign ? `, pour la campagne « ${campaign.name} »` : ""}. Rien n'est importé avant l'étape d'import.`
  },
  execute: async (ctx, input) => {
    const s = await startSearch(personOf(ctx), { activity: input.activity, location: input.location, country: input.country, enrich: input.enrich ?? true, maxResults: input.maxResults ?? DEFAULT_SEARCH_RESULTS, campaignId: input.campaignId ?? null })
    return { started: true, searchId: s.id, label: s.label, status: s.status, campaign: s.campaign?.name ?? null, open: `/app/search/${s.id}`, note: "La recherche tourne sur l'Extractor ; une notification arrive à la fin. Ne la présente pas comme terminée." }
  },
})

export const cancelSearchTool = defineTool({
  name: "cancel_search",
  description: "Arrête une recherche Extractor en cours (searchId). Ce qui a déjà été trouvé reste importable.",
  permission: "search:run",
  approval: "user",
  costClass: "free",
  family: "prospecting",
  input: z.object({ searchId: idOf("de la recherche") }),
  summarize: async (input, ctx) => `Arrêter la recherche « ${(await getSearchView(personOf(ctx), input.searchId)).label} ».`,
  execute: async (ctx, input) => {
    const s = await cancelSearch(personOf(ctx), input.searchId)
    return { done: true, searchId: s.id, status: s.status }
  },
})

export const importSearchTool = defineTool({
  name: "import_search",
  description:
    "Importe dans le CRM les entreprises joignables d'une recherche (searchId), dans sa campagne s'il y en a une. Un import n'ajoute que des fiches nouvelles : celles déjà connues sont reconnues. Jev trie ensuite seul les nouvelles fiches d'une campagne.",
  permission: "lead:import",
  approval: "user",
  costClass: "free",
  family: "prospecting",
  input: z.object({ searchId: idOf("de la recherche"), hasEmail: z.boolean().optional().describe("Seulement les entreprises avec un email"), minCompleteness: z.number().int().min(0).max(100).optional() }),
  summarize: async (input, ctx) => {
    const s = await getSearchView(personOf(ctx), input.searchId)
    return `Importer les entreprises joignables${input.hasEmail ? " avec un email" : ""} de la recherche « ${s.label} » (${plural(s.counters.crmUseful, "joignable", "joignables")} à ce stade)${s.campaign ? `, dans la campagne « ${s.campaign.name} »` : ""}.`
  },
  execute: async (ctx, input) => {
    const r = await importSearch(personOf(ctx), input.searchId, { commit: true, useful: true, hasEmail: !!input.hasEmail, minCompleteness: input.minCompleteness ?? 0 })
    return { done: true, searchId: input.searchId, created: r.summary.created, alreadyKnown: r.summary.existing, excluded: r.excluded, searchStatus: r.jobStatus, batchId: r.batchId }
  },
})

export const sortCampaignTool = defineTool({
  name: "sort_campaign",
  description: "Demande à Jev de trier les fiches pas encore triées d'une campagne (bonne cible, possible, non pertinente), selon son offre phare. Quelques centimes pour des centaines de fiches.",
  permission: "campaign:manage",
  approval: "user",
  costClass: "metered",
  family: "prospecting",
  input: z.object({ campaignId: idOf("de la campagne") }),
  summarize: async (input, ctx) => {
    const user = personOf(ctx)
    const c = await prisma.campaign.findFirst({ where: { id: input.campaignId, workspaceId: user.workspaceId }, select: { name: true } })
    if (!c) throw new LeadError("not_found", "Campagne introuvable : retrouve son campaignId avec list_campaigns.", 404)
    return `Demander à Jev de trier les fiches de la campagne « ${c.name} » (${await capOf(user, "qualifier")} au plus par lot de 40 fiches).`
  },
  execute: async (ctx, input) => {
    const r = await requestRelevance(personOf(ctx), input.campaignId)
    if (!r.runId) return { started: false, note: "Toutes les fiches de cette campagne sont déjà triées." }
    return runCard("qualifier", r.runId, { open: `/app/campaigns/${input.campaignId}`, queued: String(r.queued) })
  },
})

export const PROSPECTING_ACTIONS = [createCampaignTool, updateCampaignTool, startSearchTool, cancelSearchTool, importSearchTool, sortCampaignTool] as const
