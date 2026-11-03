import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { dealStage, leadStatus } from "@/lib/crm/status"
import { LeadError } from "@/features/leads/errors"
import { bulkUpdate, createLead, updateLead } from "@/features/leads/service"
import { LEAD_STATUSES } from "@/features/leads/types"
import { createLeadSchema } from "@/features/leads/schemas"
import { qualifyLead, updateDeal } from "@/features/pipeline/service"
import { DISQUALIFY_REASONS, LOST_REASONS, STAGES } from "@/features/pipeline/rules"
import { defineTool } from "@/features/ai/tools"
import { clip, dayKey, idOf, leadId, leadIds, personOf, targetsOf, visibleName } from "./shared"

/**
 * Fiches and pipeline (E28, family "records"): changes inside the CRM that wait for a click, the action's own or the
 * plan's. A grouped change names the fiches it touches; the service then checks each one as it always does.
 */

const companyPatch = z
  .object({
    name: z.string().trim().min(2).max(200),
    website: z.string().trim().max(300),
    phone: z.string().trim().max(40),
    email: z.string().trim().max(254),
    address: z.string().trim().max(300),
    city: z.string().trim().max(100),
    postalCode: z.string().trim().max(20),
    sector: z.string().trim().max(100),
    siret: z.string().trim().max(20),
  })
  .partial()
const contactPatch = z.object({ name: z.string().trim().max(150), jobTitle: z.string().trim().max(150), email: z.string().trim().max(254), phone: z.string().trim().max(40) }).partial()

const fields = (o: Record<string, unknown> | undefined) =>
  Object.entries(o ?? {})
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k} → ${clip(String(v), 60)}`)

export const createLeadTool = defineTool({
  name: "create_lead",
  description: "Crée une fiche à la main (entreprise et, si on le connaît, son contact), par exemple après un appel entrant ou une recommandation. Les doublons connus sont refusés par le CRM.",
  permission: "lead:write",
  approval: "user",
  costClass: "free",
  family: "records",
  input: z.object({ company: companyPatch.required({ name: true }), contact: contactPatch.optional(), tags: z.array(z.string().max(40)).max(10).optional(), note: z.string().trim().max(2_000).optional() }),
  summarize: (input) => `Créer la fiche ${input.company.name}${input.company.city ? ` (${input.company.city})` : ""}${input.contact?.name ? `, contact ${input.contact.name}` : ""}.`,
  execute: async (ctx, input) => {
    const { id } = await createLead(personOf(ctx), createLeadSchema.parse(input))
    return { done: true, leadId: id, name: input.company.name }
  },
})

export const updateLeadTool = defineTool({
  name: "update_lead",
  description: "Corrige les informations d'une fiche : entreprise (site, téléphone, adresse, ville, secteur…) ou contact (nom, fonction, email, téléphone). Le statut, l'attribution et la campagne ont leurs propres actions.",
  permission: "lead:write",
  approval: "user",
  costClass: "free",
  family: "records",
  input: z.object({ leadId, company: companyPatch.optional(), contact: contactPatch.optional() }).refine((v) => fields(v.company).length + fields(v.contact).length > 0, { message: "Aucun changement demandé" }),
  summarize: async (input, ctx) => `Modifier la fiche ${await visibleName(personOf(ctx), input.leadId)} : ${[...fields(input.company), ...fields(input.contact)].join(" ; ")}.`,
  execute: async (ctx, input) => {
    await updateLead(personOf(ctx), input.leadId, { company: input.company, contact: input.contact })
    return { done: true, leadId: input.leadId }
  },
})

export const setLeadStatusTool = defineTool({
  name: "set_lead_status",
  description:
    "Change le statut de fiches (500 au plus) : NEW, CONTACTED, REPLIED, QUALIFIED, DISQUALIFIED, DO_NOT_CONTACT. « Ne pas contacter » arrête leurs séquences. Pour qualifier avec une opportunité, préfère qualify_lead.",
  permission: "lead:write",
  approval: "user",
  costClass: "free",
  family: "records",
  input: z.object({ leadIds: leadIds(), status: z.enum(LEAD_STATUSES) }),
  summarize: async (input, ctx) => `Passer en « ${leadStatus[input.status].label} » ${(await targetsOf(personOf(ctx), input.leadIds)).text}${input.status === "DO_NOT_CONTACT" ? " ; leurs séquences s'arrêtent" : ""}.`,
  execute: async (ctx, input) => {
    const r = await bulkUpdate(personOf(ctx), { ids: input.leadIds, action: { type: "status", status: input.status } })
    return { done: true, status: leadStatus[input.status].label, updated: r.updated, notAllowed: r.notAllowed, failures: r.failures.slice(0, 5) }
  },
})

async function memberName(workspaceId: string, id: string): Promise<string> {
  const u = await prisma.user.findFirst({ where: { id, workspaceId, active: true }, select: { name: true, email: true } })
  if (!u) throw new LeadError("not_found", "Membre introuvable : retrouve son userId avec list_team.", 404)
  return u.name ?? u.email ?? "Membre"
}

export const assignLeadsTool = defineTool({
  name: "assign_leads",
  description: "Attribue des fiches (500 au plus) à un membre de l'équipe (userId lu avec list_team), ou les rend au pool commun (null).",
  permission: "lead:write",
  approval: "user",
  costClass: "free",
  family: "records",
  input: z.object({ leadIds: leadIds(), ownerId: z.string().min(1).max(64).nullable().describe("userId, ou null pour le pool") }),
  summarize: async (input, ctx) => {
    const user = personOf(ctx)
    const to = input.ownerId ? `à ${await memberName(user.workspaceId, input.ownerId)}` : "au pool commun"
    return `Attribuer ${to} ${(await targetsOf(user, input.leadIds)).text}.`
  },
  execute: async (ctx, input) => {
    const r = await bulkUpdate(personOf(ctx), { ids: input.leadIds, action: { type: "assign", ownerId: input.ownerId } })
    return { done: true, updated: r.updated, notAllowed: r.notAllowed, failures: r.failures.slice(0, 5) }
  },
})

async function campaignName(workspaceId: string, id: string): Promise<string> {
  const c = await prisma.campaign.findFirst({ where: { id, workspaceId, archivedAt: null }, select: { name: true } })
  if (!c) throw new LeadError("not_found", "Campagne introuvable : retrouve son campaignId avec list_campaigns.", 404)
  return c.name
}

export const fileInCampaignTool = defineTool({
  name: "file_in_campaign",
  description: "Range des fiches (500 au plus) dans une campagne (campaignId), ou les en sort (null).",
  permission: "campaign:manage",
  approval: "user",
  costClass: "free",
  family: "records",
  input: z.object({ leadIds: leadIds(), campaignId: z.string().min(1).max(64).nullable() }),
  summarize: async (input, ctx) => {
    const user = personOf(ctx)
    const where = input.campaignId ? `dans la campagne « ${await campaignName(user.workspaceId, input.campaignId)} »` : "hors campagne"
    return `Ranger ${where} ${(await targetsOf(user, input.leadIds)).text}.`
  },
  execute: async (ctx, input) => {
    const r = await bulkUpdate(personOf(ctx), { ids: input.leadIds, action: { type: "campaign", campaignId: input.campaignId } })
    return { done: true, updated: r.updated, notAllowed: r.notAllowed, failures: r.failures.slice(0, 5) }
  },
})

export const qualifyLeadTool = defineTool({
  name: "qualify_lead",
  description:
    "Qualifie une fiche (statut « Qualifié » et une opportunité confiée à un closer) ou la disqualifie avec une raison. Les réponses de qualification (besoin, budget, décideur, échéance) sont celles que la personne a données.",
  permission: "lead:write",
  approval: "user",
  costClass: "free",
  family: "records",
  input: z.object({
    leadId,
    decision: z.enum(["qualify", "disqualify"]),
    need: z.string().trim().max(1000).optional(),
    budget: z.enum(["unknown", "none", "yes"]).optional(),
    authority: z.enum(["unknown", "decision_maker", "influencer", "user"]).optional(),
    timing: z.enum(["unknown", "now", "1_3_months", "3_6_months", "later"]).optional(),
    notes: z.string().trim().max(2000).optional(),
    closerId: z.string().min(1).max(64).optional().describe("Le closer qui reprend l'opportunité (userId)"),
    reason: z.enum(DISQUALIFY_REASONS).optional().describe("Obligatoire pour disqualifier"),
  }),
  summarize: async (input, ctx) => {
    const name = await visibleName(personOf(ctx), input.leadId)
    if (input.decision === "disqualify" && !input.reason) throw new LeadError("invalid", "Une disqualification demande une raison (reason).", 400)
    return input.decision === "qualify" ? `Qualifier ${name} et ouvrir son opportunité${input.need ? ` (besoin : ${clip(input.need, 120)})` : ""}.` : `Disqualifier ${name} : ${input.reason}.`
  },
  execute: async (ctx, input) => {
    const qualification = { need: input.need, budget: input.budget, authority: input.authority, timing: input.timing, notes: input.notes }
    const r =
      input.decision === "qualify"
        ? await qualifyLead(personOf(ctx), input.leadId, { decision: "qualify", qualification, closerId: input.closerId ?? null })
        : await qualifyLead(personOf(ctx), input.leadId, { decision: "disqualify", qualification, reason: input.reason!, detail: input.notes })
    return { done: true, leadId: input.leadId, dealId: r.dealId }
  },
})

export const moveDealTool = defineTool({
  name: "move_deal",
  description: "Fait avancer une opportunité (dealId lu avec get_lead ou get_pipeline) : étape, montant, date de signature prévue ; « LOST » demande une raison.",
  permission: "deal:move",
  approval: "user",
  costClass: "free",
  family: "records",
  input: z.object({
    dealId: idOf("de l'opportunité (dealId)"),
    stage: z.enum(STAGES).optional(),
    amountEur: z.number().min(0).max(10_000_000).nullable().optional(),
    expectedClose: dayKey.nullable().optional(),
    lostReason: z.enum(LOST_REASONS).optional(),
  }),
  summarize: async (input, ctx) => {
    const user = personOf(ctx)
    const deal = await prisma.deal.findFirst({ where: { id: input.dealId, workspaceId: user.workspaceId }, select: { leadId: true } })
    if (!deal) throw new LeadError("not_found", "Opportunité introuvable : retrouve son dealId avec get_lead.", 404)
    const name = await visibleName(user, deal.leadId)
    const parts = [
      input.stage ? `étape « ${dealStage[input.stage].label} »${input.stage === "LOST" && input.lostReason ? ` (${input.lostReason})` : ""}` : null,
      input.amountEur !== undefined ? `montant ${input.amountEur == null ? "retiré" : `${input.amountEur.toLocaleString("fr-FR")} €`}` : null,
      input.expectedClose !== undefined ? `signature prévue ${input.expectedClose ?? "retirée"}` : null,
    ].filter(Boolean)
    if (!parts.length) throw new LeadError("invalid", "Aucun changement demandé.", 400)
    return `Opportunité de ${name} : ${parts.join(", ")}.`
  },
  execute: async (ctx, input) => {
    const d = await updateDeal(personOf(ctx), input.dealId, {
      stage: input.stage,
      lostReason: input.lostReason,
      amountCents: input.amountEur === undefined ? undefined : input.amountEur === null ? null : Math.round(input.amountEur * 100),
      expectedCloseAt: input.expectedClose === undefined ? undefined : input.expectedClose === null ? null : `${input.expectedClose}T12:00:00.000Z`,
    })
    return { done: true, dealId: d.id, leadId: d.leadId, stage: dealStage[d.stage].label }
  },
})

export const RECORD_ACTIONS = [createLeadTool, updateLeadTool, setLeadStatusTool, assignLeadsTool, fileInCampaignTool, qualifyLeadTool, moveDealTool] as const
