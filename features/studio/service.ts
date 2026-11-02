import dns from "node:dns"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit as journal } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { can, canAccessRecord, recordFilter } from "@/lib/rbac"
import { aiConfigured } from "@/lib/ai/gateway"
import { ACTIVE_RUN_STATUSES } from "@/lib/ai/budget"
import { LeadError } from "@/features/leads/errors"
import { startRun } from "@/features/ai/runs"
import { latestFor } from "@/features/prospect-audit/latest"
import { visibleLead } from "@/features/prospect-audit/service"
import { allowedFonts } from "./brief"
import { withAssets } from "./document"
import { stateOf, type LeadStudio, type LinkView, type SiteSummary, type SiteView, type VersionView } from "./labels"
import { addDays, hashToken, LINK_DAYS, newNonce, previewHost, previewUrl, PURGE_DAYS, shareToken } from "./link"
import { briefSchema, collectedSchema, type Brief, type VersionChecks, type VersionScores } from "./schemas"

/**
 * The Studio Web in the CRM (E23, docs/crm-v1/AGENTS-IA.md §16): start a site from a fiche, edit its brief, generate
 * and revise versions, share and revoke its link. Starting needs `studio:generate` and the right to edit the fiche;
 * seeing a site needs to see its fiche.
 */
export const NO_AUDIT_FOR_STUDIO = "Lancez d’abord l’audit IA de la fiche : la maquette part de ses constats et du site qu’il a lu."
const ACTIVE = [...ACTIVE_RUN_STATUSES]

const requireStudio = (actor: CurrentUser) => {
  if (!can(actor.role, "studio:generate")) throw new LeadError("forbidden", "Votre rôle ne donne pas accès au Studio Web.", 403)
}

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null

/** The site, if the person may see its fiche. */
async function visibleSite(actor: CurrentUser, siteId: string) {
  requireStudio(actor)
  const site = await prisma.generatedSite.findFirst({ where: { id: siteId, workspaceId: actor.workspaceId }, include: { lead: { select: { id: true, ownerId: true } } } })
  if (!site) throw new LeadError("not_found", "Maquette introuvable", 404)
  await visibleLead(actor, site.leadId)
  return site
}

/** The site, if the person may also work on its fiche, with no run in progress on it. */
async function editableSite(actor: CurrentUser, siteId: string) {
  const site = await visibleSite(actor, siteId)
  if (!canAccessRecord(actor, "studio:generate", site.lead.ownerId)) throw new LeadError("forbidden", "Cette fiche ne vous est pas attribuée : vous ne pouvez pas modifier sa maquette.", 403)
  if (site.status === "PURGED") throw new LeadError("conflict", "Cette maquette a été supprimée après 90 jours : générez-en une nouvelle.", 409)
  const busy = site.lastRunId ? await prisma.agentRun.count({ where: { id: site.lastRunId, status: { in: ACTIVE } } }) : 0
  if (busy) throw new LeadError("conflict", "Le Designer travaille déjà sur cette maquette : attendez la fin de l’exécution.", 409)
  return site
}

// ── Preview host health ──────────────────────────────────────────────────────────────────────────────────────────

let hostCheck: { host: string; at: number; issue: string | null } | null = null

/** Whether the preview host resolves; checked at most every ten minutes. Null when it does, or in development. */
async function previewHostIssue(): Promise<string | null> {
  const host = previewHost()
  if (!host || /localhost|127\.0\.0\.1/.test(host)) return null
  if (hostCheck?.host === host && Date.now() - hostCheck.at < 10 * 60_000) return hostCheck.issue
  const resolved = await Promise.race([dns.promises.resolve(host).then(() => true, () => false), new Promise<boolean>((r) => setTimeout(() => r(true), 2_000))])
  const issue = resolved ? null : `Le domaine ${host} ne répond pas encore : ajoutez-le aux domaines du site Netlify (Domain management › Add a domain alias) pour que les liens s’ouvrent.`
  hostCheck = { host, at: Date.now(), issue }
  return issue
}

// ── Views ────────────────────────────────────────────────────────────────────────────────────────────────────────

const versionSelect = { number: true, instruction: true, createdAt: true, createdById: true, model: true, costMicros: true, checks: true, scores: true } satisfies Prisma.GeneratedSiteVersionSelect

async function names(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const list = [...new Set(ids.filter((id): id is string => !!id))]
  if (!list.length) return new Map()
  const users = await prisma.user.findMany({ where: { id: { in: list } }, select: { id: true, name: true, email: true } })
  return new Map(users.map((u) => [u.id, u.name ?? u.email ?? "—"]))
}

function linkView(site: { id: string; linkNonce: string | null; tokenHash: string | null; linkCreatedAt: Date | null; linkExpiresAt: Date | null; linkCreatedById: string | null }, people: Map<string, string>, now: Date): LinkView | null {
  if (!site.linkNonce || !site.tokenHash || !site.linkExpiresAt || !site.linkCreatedAt) return null
  let url: string | null = null
  try {
    const token = shareToken(site.id, site.linkNonce)
    url = hashToken(token) === site.tokenHash ? previewUrl(token) : null
  } catch {
    url = null
  }
  return { url, createdAt: site.linkCreatedAt.toISOString(), expiresAt: site.linkExpiresAt.toISOString(), expired: site.linkExpiresAt <= now, createdBy: site.linkCreatedById ? (people.get(site.linkCreatedById) ?? null) : null }
}

const renderPath = (siteId: string, number: number, kind: "desktop" | "mobile" | "thumb") => `/api/studio/sites/${siteId}/versions/${number}/${kind}`

async function toSiteView(actor: CurrentUser, site: Prisma.GeneratedSiteGetPayload<{ include: { lead: { select: { id: true; ownerId: true } } } }>): Promise<SiteView> {
  const now = new Date()
  const [lead, run, versions, visits, issue] = await Promise.all([
    prisma.lead.findUnique({ where: { id: site.leadId }, select: { id: true, company: { select: { name: true } }, contact: { select: { name: true } } } }),
    site.lastRunId ? prisma.agentRun.findUnique({ where: { id: site.lastRunId }, select: { id: true, status: true, error: true, input: true, startedAt: true, steps: { select: { name: true }, orderBy: { index: "asc" } } } }) : null,
    prisma.generatedSiteVersion.findMany({ where: { siteId: site.id }, orderBy: { number: "desc" }, select: versionSelect }),
    prisma.generatedSiteVisit.findMany({ where: { siteId: site.id }, orderBy: { createdAt: "desc" }, take: 10, select: { createdAt: true } }),
    previewHostIssue(),
  ])
  const people = await names([site.createdById, site.linkCreatedById, ...versions.map((v) => v.createdById)])
  const writable = canAccessRecord(actor, "studio:generate", site.lead.ownerId)
  const brief = briefSchema.safeParse(site.brief)
  const collected = collectedSchema.safeParse(site.collected)
  const kind = (run?.input as { kind?: string } | null)?.kind
  const purged = site.status === "PURGED"
  return {
    id: site.id,
    lead: { id: site.leadId, name: lead?.company?.name ?? lead?.contact?.name ?? site.companyName },
    companyName: site.companyName,
    status: site.status,
    state: stateOf(site.status, run, !!site.currentVersion),
    createdAt: site.createdAt.toISOString(),
    createdBy: site.createdById ? (people.get(site.createdById) ?? null) : null,
    brief: brief.success ? brief.data : null,
    collected: collected.success ? collected.data : null,
    briefEditedAt: iso(site.briefEditedAt),
    run: run ? { id: run.id, status: run.status, error: run.error, steps: run.steps.map((s) => s.name), kind: kind === "brief" || kind === "build" || kind === "revise" ? kind : null, startedAt: iso(run.startedAt) } : null,
    currentVersion: site.currentVersion,
    versions: versions.map(
      (v): VersionView => ({
        number: v.number,
        instruction: v.instruction,
        createdAt: v.createdAt.toISOString(),
        createdBy: v.createdById ? (people.get(v.createdById) ?? null) : null,
        model: v.model,
        costEur: v.costMicros / 1_000_000,
        checks: v.checks as unknown as VersionChecks,
        scores: (v.scores as unknown as VersionScores | null) ?? null,
        renders: purged ? { desktop: null, mobile: null, thumb: null } : { desktop: renderPath(site.id, v.number, "desktop"), mobile: renderPath(site.id, v.number, "mobile"), thumb: renderPath(site.id, v.number, "thumb") },
      })
    ),
    link: purged ? null : linkView(site, people, now),
    visits: { count: site.visitCount, last: iso(site.lastVisitAt), recent: visits.map((v) => v.createdAt.toISOString()) },
    previewPath: site.currentVersion && !purged ? `/api/studio/sites/${site.id}/preview?v=${site.currentVersion}` : null,
    purgeAfter: site.purgeAfter.toISOString(),
    can: { edit: writable && !purged, share: writable && !purged && !!site.currentVersion },
    hostIssue: issue,
  }
}

export async function getSite(actor: CurrentUser, siteId: string): Promise<SiteView> {
  return toSiteView(actor, await visibleSite(actor, siteId))
}

/** The fiche's latest site, and whether a new one can be started. */
export async function getLeadStudio(actor: CurrentUser, leadId: string): Promise<LeadStudio> {
  requireStudio(actor)
  const lead = await visibleLead(actor, leadId)
  const [site, audit] = await Promise.all([
    prisma.generatedSite.findFirst({ where: { leadId: lead.id, workspaceId: actor.workspaceId }, orderBy: { createdAt: "desc" }, include: { lead: { select: { id: true, ownerId: true } } } }),
    latestFor(actor.workspaceId, lead),
  ])
  const writable = canAccessRecord(actor, "studio:generate", lead.ownerId)
  const blocked = !lead.companyId ? "La fiche n’a pas d’entreprise : le Studio a besoin de son nom et de son site." : !audit ? NO_AUDIT_FOR_STUDIO : !aiConfigured() ? "L’IA n’est pas configurée sur ce serveur." : null
  return { site: site ? await toSiteView(actor, site) : null, blocked, canGenerate: writable && !blocked }
}

export async function listSites(actor: CurrentUser, opts: { limit?: number } = {}): Promise<SiteSummary[]> {
  requireStudio(actor)
  const filter = recordFilter(actor, "lead:read")
  const lead: Prisma.LeadWhereInput = filter.kind === "owner" ? { ownerId: filter.ownerId } : filter.kind === "ownerOrPool" ? { OR: [{ ownerId: filter.ownerId }, { ownerId: null }] } : filter.kind === "none" ? { id: "" } : {}
  const sites = await prisma.generatedSite.findMany({
    where: { workspaceId: actor.workspaceId, lead },
    orderBy: { updatedAt: "desc" },
    take: Math.min(opts.limit ?? 60, 200),
    select: { id: true, leadId: true, companyName: true, status: true, currentVersion: true, createdAt: true, updatedAt: true, createdById: true, visitCount: true, lastVisitAt: true, linkExpiresAt: true, lastRunId: true, lead: { select: { company: { select: { name: true } } } } },
  })
  const runs = await prisma.agentRun.findMany({ where: { id: { in: sites.map((s) => s.lastRunId).filter((id): id is string => !!id) } }, select: { id: true, status: true } })
  const byId = new Map(runs.map((r) => [r.id, r]))
  const people = await names(sites.map((s) => s.createdById))
  return sites.map((s) => ({
    id: s.id,
    lead: { id: s.leadId, name: s.lead.company?.name ?? s.companyName },
    companyName: s.companyName,
    state: stateOf(s.status, s.lastRunId ? (byId.get(s.lastRunId) ?? null) : null, !!s.currentVersion),
    version: s.currentVersion,
    thumb: s.currentVersion && s.status !== "PURGED" ? renderPath(s.id, s.currentVersion, "thumb") : null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    createdBy: s.createdById ? (people.get(s.createdById) ?? null) : null,
    visits: s.visitCount,
    lastVisitAt: iso(s.lastVisitAt),
    linkExpiresAt: iso(s.linkExpiresAt),
  }))
}

// ── Actions ──────────────────────────────────────────────────────────────────────────────────────────────────────

async function queue(actor: CurrentUser, site: { id: string; leadId: string }, input: Prisma.InputJsonValue): Promise<string> {
  const run = await startRun(actor, { agentId: "designer", leadId: site.leadId, status: "QUEUED", input })
  return run.id
}

/**
 * A new site for the fiche: the Designer reads its site and writes a brief, which waits for the person. Refused before
 * anything is spent without an audit.
 */
export async function startStudio(actor: CurrentUser, leadId: string): Promise<{ siteId: string; runId: string }> {
  requireStudio(actor)
  const lead = await visibleLead(actor, leadId)
  if (!canAccessRecord(actor, "studio:generate", lead.ownerId)) throw new LeadError("forbidden", "Cette fiche ne vous est pas attribuée : l’IA ne peut pas y travailler pour vous.", 403)
  const row = await prisma.lead.findUnique({ where: { id: lead.id }, select: { company: { select: { name: true } } } })
  if (!row?.company) throw new LeadError("conflict", "La fiche n’a pas d’entreprise : le Studio a besoin de son nom et de son site.", 409)
  const audit = await latestFor(actor.workspaceId, lead)
  if (!audit) throw new LeadError("conflict", NO_AUDIT_FOR_STUDIO, 409)
  const site = await prisma.generatedSite.create({
    data: { workspaceId: actor.workspaceId, leadId: lead.id, auditId: audit.id, companyName: row.company.name, createdById: actor.id, purgeAfter: addDays(new Date(), PURGE_DAYS) },
    select: { id: true, leadId: true },
  })
  let runId: string
  try {
    runId = await queue(actor, site, { kind: "brief", siteId: site.id })
  } catch (error) {
    // Nothing was spent (budget, quota or a run already on the fiche): no empty site is left behind.
    await prisma.generatedSite.delete({ where: { id: site.id } })
    throw error
  }
  await prisma.generatedSite.update({ where: { id: site.id }, data: { lastRunId: runId } })
  await journal({ action: "studio.site_started", actorId: actor.id, workspaceId: actor.workspaceId, entityType: "GeneratedSite", entityId: site.id, metadata: { leadId: lead.id, runId } })
  return { siteId: site.id, runId }
}

/** The brief again, after a run that failed before writing it. */
export async function retryBrief(actor: CurrentUser, siteId: string): Promise<{ runId: string }> {
  const site = await editableSite(actor, siteId)
  if (site.status !== "BRIEFING") throw new LeadError("conflict", "Le brief de cette maquette est déjà écrit.", 409)
  const runId = await queue(actor, site, { kind: "brief", siteId: site.id })
  await prisma.generatedSite.update({ where: { id: site.id }, data: { lastRunId: runId } })
  return { runId }
}

/** The person's edits to the brief: the images and fonts must be ones the site has. */
export async function updateBrief(actor: CurrentUser, siteId: string, brief: Brief, ip?: string | null): Promise<SiteView> {
  const site = await editableSite(actor, siteId)
  if (site.status === "BRIEFING") throw new LeadError("conflict", "Le brief n’est pas encore écrit.", 409)
  const collected = collectedSchema.safeParse(site.collected)
  const fonts = new Set(allowedFonts(collected.success ? collected.data.fonts : []))
  if (!fonts.has(brief.fonts.heading) || !fonts.has(brief.fonts.body)) throw new LeadError("invalid", "Choisissez les polices dans la liste proposée.", 400)
  const assets = new Set((await prisma.generatedSiteAsset.findMany({ where: { siteId: site.id, kind: { in: ["logo", "image"] } }, select: { name: true } })).map((a) => a.name))
  const unknown = brief.images.find((i) => !assets.has(i.name))
  if (unknown) throw new LeadError("invalid", `L’image « ${unknown.name} » n’existe pas pour cette maquette.`, 400)
  const updated = await prisma.generatedSite.update({ where: { id: site.id }, data: { brief, briefEditedAt: new Date(), briefEditedById: actor.id }, include: { lead: { select: { id: true, ownerId: true } } } })
  await journal({ action: "studio.brief_edited", actorId: actor.id, workspaceId: actor.workspaceId, entityType: "GeneratedSite", entityId: site.id, metadata: { sections: brief.sections.length }, ip })
  return toSiteView(actor, updated)
}

/** A version written from the brief: the first one, or a new start after the brief changed. */
export async function requestBuild(actor: CurrentUser, siteId: string): Promise<{ runId: string }> {
  const site = await editableSite(actor, siteId)
  if (site.status === "BRIEFING") throw new LeadError("conflict", "Le brief n’est pas encore écrit.", 409)
  if (!briefSchema.safeParse(site.brief).success) throw new LeadError("conflict", "Le brief est incomplet : relisez-le avant de générer la maquette.", 409)
  const runId = await queue(actor, site, { kind: "build", siteId: site.id })
  await prisma.generatedSite.update({ where: { id: site.id }, data: { status: "BUILDING", lastRunId: runId } })
  return { runId }
}

/** A version that changes the current one as the person asks (« passe le bouton en vert »). */
export async function requestRevision(actor: CurrentUser, siteId: string, instruction: string): Promise<{ runId: string }> {
  const site = await editableSite(actor, siteId)
  if (!site.currentVersion) throw new LeadError("conflict", "Générez d’abord la maquette avant de la modifier.", 409)
  const runId = await queue(actor, site, { kind: "revise", siteId: site.id, instruction })
  await prisma.generatedSite.update({ where: { id: site.id }, data: { status: "BUILDING", lastRunId: runId } })
  await journal({ action: "studio.revision_requested", actorId: actor.id, workspaceId: actor.workspaceId, entityType: "GeneratedSite", entityId: site.id, metadata: { runId } })
  return { runId }
}

/**
 * The share link: created valid 30 days, or extended by 30 days from now (same address). Sending it to the prospect
 * stays an email the person writes and sends.
 */
export async function shareLink(actor: CurrentUser, siteId: string, action: "create" | "extend", ip?: string | null): Promise<LinkView> {
  const site = await visibleSite(actor, siteId)
  if (!canAccessRecord(actor, "studio:generate", site.lead.ownerId)) throw new LeadError("forbidden", "Cette fiche ne vous est pas attribuée.", 403)
  if (site.status === "PURGED") throw new LeadError("conflict", "Cette maquette a été supprimée après 90 jours.", 409)
  if (!site.currentVersion) throw new LeadError("conflict", "Générez d’abord la maquette avant de la partager.", 409)
  const now = new Date()
  const expiresAt = addDays(now, LINK_DAYS)
  const fresh = action === "create" || !site.linkNonce
  const nonce = fresh ? newNonce() : site.linkNonce!
  const updated = await prisma.generatedSite.update({
    where: { id: site.id },
    data: {
      linkNonce: nonce,
      tokenHash: hashToken(shareToken(site.id, nonce)),
      linkExpiresAt: expiresAt,
      ...(fresh ? { linkCreatedAt: now, linkCreatedById: actor.id } : {}),
      purgeAfter: addDays(now, PURGE_DAYS) > site.purgeAfter ? addDays(now, PURGE_DAYS) : site.purgeAfter,
    },
  })
  const until = expiresAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" })
  await prisma.activity.create({ data: { workspaceId: actor.workspaceId, leadId: site.leadId, actorId: actor.id, actorKind: "USER", kind: "SYSTEM", body: fresh ? `Lien de la maquette créé, valable jusqu’au ${until}` : `Lien de la maquette prolongé jusqu’au ${until}`, data: { siteId: site.id } } })
  await journal({ action: fresh ? "studio.link_created" : "studio.link_extended", actorId: actor.id, workspaceId: actor.workspaceId, entityType: "GeneratedSite", entityId: site.id, metadata: { expiresAt: expiresAt.toISOString() }, ip })
  return linkView(updated, await names([updated.linkCreatedById]), now)!
}

/** The link stops working at once; a new one has another address. */
export async function revokeLink(actor: CurrentUser, siteId: string, ip?: string | null): Promise<void> {
  const site = await visibleSite(actor, siteId)
  if (!canAccessRecord(actor, "studio:generate", site.lead.ownerId)) throw new LeadError("forbidden", "Cette fiche ne vous est pas attribuée.", 403)
  await prisma.generatedSite.update({ where: { id: site.id }, data: { linkNonce: null, tokenHash: null, linkExpiresAt: null, linkCreatedAt: null, linkCreatedById: null } })
  await journal({ action: "studio.link_revoked", actorId: actor.id, workspaceId: actor.workspaceId, entityType: "GeneratedSite", entityId: site.id, ip })
}

/** Puts an earlier version back online: the link shows it from now on. */
export async function publishVersion(actor: CurrentUser, siteId: string, number: number, ip?: string | null): Promise<void> {
  const site = await editableSite(actor, siteId)
  const version = await prisma.generatedSiteVersion.findUnique({ where: { siteId_number: { siteId: site.id, number } }, select: { html: true } })
  if (!version?.html) throw new LeadError("not_found", "Version introuvable", 404)
  await prisma.generatedSite.update({ where: { id: site.id }, data: { currentVersion: number, status: "READY" } })
  await journal({ action: "studio.version_published", actorId: actor.id, workspaceId: actor.workspaceId, entityType: "GeneratedSite", entityId: site.id, metadata: { version: number }, ip })
}

/** The fiche's live share link, for the email composer; null without the right or without a link that works. */
export async function activeShareLink(actor: CurrentUser, leadId: string): Promise<{ url: string; expiresAt: string } | null> {
  if (!can(actor.role, "studio:generate")) return null
  const site = await prisma.generatedSite.findFirst({
    where: { leadId, workspaceId: actor.workspaceId, status: { not: "PURGED" }, tokenHash: { not: null }, linkExpiresAt: { gt: new Date() } },
    orderBy: { linkCreatedAt: "desc" },
    select: { id: true, linkNonce: true, tokenHash: true, linkExpiresAt: true },
  })
  if (!site?.linkNonce || !site.tokenHash || !site.linkExpiresAt) return null
  try {
    const token = shareToken(site.id, site.linkNonce)
    const url = hashToken(token) === site.tokenHash ? previewUrl(token) : null
    return url ? { url, expiresAt: site.linkExpiresAt.toISOString() } : null
  } catch {
    return null
  }
}

// ── Files ────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function versionRender(actor: CurrentUser, siteId: string, number: number, kind: "desktop" | "mobile" | "thumb"): Promise<Uint8Array> {
  const site = await visibleSite(actor, siteId)
  const version = await prisma.generatedSiteVersion.findUnique({ where: { siteId_number: { siteId: site.id, number } }, select: { desktop: kind === "desktop", mobile: kind === "mobile", thumb: kind === "thumb" } })
  const data = version?.[kind]
  if (!data) throw new LeadError("not_found", "Capture introuvable", 404)
  return new Uint8Array(data)
}

/** An image of the site, for the brief's editor. */
export async function siteAsset(actor: CurrentUser, siteId: string, name: string): Promise<{ data: Uint8Array; mediaType: string }> {
  const site = await visibleSite(actor, siteId)
  const asset = await prisma.generatedSiteAsset.findUnique({ where: { siteId_name: { siteId: site.id, name } }, select: { data: true, mediaType: true, kind: true } })
  if (!asset || asset.kind === "font") throw new LeadError("not_found", "Image introuvable", 404)
  return { data: new Uint8Array(asset.data), mediaType: asset.mediaType }
}

/**
 * The page as the CRM frames it: images and fonts inlined (a sandboxed frame sends no cookie for them), no visit
 * beacon. It never counts as a visit.
 */
export async function internalPreview(actor: CurrentUser, siteId: string, number: number): Promise<string> {
  const site = await visibleSite(actor, siteId)
  const [version, assets] = await Promise.all([
    prisma.generatedSiteVersion.findUnique({ where: { siteId_number: { siteId: site.id, number } }, select: { html: true } }),
    prisma.generatedSiteAsset.findMany({ where: { siteId: site.id }, select: { name: true, mediaType: true, data: true } }),
  ])
  if (!version?.html) throw new LeadError("not_found", "Version introuvable", 404)
  const files = new Map(assets.map((a) => [a.name, `data:${a.mediaType};base64,${Buffer.from(a.data).toString("base64")}`]))
  return withAssets(version.html, (name) => files.get(name) ?? null)
}
