import { z } from "zod"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { addDays, dayKey } from "@/lib/crm/day"
import { getExtractorClient } from "@/lib/extractor/client"
import { LeadError } from "@/features/leads/errors"
import { fetchNotices, type BodaccDeps, type BodaccNotice } from "@/features/enrichment/sources/bodacc"
import { WATCH_FAMILIES, WATCH_KINDS, activityMatches, signalsOf, type WatchKind, type WatchSector } from "./kinds"
import { FIRST_DAYS, sectorsOf, watchKinds, type WatchReport } from "./watch"

/** A campaign's watch as people set it (E30, D50): the site's side, with the Extractor's sectors. */
export const DEPARTMENT = /^(0[1-9]|[1-8]\d|9[0-5]|2A|2B|97[1-6])$/

export const watchInputSchema = z.object({
  kinds: z.array(z.enum(WATCH_KINDS)).min(1, "Choisissez au moins un type d’événement.").max(WATCH_KINDS.length),
  departments: z
    .array(z.string().trim().toUpperCase().regex(DEPARTMENT, "Département invalide : 69, 2A, 974…"))
    .min(1, "Choisissez au moins un département.")
    .max(5, "Cinq départements au plus."),
  sectors: z.array(z.string().min(1).max(60)).max(10, "Dix secteurs au plus.").default([]),
  active: z.boolean(),
})
export type WatchInput = z.infer<typeof watchInputSchema>

export interface WatchView {
  kinds: WatchKind[]
  departments: string[]
  sectors: { key: string; label: string }[]
  active: boolean
  owner: { id: string; name: string } | null
  nextRunAt: string | null
  lastRunAt: string | null
  lastReport: WatchReport | null
  can: { manage: boolean }
}

export interface WatchPreview {
  from: string
  to: string
  /** Notices of the zone and the kinds, before the sectors. */
  total: number
  /** Those whose activity names one of the sectors (all of them without sectors), before the check in the annuaire. */
  matching: number
  /** With sectors: notices that declare no activity (often holdings), left to the activity code in the annuaire. */
  withoutActivity: number
  byKind: Partial<Record<WatchKind, number>>
  sample: { name: string; city: string | null; activity: string | null; publishedOn: string; kind: WatchKind; url: string }[]
  truncated: boolean
}

const mayManage = (u: CurrentUser) => can(u.role, "campaign:manage") && can(u.role, "lead:import")
const kindOf = (n: BodaccNotice): WatchKind => (n.family === "vente" ? "TAKEOVER" : "CREATED")

export async function getWatch(user: CurrentUser, campaignId: string): Promise<WatchView | null> {
  const w = await prisma.campaignWatch.findFirst({ where: { campaignId, workspaceId: user.workspaceId }, include: { owner: { select: { id: true, name: true, email: true } } } })
  if (!w) return null
  return {
    kinds: watchKinds(w),
    departments: w.departments,
    sectors: sectorsOf(w.sectors).map((s) => ({ key: s.key, label: s.label })),
    active: w.active,
    owner: w.owner ? { id: w.owner.id, name: w.owner.name ?? w.owner.email ?? "" } : null,
    nextRunAt: w.nextRunAt?.toISOString() ?? null,
    lastRunAt: w.lastRunAt?.toISOString() ?? null,
    lastReport: (w.lastReport as WatchReport | null) ?? null,
    can: { manage: mayManage(user) },
  }
}

/** The Extractor's sectors, with their activity codes and the words they are described with. */
export async function resolveSectors(keys: string[]): Promise<WatchSector[]> {
  if (!keys.length) return []
  const all = await getExtractorClient()
    .sectors()
    .catch(() => {
      throw new LeadError("conflict", "Secteurs indisponibles : l’Extractor ne répond pas. Réessayez, ou enregistrez la veille sans secteur.", 409)
    })
  const byKey = new Map(all.map((s) => [s.key, s]))
  return [...new Set(keys)].map((k) => {
    const s = byKey.get(k)
    if (!s) throw new LeadError("invalid", `Secteur inconnu : ${k}`, 400)
    return { key: s.key, label: s.label, naf: s.naf ?? [], keywords: s.synonyms ?? [] }
  })
}

/**
 * Saves the watch; the person saving it becomes its owner, the one it acts for. A watch switched on, or whose zone,
 * sectors or kinds changed, reads the last seven days again within the minute, then runs each morning.
 */
export async function saveWatch(user: CurrentUser, campaignId: string, input: WatchInput, ip?: string | null): Promise<WatchView> {
  if (!mayManage(user)) throw new LeadError("forbidden", "Votre rôle ne permet pas d’importer des fiches dans une campagne.", 403)
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId: user.workspaceId }, select: { id: true, name: true, archivedAt: true } })
  if (!campaign) throw new LeadError("not_found", "Campagne introuvable.", 404)
  if (campaign.archivedAt && input.active) throw new LeadError("conflict", `La campagne « ${campaign.name} » est archivée : restaurez-la avant d’activer sa veille.`, 409)
  const sectors = await resolveSectors(input.sectors)
  const before = await prisma.campaignWatch.findUnique({ where: { campaignId } })
  const key = (k: string[], d: string[], s: string[]) => JSON.stringify([[...k].sort(), [...d].sort(), [...s].sort()])
  const changed = !before || key(before.kinds, before.departments, sectorsOf(before.sectors).map((s) => s.key)) !== key(input.kinds, input.departments, sectors.map((s) => s.key))
  const restart = input.active && (changed || !before?.active)
  const data = {
    kinds: input.kinds,
    departments: [...new Set(input.departments)],
    sectors: sectors as unknown as Prisma.InputJsonValue,
    active: input.active,
    ownerId: user.id,
    nextRunAt: input.active ? (restart ? new Date() : (before?.nextRunAt ?? new Date())) : null,
    ...(changed ? { cursorDay: null } : {}),
  }
  await prisma.campaignWatch.upsert({ where: { campaignId }, create: { workspaceId: user.workspaceId, campaignId, ...data }, update: data })
  await audit({
    action: "campaign.watch_saved",
    actorId: user.id,
    workspaceId: user.workspaceId,
    entityType: "Campaign",
    entityId: campaignId,
    metadata: { kinds: input.kinds, departments: data.departments, sectors: sectors.map((s) => s.key), active: input.active },
    ip,
  })
  return (await getWatch(user, campaignId))!
}

/**
 * What the watch would have found over the last seven days, from the BODACC alone: the sectors are recognised in the
 * notices' activity, before the check in the annuaire that the real pass makes. Nothing is written.
 */
export async function previewWatch(user: CurrentUser, campaignId: string, input: WatchInput, now = new Date(), deps: { bodacc?: BodaccDeps } = {}): Promise<WatchPreview> {
  if (!mayManage(user)) throw new LeadError("forbidden", "Votre rôle ne permet pas d’importer des fiches dans une campagne.", 403)
  if (!(await prisma.campaign.count({ where: { id: campaignId, workspaceId: user.workspaceId } }))) throw new LeadError("not_found", "Campagne introuvable.", 404)
  const sectors = await resolveSectors(input.sectors)
  const to = dayKey(now)
  const from = addDays(to, -FIRST_DAYS)
  const families = input.kinds.flatMap((k) => WATCH_FAMILIES[k])
  const pages = await Promise.all(
    [...new Set(input.departments)].map((d) =>
      fetchNotices({ families, departments: [d], from, to }, deps.bodacc).catch(() => {
        throw new LeadError("conflict", "Le BODACC ne répond pas pour l’instant : réessayez dans un moment.", 409)
      })
    )
  )
  const notices = pages.flatMap((p) => p.notices).filter((n) => n.sirens[0] && signalsOf(n).length > 0)
  const matching = sectors.length ? notices.filter((n) => n.activity && activityMatches(n.activity, sectors)) : notices
  const byKind: Partial<Record<WatchKind, number>> = {}
  for (const n of matching) byKind[kindOf(n)] = (byKind[kindOf(n)] ?? 0) + 1
  return {
    from,
    to,
    total: notices.length,
    matching: matching.length,
    withoutActivity: sectors.length ? notices.filter((n) => !n.activity).length : 0,
    byKind,
    sample: [...matching]
      .sort((a, b) => b.publishedOn.localeCompare(a.publishedOn))
      .slice(0, 12)
      .map((n) => ({ name: n.tradeName ?? n.name, city: n.city, activity: n.activity, publishedOn: n.publishedOn, kind: kindOf(n), url: n.url })),
    truncated: pages.some((p) => p.truncated),
  }
}
