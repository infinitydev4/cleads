import type { Offer, OfferStatus, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { LeadError } from "@/features/leads/errors"
import { pricedUnlessQuote, pricesInOrder, objectionSchema, type CreateOfferInput, type UpdateOfferInput } from "./schemas"
import type { SkillOffer } from "./skill"

/**
 * The offers catalogue (docs/crm-v1/AGENTS-IA.md §14): what agents may recommend. Everyone who uses AI reads it; owners
 * and managers edit it (offer:manage). An offer is a draft until someone checks and activates it, and agents only ever
 * see active offers: list_offers, the skill offres-cleads and assertActiveOffers all read the same filter.
 */
export interface OfferView extends SkillOffer {
  id: string
  status: OfferStatus
  sortOrder: number
  reviewedAt: string | null
  reviewedBy: string | null
  updatedAt: string
  /** E21: how often the Conseiller offres suggested it, and what people decided (to measure relevance, E27). */
  stats: OfferStats
}

export interface OfferStats {
  suggested: number
  accepted: number
  rejected: number
}

type Db = Prisma.TransactionClient | typeof prisma

const objectionsOf = (value: unknown) => (Array.isArray(value) ? value.flatMap((x) => (objectionSchema.safeParse(x).success ? [x as SkillOffer["objections"][number]] : [])) : [])

const toSkillOffer = (o: Offer): SkillOffer => ({
  slug: o.slug,
  name: o.name,
  category: o.category,
  summary: o.summary,
  deliverables: o.deliverables,
  signals: o.signals,
  priceMinEur: o.priceMinEur,
  priceMaxEur: o.priceMaxEur,
  billing: o.billing,
  priceNote: o.priceNote,
  angle: o.angle,
  objections: objectionsOf(o.objections),
})

const NO_STATS: OfferStats = { suggested: 0, accepted: 0, rejected: 0 }

const toView = (o: Offer, names: Map<string, string>, stats: Map<string, OfferStats> = new Map()): OfferView => ({
  id: o.id,
  ...toSkillOffer(o),
  status: o.status,
  sortOrder: o.sortOrder,
  reviewedAt: o.reviewedAt?.toISOString() ?? null,
  reviewedBy: o.reviewedById ? (names.get(o.reviewedById) ?? "Ancien membre") : null,
  updatedAt: o.updatedAt.toISOString(),
  stats: stats.get(o.id) ?? NO_STATS,
})

/** Suggestions of each offer, all pitches together; `suggested` counts every one, decided or not. */
async function offerStats(workspaceId: string, offerIds: string[]): Promise<Map<string, OfferStats>> {
  if (!offerIds.length) return new Map()
  const groups = await prisma.offerRecommendation.groupBy({ by: ["offerId", "status"], where: { workspaceId, offerId: { in: offerIds } }, _count: { _all: true } })
  const stats = new Map<string, OfferStats>()
  for (const g of groups) {
    if (!g.offerId) continue
    const s = stats.get(g.offerId) ?? { ...NO_STATS }
    s.suggested += g._count._all
    if (g.status === "ACCEPTED") s.accepted += g._count._all
    if (g.status === "REJECTED") s.rejected += g._count._all
    stats.set(g.offerId, s)
  }
  return stats
}

async function peopleNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))]
  if (!unique.length) return new Map()
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, email: true } })
  return new Map(users.map((u) => [u.id, u.name ?? u.email ?? "Membre"]))
}

const ORDER = [{ sortOrder: "asc" }, { createdAt: "asc" }] satisfies Prisma.OfferOrderByWithRelationInput[]

/** The catalogue, in the order of the team: drafts and active offers, or the archive. */
export async function listOffers(actor: CurrentUser, opts: { archived?: boolean } = {}): Promise<OfferView[]> {
  if (!can(actor.role, "ai:use")) throw new LeadError("forbidden", "Accès refusé", 403)
  const rows = await prisma.offer.findMany({ where: { workspaceId: actor.workspaceId, status: opts.archived ? "ARCHIVED" : { not: "ARCHIVED" } }, orderBy: ORDER })
  const [names, stats] = await Promise.all([peopleNames(rows.map((r) => r.reviewedById)), offerStats(actor.workspaceId, rows.map((r) => r.id))])
  return rows.map((r) => toView(r, names, stats))
}

/** What agents may recommend: active offers only. */
export async function activeOffers(workspaceId: string, db: Db = prisma): Promise<SkillOffer[]> {
  const rows = await db.offer.findMany({ where: { workspaceId, status: "ACTIVE" }, orderBy: ORDER })
  return rows.map(toSkillOffer)
}

/**
 * The guard of every recommendation (E21): each identifier must name an active offer of the workspace. Agents speak in
 * identifiers (slugs), which never change.
 */
export async function assertActiveOffers(workspaceId: string, slugs: readonly string[]): Promise<Map<string, { id: string; name: string }>> {
  const wanted = [...new Set(slugs)]
  const rows = await prisma.offer.findMany({ where: { workspaceId, slug: { in: wanted }, status: "ACTIVE" }, select: { id: true, slug: true, name: true } })
  const found = new Map(rows.map((r) => [r.slug, { id: r.id, name: r.name }]))
  const missing = wanted.filter((s) => !found.has(s))
  if (missing.length) throw new LeadError("conflict", `Offre inconnue ou non active : ${missing.join(", ")}. Seules les offres actives du catalogue peuvent être recommandées.`, 409)
  return found
}

/** "Refonte de site" → "refonte-de-site". */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "")
  return slug || "offre"
}

const requireManage = (actor: CurrentUser) => {
  if (!can(actor.role, "offer:manage")) throw new LeadError("forbidden", "Seuls le propriétaire et les managers modifient le catalogue d’offres.", 403)
}

const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === "P2002"

function cleanPrices<T extends { priceMinEur: number | null; priceMaxEur: number | null; billing: string }>(o: T): T {
  // On quote, no price is shown: none is stored either.
  return o.billing === "QUOTE" ? { ...o, priceMinEur: null, priceMaxEur: null } : o
}

export async function createOffer(actor: CurrentUser, input: CreateOfferInput, ip?: string | null): Promise<OfferView> {
  requireManage(actor)
  const now = new Date()
  const status = input.status ?? "DRAFT"
  const last = await prisma.offer.aggregate({ where: { workspaceId: actor.workspaceId }, _max: { sortOrder: true } })
  const data = cleanPrices({ ...input, priceNote: input.priceNote ?? null, angle: input.angle ?? null })
  const row = await prisma.offer
    .create({
      data: {
        workspaceId: actor.workspaceId,
        slug: slugify(input.name),
        name: data.name,
        category: data.category,
        summary: data.summary,
        deliverables: data.deliverables,
        signals: data.signals,
        priceMinEur: data.priceMinEur,
        priceMaxEur: data.priceMaxEur,
        billing: data.billing,
        priceNote: data.priceNote,
        angle: data.angle,
        objections: data.objections,
        status,
        sortOrder: input.sortOrder ?? (last._max.sortOrder ?? 0) + 10,
        createdById: actor.id,
        updatedById: actor.id,
        ...(status === "ACTIVE" ? { reviewedById: actor.id, reviewedAt: now } : {}),
      },
    })
    .catch((error: unknown) => {
      if (isUniqueViolation(error)) throw new LeadError("conflict", "Une offre porte déjà ce nom (ou un nom très proche) : choisissez-en un autre.", 409)
      throw error
    })
  await audit({ action: "offer.created", actorId: actor.id, workspaceId: actor.workspaceId, entityType: "Offer", entityId: row.id, metadata: { slug: row.slug, status }, ip })
  return toView(row, await peopleNames([row.reviewedById]))
}

/**
 * Edits an offer. Activating it records who checked it; editing an active offer counts as checking it again, since its
 * content is what agents will say from now on.
 */
export async function updateOffer(actor: CurrentUser, offerId: string, input: UpdateOfferInput, ip?: string | null): Promise<OfferView> {
  requireManage(actor)
  const before = await prisma.offer.findFirst({ where: { id: offerId, workspaceId: actor.workspaceId } })
  if (!before) throw new LeadError("not_found", "Offre introuvable", 404)
  const merged = cleanPrices({
    priceMinEur: input.priceMinEur === undefined ? before.priceMinEur : input.priceMinEur,
    priceMaxEur: input.priceMaxEur === undefined ? before.priceMaxEur : input.priceMaxEur,
    billing: input.billing ?? before.billing,
  })
  if (!pricesInOrder(merged)) throw new LeadError("invalid", "Le prix maximum doit dépasser le minimum", 400)
  if (!pricedUnlessQuote(merged)) throw new LeadError("invalid", "Indiquez un prix, ou choisissez « Sur devis »", 400)
  const changes = Object.entries(input)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => k)
  const status = input.status ?? before.status
  const checked = status === "ACTIVE" && (before.status !== "ACTIVE" || changes.some((k) => k !== "status" && k !== "sortOrder"))
  const { status: _status, ...rest } = input
  const row = await prisma.offer.update({
    where: { id: before.id },
    data: { ...rest, ...merged, status, updatedById: actor.id, ...(checked ? { reviewedById: actor.id, reviewedAt: new Date() } : {}) },
  })
  await audit({
    action: before.status !== status ? `offer.${status === "ACTIVE" ? "activated" : status === "ARCHIVED" ? "archived" : "deactivated"}` : "offer.updated",
    actorId: actor.id,
    workspaceId: actor.workspaceId,
    entityType: "Offer",
    entityId: row.id,
    metadata: { slug: row.slug, changes, from: before.status, to: status },
    ip,
  })
  const [names, stats] = await Promise.all([peopleNames([row.reviewedById]), offerStats(actor.workspaceId, [row.id])])
  return toView(row, names, stats)
}
