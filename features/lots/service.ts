import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { dayBounds } from "@/lib/crm/day"
import { domainFromUrl } from "@/lib/crm/normalize"
import { getExtractorClient } from "@/lib/extractor/client"
import { businessToImportRow, externalIdOf } from "@/lib/extractor/mapping"
import type { ExtractorBusiness } from "@/lib/extractor/schemas"
import { LeadError } from "@/features/leads/errors"
import { runImport, type ImportRow } from "@/features/leads/import"
import { bulkUpdate, deleteLead, listLeads } from "@/features/leads/service"
import { parseLeadFilters } from "@/features/leads/schemas"
import { createCampaign } from "@/features/campaigns/service"
import { createCampaignSchema } from "@/features/campaigns/schemas"
import { startSearch } from "@/features/search/service"
import type { LeadListRow } from "@/features/leads/types"
import { MAX_LOT, lotName, type LotRequest } from "./prompt"

/**
 * Batches for the closers (9 November 2026, maquette « Manager »): a manager says what he wants in one sentence, Cleads
 * finds the businesses (Extractor), keeps those without a real site when asked (a Facebook or Instagram page is not a
 * site), files them in a campaign and gives them to a closer. No AI at any step: the volume stays free.
 */

/** The Extractor finds more than a batch keeps: those with a real site or no phone are set aside. */
const SEARCH_FACTOR = 2.5

const assertDispatch = (user: CurrentUser) => {
  if (!can(user.role, "team:dispatch")) throw new LeadError("forbidden", "Seuls le propriétaire et les managers préparent des lots.", 403)
}

/** Creates the campaign and starts the search that feeds it. */
export async function startLot(user: CurrentUser, r: LotRequest, ip?: string | null): Promise<{ campaignId: string; searchId: string; name: string }> {
  assertDispatch(user)
  const name = lotName(r)
  const { id: campaignId } = await createCampaign(user, createCampaignSchema.parse({ name, sector: r.activity, area: r.location, ownerId: user.id }), ip)
  const search = await startSearch(user, { activity: r.activity, location: r.location, enrich: true, maxResults: Math.min(1000, Math.max(30, Math.ceil(r.count * SEARCH_FACTOR))), campaignId }, ip)
  return { campaignId, searchId: search.id, name }
}

export type LotSite = "none" | "social" | "real"

export interface LotCandidate {
  id: number
  name: string
  city: string | null
  phone: string | null
  site: LotSite
  website: string | null
  rating: number | null
  reviews: number | null
}

export interface LotPreview {
  found: number
  withSite: number
  noPhone: number
  kept: LotCandidate[]
}

const siteOf = (website: string | null | undefined): LotSite => (!website?.trim() ? "none" : domainFromUrl(website) ? "real" : "social")

/** Best first: rating weighted by how many reviews back it, so 4,9 on 3 reviews does not beat 4,6 on 120. */
const strength = (c: Pick<LotCandidate, "rating" | "reviews">) => (c.rating ?? 0) * Math.log10(1 + (c.reviews ?? 0))

async function allBusinesses(jobId: string): Promise<ExtractorBusiness[]> {
  const client = getExtractorClient()
  const out: ExtractorBusiness[] = []
  let cursor: string | undefined
  for (let guard = 0; guard < 20; guard++) {
    const page = await client.businesses(jobId, { cursor, limit: 500, useful: true })
    out.push(...page.items)
    if (!page.has_more || !page.next_cursor) break
    cursor = page.next_cursor
  }
  return out
}

async function lotSearch(user: CurrentUser, searchId: string) {
  const s = await prisma.extractionSearch.findFirst({ where: { id: searchId, workspaceId: user.workspaceId }, select: { id: true, extractorJobId: true, campaignId: true } })
  if (!s) throw new LeadError("not_found", "Recherche introuvable.", 404)
  if (!s.extractorJobId) throw new LeadError("conflict", "La recherche n’a pas encore démarré.", 409)
  return s as { id: string; extractorJobId: string; campaignId: string | null }
}

/** What the batch would keep, read from the search's results: nothing is written. */
export function pickLot(businesses: ExtractorBusiness[], r: Pick<LotRequest, "count" | "noSite">): LotPreview {
  const all = businesses.map((b): LotCandidate => ({ id: b.id, name: b.name, city: b.city ?? null, phone: b.phone ?? null, site: siteOf(b.website), website: b.website ?? null, rating: b.rating ?? null, reviews: b.reviews_count ?? null }))
  const withSite = r.noSite ? all.filter((c) => c.site === "real").length : 0
  const eligible = all.filter((c) => !(r.noSite && c.site === "real"))
  const noPhone = eligible.filter((c) => !c.phone).length
  const kept = eligible.filter((c) => c.phone).sort((a, b) => strength(b) - strength(a)).slice(0, Math.min(MAX_LOT, r.count))
  return { found: all.length, withSite, noPhone, kept }
}

export async function lotPreview(user: CurrentUser, searchId: string, r: Pick<LotRequest, "count" | "noSite">): Promise<LotPreview> {
  assertDispatch(user)
  const s = await lotSearch(user, searchId)
  return pickLot(await allBusinesses(s.extractorJobId), r)
}

/** Imports the chosen businesses into the batch's campaign and gives their fiches to the closer. */
export async function sendLot(user: CurrentUser, searchId: string, input: { ids: number[]; closerId: string }, ip?: string | null): Promise<{ sent: number; created: number }> {
  assertDispatch(user)
  if (input.ids.length === 0) throw new LeadError("invalid", "Choisis au moins une fiche.")
  if (input.ids.length > MAX_LOT) throw new LeadError("invalid", `${MAX_LOT} fiches au plus par lot.`)
  const closer = await prisma.user.findFirst({ where: { id: input.closerId, workspaceId: user.workspaceId, role: "CLOSER", active: true }, select: { id: true, name: true, email: true } })
  if (!closer) throw new LeadError("invalid", "Ce membre n’est pas un closer actif.")
  const s = await lotSearch(user, searchId)
  const wanted = new Set(input.ids)
  const chosen = (await allBusinesses(s.extractorJobId)).filter((b) => wanted.has(b.id))
  const rows: ImportRow[] = []
  for (const b of chosen) {
    const mapped = businessToImportRow(b)
    if (!("skip" in mapped)) rows.push(mapped.row)
  }
  if (rows.length === 0) throw new LeadError("conflict", "Ces entreprises ne sont plus dans les résultats de la recherche.", 409)
  const result = await runImport(user, rows, { commit: true, source: "EXTRACTOR", fileName: `Lot · ${closer.name ?? closer.email}`, extractorJobId: s.extractorJobId, campaignId: s.campaignId, ip })
  const leads = await prisma.lead.findMany({ where: { workspaceId: user.workspaceId, company: { is: { externalId: { in: chosen.map(externalIdOf) } } } }, select: { id: true } })
  const ids = leads.map((l) => l.id)
  for (let i = 0; i < ids.length; i += 500) await bulkUpdate(user, { ids: ids.slice(i, i + 500), action: { type: "assign", ownerId: closer.id } }, ip)
  await prisma.extractionSearch.update({ where: { id: s.id }, data: { importedCount: { increment: result.summary.created }, lastImportAt: new Date() } })
  await audit({ action: "lot.sent", actorId: user.id, workspaceId: user.workspaceId, entityType: "ExtractionSearch", entityId: s.id, metadata: { closerId: closer.id, leads: ids.length }, ip })
  return { sent: ids.length, created: result.summary.created }
}

export interface CloserSummary {
  id: string
  name: string
  leads: number
  calledThisWeek: number
  qualified: number
  meetings: number
}

/** The closers of the workspace, each with his file and his week. */
export async function closersOverview(user: CurrentUser, now = new Date()): Promise<CloserSummary[]> {
  assertDispatch(user)
  const closers = await prisma.user.findMany({ where: { workspaceId: user.workspaceId, role: "CLOSER", active: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } })
  const weekAgo = new Date(dayBounds(now).start.getTime() - 6 * 86_400_000)
  return Promise.all(
    closers.map(async (c) => {
      const [leads, calls, qualified, meetings] = await Promise.all([
        prisma.lead.count({ where: { workspaceId: user.workspaceId, ownerId: c.id } }),
        prisma.activity.findMany({ where: { workspaceId: user.workspaceId, actorId: c.id, kind: "CALL", occurredAt: { gte: weekAgo } }, select: { leadId: true }, distinct: ["leadId"] }),
        prisma.lead.count({ where: { workspaceId: user.workspaceId, ownerId: c.id, status: "QUALIFIED" } }),
        prisma.meeting.count({ where: { workspaceId: user.workspaceId, hostId: c.id, createdAt: { gte: weekAgo } } }),
      ])
      return { id: c.id, name: c.name ?? c.email ?? "Closer", leads, calledThisWeek: calls.length, qualified, meetings }
    })
  )
}

/** A closer's fiches, with the same glance as his own file. */
export async function closerLeads(user: CurrentUser, closerId: string): Promise<LeadListRow[]> {
  assertDispatch(user)
  return (await listLeads(user, parseLeadFilters({ owner: closerId, pageSize: "100", sort: "contacted" }))).rows
}

/** Deletes fiches for good, one by one through the same rules as the fiche itself (owner only, logged). */
export async function deleteLeads(user: CurrentUser, ids: string[], ip?: string | null): Promise<{ deleted: number }> {
  if (ids.length > MAX_LOT) throw new LeadError("invalid", `${MAX_LOT} fiches au plus à la fois.`)
  let deleted = 0
  for (const id of ids) {
    await deleteLead(user, id, ip)
    deleted++
  }
  return { deleted }
}
