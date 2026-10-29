import { Prisma, type LeadStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { companyDomain, nameKey } from "@/lib/crm/normalize"
import { LeadError } from "./errors"
import { MATCH_LABELS, type MatchReason } from "./keys"
import { rescore } from "./service"

export interface DuplicateMember {
  leadId: string
  name: string
  city: string | null
  email: string | null
  phone: string | null
  website: string | null
  status: LeadStatus
  score: number
  ownerName: string | null
  activities: number
  createdAt: string
}
export interface DuplicateGroup {
  id: string
  reasons: string[]
  members: DuplicateMember[]
}

const STRONG_KEYS = ["siret", "domain", "nameKey", "phone"] as const satisfies readonly MatchReason[]

/**
 * Fiches that look like the same business: same SIRET, website, name and city, or phone. Groups that share a fiche are
 * merged into one (A=B and B=C is one group of three). Nothing is merged automatically: a person decides.
 */
export async function findDuplicateGroups(user: CurrentUser): Promise<DuplicateGroup[]> {
  const ws = user.workspaceId
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let root = x
    while (parent.get(root) !== root) root = parent.get(root)!
    parent.set(x, root)
    return root
  }
  const reasonsOf = new Map<string, Set<string>>()

  for (const key of STRONG_KEYS) {
    const column = Prisma.raw(`c."${key}"`) // `key` comes from the constant list above
    const groups = await prisma.$queryRaw<{ ids: string[] }[]>`
      SELECT array_agg(c.id) AS ids
      FROM "Company" c
      WHERE c."workspaceId" = ${ws} AND ${column} IS NOT NULL AND EXISTS (SELECT 1 FROM "Lead" l WHERE l."companyId" = c.id)
      GROUP BY ${column} HAVING count(*) > 1
      LIMIT 500`
    for (const { ids } of groups) {
      for (const id of ids) if (!parent.has(id)) parent.set(id, id)
      for (const id of ids.slice(1)) parent.set(find(id), find(ids[0]))
      const root = find(ids[0])
      reasonsOf.set(root, new Set([...(reasonsOf.get(root) ?? []), MATCH_LABELS[key]]))
    }
  }
  if (parent.size === 0) return []

  const byRoot = new Map<string, string[]>()
  for (const id of parent.keys()) byRoot.set(find(id), [...(byRoot.get(find(id)) ?? []), id])
  const allReasons = new Map<string, Set<string>>()
  for (const [root, set] of reasonsOf) allReasons.set(find(root), new Set([...(allReasons.get(find(root)) ?? []), ...set]))

  const companies = await prisma.company.findMany({
    where: { id: { in: [...parent.keys()] }, workspaceId: ws },
    include: { leads: { include: { owner: { select: { name: true, email: true } }, contact: { select: { name: true, email: true, phone: true } }, _count: { select: { activities: true } } }, take: 1 } },
  })
  const groups: DuplicateGroup[] = []
  for (const [root, ids] of byRoot) {
    if (ids.length < 2) continue
    const members = companies
      .filter((c) => ids.includes(c.id) && c.leads[0])
      .map((c): DuplicateMember => {
        const l = c.leads[0]
        return {
          leadId: l.id, name: c.name, city: c.city, email: l.contact?.email ?? c.email, phone: l.contact?.phone ?? c.phone, website: c.website, status: l.status,
          score: l.score, ownerName: l.owner?.name ?? l.owner?.email ?? null, activities: l._count.activities, createdAt: l.createdAt.toISOString(),
        }
      })
      // The best fiche first: it is the one proposed to keep.
      .sort((a, b) => b.activities - a.activities || b.score - a.score || a.createdAt.localeCompare(b.createdAt))
    if (members.length >= 2) groups.push({ id: root, reasons: [...(allReasons.get(root) ?? [])], members })
  }
  return groups.sort((a, b) => b.members.length - a.members.length).slice(0, 100)
}

const ORDER: LeadStatus[] = ["NEW", "CONTACTED", "REPLIED", "QUALIFIED"]
/** The merged status: a block always wins, then the furthest in the funnel, then the kept one. */
export function mergedStatus(keep: LeadStatus, drop: LeadStatus): LeadStatus {
  if (keep === "DO_NOT_CONTACT" || drop === "DO_NOT_CONTACT") return "DO_NOT_CONTACT"
  const a = ORDER.indexOf(keep)
  const b = ORDER.indexOf(drop)
  return a === -1 ? keep : b > a ? drop : keep
}

/** Folds `dropId` into `keepId`: history, meetings, opportunities, contacts and missing information move; the dropped fiche disappears. */
export async function mergeLeads(user: CurrentUser, keepId: string, dropId: string, ip?: string | null): Promise<void> {
  if (keepId === dropId) throw new LeadError("invalid", "Choisissez deux fiches différentes.")
  const ws = user.workspaceId
  await prisma.$transaction(async (tx) => {
    const [keep, drop] = await Promise.all(
      [keepId, dropId].map((id) => tx.lead.findFirst({ where: { id, workspaceId: ws }, include: { company: true, contact: true } }))
    )
    if (!keep || !drop) throw new LeadError("not_found", "Fiche introuvable.", 404)

    await tx.activity.updateMany({ where: { leadId: drop.id }, data: { leadId: keep.id } })
    await tx.task.updateMany({ where: { leadId: drop.id }, data: { leadId: keep.id } })
    await tx.meeting.updateMany({ where: { leadId: drop.id }, data: { leadId: keep.id } })
    await tx.deal.updateMany({ where: { leadId: drop.id }, data: { leadId: keep.id } })

    // Contacts follow the business.
    const targetCompanyId = keep.companyId ?? drop.companyId
    if (drop.companyId && targetCompanyId && drop.companyId !== targetCompanyId) {
      await tx.contact.updateMany({ where: { companyId: drop.companyId }, data: { companyId: targetCompanyId } })
    }
    const keptContactId = keep.contactId ?? drop.contactId

    // Missing company information is completed from the dropped fiche; nothing the kept fiche has is overwritten.
    const fields = ["website", "phone", "email", "address", "city", "postalCode", "sector", "siret"] as const
    const fill: Record<string, string> = {}
    if (keep.company && drop.company) {
      for (const f of fields) if (!keep.company[f] && drop.company[f]) fill[f] = drop.company[f]!
      const website = fill.website ?? keep.company.website
      const email = fill.email ?? keep.company.email
      if (fill.website || fill.email) fill.domain = companyDomain(website, email) ?? ""
      if (fill.city) fill.nameKey = nameKey(keep.company.name, fill.city) ?? ""
    }

    await tx.lead.delete({ where: { id: drop.id } })
    await tx.lead.update({
      where: { id: keep.id },
      data: {
        companyId: targetCompanyId, contactId: keptContactId, ownerId: keep.ownerId ?? drop.ownerId,
        status: mergedStatus(keep.status, drop.status), tags: [...new Set([...keep.tags, ...drop.tags])].slice(0, 20),
        lastContactedAt: [keep.lastContactedAt, drop.lastContactedAt].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
        qualification: keep.qualification ?? drop.qualification ?? undefined,
      },
    })
    if (drop.companyId && drop.companyId !== targetCompanyId) {
      if ((await tx.lead.count({ where: { companyId: drop.companyId } })) === 0) await tx.company.delete({ where: { id: drop.companyId } })
    }
    if (keep.company && Object.keys(fill).length) {
      await tx.company.update({ where: { id: keep.company.id }, data: Object.fromEntries(Object.entries(fill).map(([k, v]) => [k, v === "" ? null : v])) })
    }
    await tx.activity.create({
      data: { workspaceId: ws, leadId: keep.id, actorId: user.id, actorKind: "USER", kind: "SYSTEM", body: `Fusionnée avec « ${drop.company?.name ?? drop.contact?.name ?? "fiche"} »`, data: { merged: drop.id } },
    })
    await rescore(tx, keep.id)
  })
  await audit({ action: "lead.merged", actorId: user.id, workspaceId: ws, entityType: "Lead", entityId: keepId, metadata: { dropped: dropId }, ip })
}
