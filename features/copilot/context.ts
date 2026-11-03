import { prisma } from "@/lib/prisma"
import type { CurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { leadStatus } from "@/lib/crm/status"
import { scopeWhere } from "@/features/leads/service"
import type { LeadFilters } from "@/features/leads/schemas"
import type { PageKind, PageRef } from "./page-kind"

export { parsePage } from "./page-kind"
export type { PageKind, PageRef } from "./page-kind"

/**
 * The page in words for the copilot (E24), checked against what the person may see (the address itself is read by
 * ./page-kind.ts, which the panel shares).
 */
export interface PageContext {
  kind: PageKind
  path: string
  /** For the person: "Fiche Plomberie Martin", "Pipeline"… */
  label: string
  /** For the model: one line, ids included, so its tools can act on "this" page. */
  line: string
  leadId?: string
  campaignId?: string
}

const PAGE_LABELS: Record<PageKind, string> = {
  today: "Aujourd’hui",
  leads: "Prospects",
  lead: "Fiche",
  campaigns: "Campagnes",
  campaign: "Campagne",
  pipeline: "Pipeline",
  meetings: "Rendez-vous",
  studio: "Studio Web",
  site: "Maquette du Studio Web",
  mailbox: "Emails",
  agents: "Agents IA",
  hq: "Vue 3D",
  other: "CRM",
}

/** The list's filters in words, for the model and the person. */
export function describeFilters(f: LeadFilters): string {
  const parts: string[] = []
  if (f.q) parts.push(`recherche « ${f.q} »`)
  if (f.status.length) parts.push(`statut ${f.status.map((s) => leadStatus[s].label).join(" ou ")}`)
  if (f.owner === "me") parts.push("mes fiches")
  else if (f.owner === "none") parts.push("fiches non attribuées")
  if (f.city) parts.push(`ville ${f.city}`)
  if (f.sector) parts.push(`secteur ${f.sector}`)
  if (f.tag) parts.push(`étiquette ${f.tag}`)
  if (f.minScore) parts.push(`score ≥ ${f.minScore}`)
  if (f.hasEmail) parts.push("avec email")
  if (f.hasPhone) parts.push("avec téléphone")
  if (f.campaign === "none") parts.push("hors campagne")
  else if (f.campaign) parts.push(`campagne ${f.campaign}`)
  return parts.join(", ")
}

const quote = (s: string) => `« ${s.replace(/[«»\n\r]/g, " ").trim().slice(0, 120)} »`

/** The lines the model reads, shared with the copilot's evaluation (features/quality/cases/copilot.ts). */
export const PAGE_LINES = {
  plain: (kind: PageKind) => `Page ouverte : ${PAGE_LABELS[kind]}.`,
  lead: (name: string, city: string | null, id: string) => `Page ouverte : la fiche ${quote(name)}${city ? ` (${city})` : ""}, leadId ${id}. « Cette fiche » désigne celle-ci.`,
  campaign: (name: string, id: string) => `Page ouverte : la campagne ${quote(name)}, campaignId ${id}. « Cette campagne » désigne celle-ci.`,
  list: (filters: string) =>
    filters ? `Page ouverte : la liste des prospects filtrée (${filters}). « La liste » désigne ces fiches : retrouve-les avec search_leads et les mêmes filtres.` : "Page ouverte : la liste des prospects, sans filtre.",
}

/**
 * The page in words, after checking that the person may see what it shows. A fiche or a campaign they may not see is
 * described as the page alone, without its id: the copilot never learns more than the person.
 */
export async function describePage(user: CurrentUser, page: PageRef | null): Promise<PageContext | null> {
  if (!page) return null
  const base = { kind: page.kind, path: page.path }
  const plain = (kind: PageKind = page.kind): PageContext => ({ ...base, kind, label: PAGE_LABELS[kind], line: PAGE_LINES.plain(kind) })

  if (page.kind === "lead" && page.id && can(user.role, "lead:read")) {
    const lead = await prisma.lead.findFirst({
      where: { id: page.id, workspaceId: user.workspaceId, ...scopeWhere(user, "lead:read") },
      select: { id: true, company: { select: { name: true, city: true } }, contact: { select: { name: true } } },
    })
    if (!lead) return plain("leads")
    const name = lead.company?.name ?? lead.contact?.name ?? "Sans nom"
    return { ...base, label: `Fiche ${name}`, line: PAGE_LINES.lead(name, lead.company?.city ?? null, lead.id), leadId: lead.id }
  }
  if (page.kind === "campaign" && page.id && can(user.role, "campaign:read")) {
    const campaign = await prisma.campaign.findFirst({ where: { id: page.id, workspaceId: user.workspaceId }, select: { id: true, name: true } })
    if (!campaign) return plain("campaigns")
    return { ...base, label: `Campagne ${campaign.name}`, line: PAGE_LINES.campaign(campaign.name, campaign.id), campaignId: campaign.id }
  }
  if (page.kind === "site" && page.id && can(user.role, "studio:generate")) {
    const site = await prisma.generatedSite.findFirst({
      where: { id: page.id, workspaceId: user.workspaceId, lead: { is: { workspaceId: user.workspaceId, ...scopeWhere(user, "lead:read") } } },
      select: { companyName: true, leadId: true },
    })
    if (!site) return plain("studio")
    return { ...base, label: `Maquette de ${site.companyName}`, line: `Page ouverte : la maquette du Studio Web pour ${quote(site.companyName)}, leadId ${site.leadId}.`, leadId: site.leadId }
  }
  if (page.kind === "leads" && page.filters) {
    const filters = describeFilters(page.filters)
    return {
      ...base,
      label: filters ? `Prospects : ${filters}` : "Prospects",
      line: PAGE_LINES.list(filters),
    }
  }
  return plain()
}
