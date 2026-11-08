import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { can, type Permission } from "@/lib/rbac"
import { LeadError } from "@/features/leads/errors"
import { RELEVANCE_FILTERS, SORTS } from "@/features/leads/schemas"
import { LEAD_STATUSES } from "@/features/leads/types"
import { ZONES, ZONE_IDS } from "@/features/hq/zones"
import { TABS } from "@/app/(crm)/app/agents/tabs"
import { defineTool } from "@/features/ai/tools"
import { personOf, visibleName } from "./shared"

/**
 * Guided navigation (E28, family "navigation"): the copilot opens a CRM page for the person, in the 2D view or in a
 * window of the 3D view. The server writes the address and checks the person may see what it points to; the panel
 * opens it.
 */

export const PAGES = ["lead", "leads", "campaign", "campaigns", "pipeline", "meetings", "today", "search", "searches", "studio", "mailbox", "sequences", "agents", "hq"] as const

/** The right a page asks for, beyond seeing what it shows. */
export const PAGE_RIGHTS: Partial<Record<(typeof PAGES)[number], Permission>> = {
  campaign: "campaign:read",
  campaigns: "campaign:read",
  pipeline: "deal:read",
  meetings: "meeting:read",
  search: "search:run",
  searches: "search:run",
  studio: "studio:generate",
  mailbox: "email:send",
  sequences: "sequence:manage",
  agents: "ai:console",
  hq: "hq:view",
}

export const openPageTool = defineTool({
  name: "open_page",
  description:
    "Ouvre une page du CRM pour la personne : une fiche (leadId), la liste des fiches avec des filtres (texte, statuts, ville, secteur, campagne, étiquette, pertinence, les siennes, tri), une campagne, le pipeline, l'agenda, la journée, une recherche, une maquette (siteId), la boîte de réception, les séquences, un onglet d'Agents IA, ou un espace du QG 3D. À utiliser quand elle demande à voir, à ouvrir, à afficher.",
  permission: null,
  approval: "auto",
  costClass: "free",
  family: "navigation",
  input: z.object({
    page: z.enum(PAGES),
    id: z.string().min(1).max(64).optional().describe("leadId, campaignId, searchId ou siteId selon la page"),
    filters: z
      .object({
        query: z.string().max(200).optional(),
        status: z.array(z.enum(LEAD_STATUSES)).max(6).optional(),
        city: z.string().max(100).optional(),
        sector: z.string().max(100).optional(),
        campaignId: z.string().max(64).optional(),
        tag: z.string().max(40).optional(),
        relevance: z.enum(RELEVANCE_FILTERS).optional(),
        mine: z.boolean().optional(),
        sort: z.enum(SORTS).optional(),
      })
      .optional()
      .describe("Pour la liste des fiches"),
    tab: z.enum(TABS).optional().describe("Onglet d'Agents IA"),
    zone: z.enum(ZONE_IDS).optional().describe("Espace du QG 3D"),
  }),
  summarize: (input) => `Ouvrir la page « ${input.page} ».`,
  execute: async (ctx, input) => {
    const user = personOf(ctx)
    const right = PAGE_RIGHTS[input.page]
    if (right && !can(user.role, right)) throw new LeadError("forbidden", "Cette page n'est pas ouverte à la personne.", 403)
    const need = (what: string) => {
      if (!input.id) throw new LeadError("invalid", `Il faut l'identifiant ${what} (id).`, 400)
      return input.id
    }
    switch (input.page) {
      case "lead": {
        const id = need("de la fiche")
        return { open: `/app/leads/${id}`, label: await visibleName(user, id) }
      }
      case "leads": {
        const f = input.filters ?? {}
        const q = new URLSearchParams()
        if (f.query) q.set("q", f.query)
        if (f.status?.length) q.set("status", f.status.join(","))
        if (f.city) q.set("city", f.city)
        if (f.sector) q.set("sector", f.sector)
        if (f.campaignId) q.set("campaign", f.campaignId)
        if (f.tag) q.set("tag", f.tag.toLowerCase())
        if (f.relevance) q.set("relevance", f.relevance)
        if (f.mine) q.set("owner", "me")
        if (f.sort) q.set("sort", f.sort)
        return { open: `/app/leads${q.size ? `?${q}` : ""}`, label: "Fiches" }
      }
      case "campaign": {
        const c = await prisma.campaign.findFirst({ where: { id: need("de la campagne"), workspaceId: user.workspaceId }, select: { id: true, name: true } })
        if (!c) throw new LeadError("not_found", "Campagne introuvable.", 404)
        return { open: `/app/campaigns/${c.id}`, label: c.name }
      }
      case "search": {
        const s = await prisma.extractionSearch.findFirst({ where: { id: need("de la recherche"), workspaceId: user.workspaceId }, select: { id: true, label: true } })
        if (!s) throw new LeadError("not_found", "Recherche introuvable.", 404)
        return { open: `/app/search/${s.id}`, label: s.label }
      }
      case "studio": {
        const site = await prisma.generatedSite.findFirst({ where: { id: need("de la maquette"), workspaceId: user.workspaceId }, select: { id: true, leadId: true } })
        if (!site?.leadId) throw new LeadError("not_found", "Maquette introuvable.", 404)
        return { open: `/app/studio/${site.id}`, label: `Maquette de ${await visibleName(user, site.leadId)}` }
      }
      case "agents":
        return { open: `/app/agents${input.tab ? `?tab=${input.tab}` : ""}`, label: "Agents IA" }
      case "hq": {
        const zone = input.zone ? ZONES.find((z) => z.id === input.zone) : null
        if (zone?.permission && !can(user.role, zone.permission)) throw new LeadError("forbidden", "Cet espace n'est pas ouvert à la personne.", 403)
        return { open: `/app/3d${zone ? `?zone=${zone.id}` : ""}`, label: zone ? zone.label : "QG 3D" }
      }
      case "campaigns":
        return { open: "/app/campaigns", label: "Campagnes" }
      case "pipeline":
        return { open: "/app/pipeline", label: "Pipeline" }
      case "meetings":
        return { open: "/app/meetings", label: "Agenda" }
      case "today":
        return { open: "/app", label: "Aujourd'hui" }
      case "searches":
        return { open: "/app/search", label: "Recherche" }
      case "mailbox":
        return { open: "/app/mailbox", label: "Boîte de réception" }
      case "sequences":
        return { open: "/app/sequences", label: "Séquences" }
    }
  },
})
