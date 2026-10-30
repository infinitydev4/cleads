import type { LeadStatus, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { canAccessRecord, can, recordFilter, scopeOf } from "@/lib/rbac"
import { companyDomain, emailDomain, nameKey, normalizeEmail } from "@/lib/crm/normalize"
import { LeadError } from "./errors"
import { closeOpenDeals, ensureOpenDeal } from "@/features/pipeline/deals"
import { canWorkLead, closeOpenTasks, insertTask } from "@/features/activity/core"
import { NOT_A_CONTACT, type ActivityInput } from "@/features/activity/rules"
import { canChangeTask } from "@/features/activity/rules"
import { OPEN_STAGES } from "@/features/pipeline/rules"
import { MATCH_LABELS, cleanCompany, cleanContact, matchCompany, normalizeTags } from "./keys"
import { scoreLead } from "./scoring"
import type { BulkInput, CreateLeadInput, LeadFilters, LeadSort, UpdateLeadInput } from "./schemas"
import type { LeadDetail, LeadList, LeadRow } from "./types"

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null
const OWNER_ROLES = ["OWNER", "MANAGER", "SDR", "CLOSER"] as const

// ---------------------------------------------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------------------------------------------

/**
 * Restriction of a lead query to what the person may see. A closer sees the fiches they own plus those where
 * they hold an opportunity or host a meeting ("siens + liés"); writing is limited to ownership.
 */
export function scopeWhere(user: CurrentUser, permission: "lead:read" | "lead:write"): Prisma.LeadWhereInput {
  const f = recordFilter(user, permission)
  switch (f.kind) {
    case "all":
      return {}
    case "ownerOrPool":
      return { OR: [{ ownerId: null }, { ownerId: f.ownerId }] }
    case "owner":
      return permission === "lead:read"
        ? { OR: [{ ownerId: f.ownerId }, { deals: { some: { ownerId: f.ownerId } } }, { meetings: { some: { hostId: f.ownerId } } }] }
        : { ownerId: f.ownerId }
    default:
      return { id: "__no_access__" }
  }
}

function filterWhere(user: CurrentUser, f: LeadFilters): Prisma.LeadWhereInput {
  const and: Prisma.LeadWhereInput[] = [{ workspaceId: user.workspaceId }, scopeWhere(user, "lead:read")]
  if (f.q) {
    const contains = { contains: f.q, mode: "insensitive" as const }
    and.push({
      OR: [
        { company: { name: contains } },
        { company: { city: contains } },
        { company: { domain: contains } },
        { company: { email: contains } },
        { contact: { name: contains } },
        { contact: { email: contains } },
        { tags: { has: f.q.toLowerCase() } },
      ],
    })
  }
  if (f.status.length) and.push({ status: { in: f.status } })
  if (f.owner === "me") and.push({ ownerId: user.id })
  else if (f.owner === "none") and.push({ ownerId: null })
  else if (f.owner) and.push({ ownerId: f.owner })
  if (f.source && ["EXTRACTOR", "CSV", "INBOUND", "MANUAL", "LEGACY"].includes(f.source)) and.push({ source: f.source as never })
  if (f.sector) and.push({ company: { sector: { contains: f.sector, mode: "insensitive" } } })
  if (f.city) and.push({ company: { city: { contains: f.city, mode: "insensitive" } } })
  if (f.tag) and.push({ tags: { has: f.tag } })
  if (f.hasEmail) and.push({ OR: [{ contact: { email: { not: null } } }, { company: { email: { not: null } } }] })
  if (f.hasPhone) and.push({ OR: [{ contact: { phone: { not: null } } }, { company: { phone: { not: null } } }] })
  if (f.minScore) and.push({ score: { gte: f.minScore } })
  if (f.batch) and.push({ importBatchId: f.batch })
  return { AND: and }
}

function orderBy(sort: LeadSort, dir: "asc" | "desc"): Prisma.LeadOrderByWithRelationInput[] {
  const tie = { id: "asc" as const } // stable pages
  switch (sort) {
    case "created":
      return [{ createdAt: dir }, tie]
    case "name":
      return [{ company: { name: dir } }, tie]
    case "contacted":
      return [{ lastContactedAt: { sort: dir, nulls: "last" } }, tie]
    case "status":
      return [{ status: dir }, { score: "desc" }, tie]
    default:
      return [{ score: dir }, { createdAt: "desc" }, tie]
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------------------------

const rowInclude = {
  company: { select: { name: true, city: true, sector: true, email: true, phone: true, website: true } },
  contact: { select: { name: true, email: true, emailKind: true, phone: true } },
  owner: { select: { name: true, email: true } },
} satisfies Prisma.LeadInclude

type RowSource = Prisma.LeadGetPayload<{ include: typeof rowInclude }>

export function toRow(l: RowSource): LeadRow {
  return {
    id: l.id,
    name: l.company?.name ?? l.contact?.name ?? l.contact?.email ?? "Sans nom",
    city: l.company?.city ?? null,
    sector: l.company?.sector ?? null,
    contactName: l.contact?.name ?? null,
    email: l.contact?.email ?? l.company?.email ?? null,
    emailKind: l.contact?.email ? l.contact.emailKind : null,
    phone: l.contact?.phone ?? l.company?.phone ?? null,
    website: l.company?.website ?? null,
    status: l.status,
    score: l.score,
    ownerId: l.ownerId,
    ownerName: l.owner?.name ?? l.owner?.email ?? null,
    tags: l.tags,
    source: l.source,
    lastContactedAt: iso(l.lastContactedAt),
    createdAt: l.createdAt.toISOString(),
  }
}

export async function listLeads(user: CurrentUser, filters: LeadFilters): Promise<LeadList> {
  const where = filterWhere(user, filters)
  const [total, leads] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      orderBy: orderBy(filters.sort, filters.dir),
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      include: rowInclude,
    }),
  ])
  return { rows: leads.map(toRow), total, page: filters.page, pageSize: filters.pageSize, pageCount: Math.max(1, Math.ceil(total / filters.pageSize)) }
}

const actorName = (u: { name: string | null; email: string | null } | null) => u?.name ?? u?.email ?? null

type ActivityRow = Prisma.ActivityGetPayload<{ include: { actor: { select: { name: true; email: true } } } }>

export function toActivity(a: ActivityRow): LeadDetail["activities"][number] {
  const d = (a.data && typeof a.data === "object" && !Array.isArray(a.data) ? a.data : {}) as Record<string, unknown>
  return {
    id: a.id,
    kind: a.kind,
    body: a.body,
    actorName: actorName(a.actor),
    actorKind: a.actorKind,
    occurredAt: a.occurredAt.toISOString(),
    outcome: typeof d.outcome === "string" ? d.outcome : null,
    durationMin: typeof d.durationMin === "number" ? d.durationMin : null,
  }
}

/** One page of a fiche's history, newest first. `before` is the `occurredAt` of the last entry already shown. */
export async function listTimeline(user: CurrentUser, id: string, opts: { kinds?: string[]; before?: string; take?: number } = {}) {
  const lead = await prisma.lead.findFirst({ where: { id, workspaceId: user.workspaceId, ...scopeWhere(user, "lead:read") }, select: { id: true } })
  if (!lead) throw new LeadError("not_found", "Fiche introuvable.", 404)
  const take = Math.min(opts.take ?? 50, 100)
  const kinds = (opts.kinds ?? []).filter((k): k is import("@prisma/client").ActivityKind => ["NOTE", "CALL", "EMAIL", "MEETING", "STATUS_CHANGE", "SYSTEM", "TASK"].includes(k))
  const before = opts.before && !Number.isNaN(Date.parse(opts.before)) ? new Date(opts.before) : undefined
  const rows = await prisma.activity.findMany({
    where: { leadId: id, ...(kinds.length ? { kind: { in: kinds } } : {}), ...(before ? { occurredAt: { lt: before } } : {}) },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: take + 1,
    include: { actor: { select: { name: true, email: true } } },
  })
  return { items: rows.slice(0, take).map(toActivity), hasMore: rows.length > take }
}

export async function getLead(user: CurrentUser, id: string): Promise<LeadDetail> {
  const lead = await prisma.lead.findFirst({
    where: { id, workspaceId: user.workspaceId, ...scopeWhere(user, "lead:read") },
    include: {
      company: true,
      contact: true,
      owner: { select: { name: true, email: true } },
      activities: { orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 30, include: { actor: { select: { name: true, email: true } } } },
      deals: { include: { owner: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" } },
      meetings: { include: { host: { select: { name: true, email: true } } }, orderBy: { startsAt: "desc" }, take: 20 },
      tasks: { where: { doneAt: null }, include: { assignee: { select: { name: true, email: true } } }, orderBy: { dueAt: "asc" } },
    },
  })
  if (!lead) throw new LeadError("not_found", "Fiche introuvable.", 404)
  const who = (u: { name: string | null; email: string | null } | null) => u?.name ?? u?.email ?? null
  const c = lead.company
  const k = lead.contact
  const dealMoveScope = scopeOf(user.role, "deal:move")
  return {
    id: lead.id,
    status: lead.status,
    score: lead.score,
    scoreReasons: (lead.scoreReasons as LeadDetail["scoreReasons"] | null) ?? [],
    source: lead.source,
    tags: lead.tags,
    ownerId: lead.ownerId,
    ownerName: who(lead.owner),
    lastContactedAt: iso(lead.lastContactedAt),
    createdAt: lead.createdAt.toISOString(),
    company: c && {
      id: c.id, name: c.name, website: c.website, domain: c.domain, phone: c.phone, email: c.email, address: c.address, city: c.city,
      postalCode: c.postalCode, country: c.country, sector: c.sector, siret: c.siret, rating: c.rating, reviewCount: c.reviewCount, completeness: c.completeness,
    },
    contact: k && {
      id: k.id, name: k.name, jobTitle: k.jobTitle, email: k.email, emailKind: k.emailKind, phone: k.phone, doNotContact: k.doNotContact,
      doNotContactReason: k.doNotContactReason, source: k.source, collectedFrom: k.collectedFrom, collectedAt: iso(k.collectedAt), legalBasis: k.legalBasis,
    },
    activities: lead.activities.map(toActivity),
    qualification: (lead.qualification as LeadDetail["qualification"]) ?? null,
    deals: lead.deals.map((d) => ({ id: d.id, stage: d.stage, amountCents: d.amountCents, expectedCloseAt: iso(d.expectedCloseAt), lostReason: d.lostReason, ownerId: d.ownerId, ownerName: who(d.owner), canMove: dealMoveScope === "all" || (dealMoveScope === "own" && d.ownerId === user.id) })),
    meetings: lead.meetings.map((m) => ({ id: m.id, startsAt: m.startsAt.toISOString(), endsAt: m.endsAt.toISOString(), status: m.status, type: m.type, hostName: who(m.host) })),
    tasks: lead.tasks.map((t) => ({ id: t.id, title: t.title, dueAt: iso(t.dueAt), doneAt: iso(t.doneAt), assigneeId: t.assigneeId, assigneeName: who(t.assignee), canChange: canChangeTask(user, t, canWorkLead(user, lead)) })),
    can: {
      write: canAccessRecord(user, "lead:write", lead.ownerId),
      log: canWorkLead(user, lead),
      assignOthers: can(user.role, "lead:write") && recordFilter(user, "lead:write").kind === "all",
      delete: can(user.role, "data:delete"),
      qualify: canAccessRecord(user, "lead:write", lead.ownerId) && canAccessRecord(user, "deal:qualify", lead.ownerId),
      meet: can(user.role, "meeting:book") && lead.status !== "DO_NOT_CONTACT",
      meetAnywhere: user.role === "OWNER" || user.role === "MANAGER",
    },
  }
}

/** People a fiche can be assigned to, for the owner selector. */
export async function listAssignees(user: CurrentUser) {
  return prisma.user.findMany({
    where: { workspaceId: user.workspaceId, active: true, role: { in: [...OWNER_ROLES] } },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  })
}

/** Distinct sectors, for the filter. */
export async function listSectors(user: CurrentUser) {
  const rows = await prisma.company.findMany({ where: { workspaceId: user.workspaceId, sector: { not: null } }, distinct: ["sector"], select: { sector: true }, orderBy: { sector: "asc" }, take: 200 })
  return rows.map((r) => r.sector!).filter(Boolean)
}

// ---------------------------------------------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------------------------------------------

type Tx = Prisma.TransactionClient

async function log(tx: Tx, user: CurrentUser, leadId: string, kind: "NOTE" | "CALL" | "STATUS_CHANGE" | "SYSTEM", body: string | null, data?: Prisma.InputJsonValue) {
  await tx.activity.create({ data: { workspaceId: user.workspaceId, leadId, actorId: user.id, actorKind: "USER", kind, body, data } })
}

/** Recomputes the score from what the fiche now holds. Called after every change to its data. */
export async function rescore(tx: Tx, leadId: string) {
  const lead = await tx.lead.findUniqueOrThrow({ where: { id: leadId }, include: { company: true, contact: true } })
  const { score, reasons } = scoreLead({
    email: lead.contact?.email ?? lead.company?.email,
    emailKind: lead.contact?.email ? lead.contact.emailKind : lead.company?.email ? "GENERIC" : null,
    phone: lead.contact?.phone ?? lead.company?.phone,
    website: lead.company?.website,
    domain: lead.company?.domain,
    rating: lead.company?.rating,
    reviewCount: lead.company?.reviewCount,
    completeness: lead.company?.completeness,
    contactName: lead.contact?.name,
    address: lead.company?.address,
    city: lead.company?.city,
  })
  await tx.lead.update({ where: { id: leadId }, data: { score, scoreReasons: reasons as unknown as Prisma.InputJsonValue } })
}

export async function isSuppressed(db: Pick<Tx, "suppression">, workspaceId: string, email: string | null | undefined) {
  const e = normalizeEmail(email)
  if (!e) return false
  return !!(await db.suppression.findFirst({ where: { workspaceId, OR: [{ email: e }, { domain: emailDomain(e) }] }, select: { id: true } }))
}

export async function createLead(user: CurrentUser, input: CreateLeadInput, ip?: string | null): Promise<{ id: string }> {
  const company = cleanCompany(input.company)
  const contact = input.contact ? cleanContact(input.contact) : null
  if (contact && !contact.name && !contact.email && !contact.phone) throw new LeadError("invalid", "Le contact est vide : renseignez au moins un nom, un email ou un téléphone.")

  return prisma.$transaction(async (tx) => {
    const dup = await matchCompany(tx, user.workspaceId, company)
    if (dup) {
      const existing = await tx.lead.findFirst({ where: { workspaceId: user.workspaceId, companyId: dup.company.id }, select: { id: true } })
      throw new LeadError("duplicate", `Cette entreprise existe déjà (${MATCH_LABELS[dup.reason]}) : « ${dup.company.name} ».`, 409, { leadId: existing?.id ?? null, reason: dup.reason })
    }
    let contactId: string | null = null
    let suppressed = false
    if (contact) {
      if (contact.email) {
        const taken = await tx.contact.findUnique({ where: { workspaceId_email: { workspaceId: user.workspaceId, email: contact.email } }, include: { leads: { select: { id: true }, take: 1 } } })
        if (taken) throw new LeadError("duplicate", "Cette adresse email appartient déjà à un contact.", 409, { leadId: taken.leads[0]?.id ?? null, reason: "email" })
        suppressed = await isSuppressed(tx, user.workspaceId, contact.email)
      }
    }
    const created = await tx.company.create({
      data: { workspaceId: user.workspaceId, name: company.name!, domain: company.domain, website: company.website, phone: company.phone, email: company.email, address: company.address, city: company.city, postalCode: company.postalCode, country: company.country ?? "FR", sector: company.sector, siret: company.siret, nameKey: company.nameKey, source: "MANUAL" },
    })
    if (contact) {
      const k = await tx.contact.create({
        data: {
          workspaceId: user.workspaceId, companyId: created.id, name: contact.name, jobTitle: contact.jobTitle, email: contact.email, emailKind: contact.emailKind, phone: contact.phone, source: "MANUAL",
          doNotContact: suppressed, doNotContactReason: suppressed ? "Adresse présente dans la liste d’exclusion" : null,
          ...(contact.email ? { collectedFrom: "Saisie manuelle", collectedAt: new Date(), legalBasis: "legitimate_interest_b2b" } : {}),
        },
      })
      contactId = k.id
    }
    const lead = await tx.lead.create({
      data: {
        workspaceId: user.workspaceId, companyId: created.id, contactId, source: "MANUAL", status: suppressed ? "DO_NOT_CONTACT" : "NEW",
        ownerId: user.role === "SDR" || user.role === "CLOSER" ? user.id : null, tags: normalizeTags(input.tags),
      },
    })
    await log(tx, user, lead.id, "SYSTEM", "Fiche créée manuellement")
    if (input.note) await log(tx, user, lead.id, "NOTE", input.note)
    await rescore(tx, lead.id)
    await audit({ action: "lead.created", actorId: user.id, workspaceId: user.workspaceId, entityType: "Lead", entityId: lead.id, ip })
    return { id: lead.id }
  })
}

/** Assigning rules: a manager or owner assigns anyone; a person with narrower rights can only take or release their own. */
async function checkAssignee(user: CurrentUser, ownerId: string | null, currentOwnerId: string | null) {
  if (ownerId === currentOwnerId) return
  const scope = recordFilter(user, "lead:write").kind
  if (scope !== "all" && ownerId !== null && ownerId !== user.id) throw new LeadError("forbidden", "Vous pouvez vous attribuer une fiche, pas l’attribuer à quelqu’un d’autre.", 403)
  if (scope === "owner" && ownerId === null) throw new LeadError("forbidden", "Vous ne pouvez pas rendre une fiche au pool.", 403)
  if (ownerId) {
    const target = await prisma.user.findFirst({ where: { id: ownerId, workspaceId: user.workspaceId, active: true, role: { in: [...OWNER_ROLES] } }, select: { id: true } })
    if (!target) throw new LeadError("invalid", "Cette personne ne peut pas recevoir de fiches.")
  }
}

export async function updateLead(user: CurrentUser, id: string, patch: UpdateLeadInput, ip?: string | null): Promise<void> {
  const lead = await prisma.lead.findFirst({ where: { id, workspaceId: user.workspaceId, ...scopeWhere(user, "lead:read") }, include: { company: true, contact: true } })
  if (!lead) throw new LeadError("not_found", "Fiche introuvable.", 404)
  if (!canAccessRecord(user, "lead:write", lead.ownerId)) {
    // A pool fiche can be taken by someone who may write in the pool: that is the only edit allowed on it.
    const takingIt = patch.ownerId === user.id && Object.keys(patch).length === 1 && can(user.role, "lead:write")
    if (!takingIt) throw new LeadError("forbidden", "Cette fiche ne vous est pas attribuée.", 403)
  }
  if (patch.ownerId !== undefined) await checkAssignee(user, patch.ownerId, lead.ownerId)

  // Only what was typed is validated; the derived keys use the final name, city, website and email.
  const companyPatch = patch.company
    ? (() => {
        const typed = cleanCompany(patch.company)
        const final = {
          name: typed.name ?? lead.company?.name,
          city: "city" in patch.company ? typed.city : lead.company?.city,
          website: "website" in patch.company ? typed.website : lead.company?.website,
          email: "email" in patch.company ? typed.email : lead.company?.email,
        }
        return { ...typed, domain: companyDomain(final.website, final.email), nameKey: nameKey(final.name, final.city) }
      })()
    : null
  const contactPatch = patch.contact ? cleanContact(patch.contact) : null
  const changed: string[] = []

  await prisma.$transaction(async (tx) => {
    if (companyPatch && lead.company) {
      const given = patch.company!
      const data: Prisma.CompanyUpdateInput = {}
      const set = <K extends keyof typeof companyPatch>(key: K, field: string) => {
        if (key in given || (key === "name" && given.name !== undefined)) {
          const value = companyPatch[key]
          if (value !== (lead.company as unknown as Record<string, unknown>)[field]) {
            ;(data as Record<string, unknown>)[field] = value
            changed.push(field)
          }
        }
      }
      for (const key of ["name", "website", "phone", "email", "address", "city", "postalCode", "sector", "siret"] as const) set(key, key)
      if (given.country) {
        data.country = companyPatch.country ?? "FR"
      }
      if ("website" in given || "email" in given) data.domain = companyPatch.domain
      if ("name" in given || "city" in given) data.nameKey = companyPatch.nameKey
      // Editing must not create a duplicate silently.
      if (data.siret || data.domain || data.nameKey || data.phone) {
        const clash = await matchCompany(tx, user.workspaceId, { siret: data.siret as string | undefined, domain: data.domain as string | undefined, nameKey: data.nameKey as string | undefined, phone: data.phone as string | undefined }, lead.company.id)
        if (clash) throw new LeadError("duplicate", `Une autre fiche a déjà ces informations (${MATCH_LABELS[clash.reason]}) : « ${clash.company.name} ».`, 409, { reason: clash.reason })
      }
      if (Object.keys(data).length) await tx.company.update({ where: { id: lead.company.id }, data })
    }

    if (contactPatch) {
      const given = patch.contact!
      const data: Prisma.ContactUpdateInput = {}
      for (const key of ["name", "jobTitle", "email", "phone"] as const) {
        if (key in given && contactPatch[key] !== lead.contact?.[key]) {
          ;(data as Record<string, unknown>)[key] = contactPatch[key]
          changed.push(`contact.${key}`)
        }
      }
      if ("email" in given) data.emailKind = contactPatch.emailKind
      if (Object.keys(data).length) {
        if (lead.contact) {
          if (contactPatch.email && contactPatch.email !== lead.contact.email && (await tx.contact.findUnique({ where: { workspaceId_email: { workspaceId: user.workspaceId, email: contactPatch.email } } }))) {
            throw new LeadError("duplicate", "Cette adresse email appartient déjà à un autre contact.", 409)
          }
          await tx.contact.update({ where: { id: lead.contact.id }, data })
        } else if (contactPatch.name || contactPatch.email || contactPatch.phone) {
          if (contactPatch.email && (await tx.contact.findUnique({ where: { workspaceId_email: { workspaceId: user.workspaceId, email: contactPatch.email } } }))) {
            throw new LeadError("duplicate", "Cette adresse email appartient déjà à un autre contact.", 409)
          }
          const k = await tx.contact.create({
            data: { workspaceId: user.workspaceId, companyId: lead.companyId, ...contactPatch, source: "MANUAL", ...(contactPatch.email ? { collectedFrom: "Saisie manuelle", collectedAt: new Date(), legalBasis: "legitimate_interest_b2b" } : {}) },
          })
          await tx.lead.update({ where: { id: lead.id }, data: { contactId: k.id } })
          changed.push("contact")
        }
      }
    }

    const leadData: Prisma.LeadUncheckedUpdateInput = {}
    if (patch.tags) {
      const tags = normalizeTags(patch.tags)
      if (tags.join() !== lead.tags.join()) {
        leadData.tags = tags
        changed.push("étiquettes")
      }
    }
    if (patch.ownerId !== undefined && patch.ownerId !== lead.ownerId) {
      leadData.ownerId = patch.ownerId
      const target = patch.ownerId ? await tx.user.findUnique({ where: { id: patch.ownerId }, select: { name: true, email: true } }) : null
      await log(tx, user, lead.id, "SYSTEM", patch.ownerId ? `Attribuée à ${target?.name ?? target?.email}` : "Rendue au pool", { from: lead.ownerId, to: patch.ownerId })
    }
    if (patch.status && patch.status !== lead.status) await changeStatus(tx, user, lead, patch.status)
    if (Object.keys(leadData).length) await tx.lead.update({ where: { id: lead.id }, data: leadData })
    if (changed.length) await log(tx, user, lead.id, "SYSTEM", `Fiche modifiée : ${changed.join(", ")}`, { fields: changed })
    await rescore(tx, lead.id)
  })
  await audit({ action: "lead.updated", actorId: user.id, workspaceId: user.workspaceId, entityType: "Lead", entityId: id, metadata: { fields: Object.keys(patch) }, ip })
}

type LeadWithContact = Prisma.LeadGetPayload<{ include: { company: true; contact: true } }>

async function changeStatus(tx: Tx, user: CurrentUser, lead: LeadWithContact, status: LeadStatus) {
  const leaving = lead.status === "DO_NOT_CONTACT" && status !== "DO_NOT_CONTACT"
  const emails = [...new Set([lead.contact?.email, lead.company?.email].filter(Boolean) as string[])]

  if (status === "DO_NOT_CONTACT") {
    for (const email of emails) {
      await tx.suppression.upsert({
        where: { workspaceId_email: { workspaceId: user.workspaceId, email } },
        update: {},
        create: { workspaceId: user.workspaceId, email, reason: "MANUAL", source: `lead:${lead.id}` },
      })
    }
    if (lead.contact) await tx.contact.update({ where: { id: lead.contact.id }, data: { doNotContact: true, doNotContactReason: "Marqué « ne pas contacter »" } })
  } else if (leaving) {
    // Lifting a block is a manager's decision, and never possible when the person unsubscribed or the address bounced.
    if (recordFilter(user, "lead:write").kind !== "all") throw new LeadError("forbidden", "Seul un manager peut lever un « ne pas contacter ».", 403)
    for (const email of emails) {
      const s = await tx.suppression.findUnique({ where: { workspaceId_email: { workspaceId: user.workspaceId, email } } })
      if (s && s.reason !== "MANUAL") throw new LeadError("conflict", "Cette adresse s’est désinscrite ou a été rejetée : elle ne peut pas être réactivée.", 409)
    }
    for (const email of emails) await tx.suppression.deleteMany({ where: { workspaceId: user.workspaceId, email, reason: "MANUAL" } })
    if (lead.contact) await tx.contact.update({ where: { id: lead.contact.id }, data: { doNotContact: false, doNotContactReason: null } })
  }
  if (status === "QUALIFIED") {
    // Qualifying hands an opportunity over: it needs the right to qualify, and creates the opportunity.
    if (!canAccessRecord(user, "deal:qualify", lead.ownerId)) throw new LeadError("forbidden", "Votre rôle ne qualifie pas de prospects : un SDR ou un manager s’en charge.", 403)
    await tx.lead.update({ where: { id: lead.id }, data: { status } })
    await ensureOpenDeal(tx, user, lead.id, null)
  } else {
    if (lead.status === "QUALIFIED" && !["DISQUALIFIED", "DO_NOT_CONTACT"].includes(status) && (await tx.deal.count({ where: { leadId: lead.id, stage: { in: [...OPEN_STAGES] } } })) > 0) {
      throw new LeadError("conflict", "Une opportunité est ouverte sur cette fiche : gagnez-la ou perdez-la d’abord.", 409)
    }
    await tx.lead.update({ where: { id: lead.id }, data: { status } })
    if (status === "DISQUALIFIED" || status === "DO_NOT_CONTACT") {
      await closeOpenDeals(tx, user, lead.id, status === "DO_NOT_CONTACT" ? "Ne pas contacter" : "Prospect disqualifié")
      await closeOpenTasks(tx, user, lead.id, status === "DO_NOT_CONTACT" ? "ne pas contacter" : "prospect disqualifié")
    }
  }
  await log(tx, user, lead.id, "STATUS_CHANGE", null, { from: lead.status, to: status })
}

export async function addActivity(user: CurrentUser, id: string, input: ActivityInput): Promise<void> {
  const lead = await prisma.lead.findFirst({
    where: { id, workspaceId: user.workspaceId, ...scopeWhere(user, "lead:read") },
    select: { id: true, ownerId: true, status: true, deals: { select: { ownerId: true, stage: true } } },
  })
  if (!lead) throw new LeadError("not_found", "Fiche introuvable.", 404)
  if (!canWorkLead(user, lead)) throw new LeadError("forbidden", "Cette fiche ne vous est pas attribuée.", 403)
  if (input.followUp && lead.status === "DO_NOT_CONTACT") throw new LeadError("conflict", "Cette fiche est marquée « ne pas contacter » : aucune relance ne peut être planifiée.", 409)
  await prisma.$transaction(async (tx) => {
    const data = input.kind === "CALL" ? { ...(input.outcome ? { outcome: input.outcome } : {}), ...(input.durationMin != null ? { durationMin: input.durationMin } : {}) } : undefined
    await log(tx, user, id, input.kind, input.body || null, data && Object.keys(data).length ? data : undefined)
    if (input.kind === "CALL" && !(input.outcome && NOT_A_CONTACT.includes(input.outcome))) {
      // A call is a contact: the fiche leaves "Nouveau" and remembers when. Having spoken to someone is a reply.
      const next = lead.status === "NEW" || lead.status === "CONTACTED" ? (input.outcome === "reached" ? "REPLIED" : lead.status === "NEW" ? "CONTACTED" : null) : null
      await tx.lead.update({ where: { id }, data: { lastContactedAt: new Date(), ...(next ? { status: next } : {}) } })
      if (next) await log(tx, user, id, "STATUS_CHANGE", null, { from: lead.status, to: next, reason: "call" })
    }
    if (input.followUp) {
      await insertTask(tx, user, { leadId: id, title: input.followUp.title ?? (input.outcome === "callback" ? "Rappeler" : "Relancer"), dueDay: input.followUp.dueDay, assigneeId: user.id })
    }
  })
}

export async function bulkUpdate(user: CurrentUser, input: BulkInput, ip?: string | null) {
  const leads = await prisma.lead.findMany({
    where: { id: { in: input.ids }, workspaceId: user.workspaceId, AND: [scopeWhere(user, "lead:write")] },
    include: { company: true, contact: true },
  })
  let updated = 0
  const failures: { id: string; message: string }[] = []
  for (const lead of leads) {
    try {
      const a = input.action
      if (a.type === "assign") {
        await checkAssignee(user, a.ownerId, lead.ownerId)
        if (a.ownerId !== lead.ownerId) {
          await prisma.$transaction(async (tx) => {
            await tx.lead.update({ where: { id: lead.id }, data: { ownerId: a.ownerId } })
            await log(tx, user, lead.id, "SYSTEM", a.ownerId ? "Attribuée (action groupée)" : "Rendue au pool (action groupée)", { from: lead.ownerId, to: a.ownerId })
          })
        }
      } else if (a.type === "status") {
        if (a.status !== lead.status) await prisma.$transaction((tx) => changeStatus(tx, user, lead, a.status))
      } else {
        const tag = normalizeTags([a.tag])[0]
        if (!tag) throw new LeadError("invalid", "Étiquette invalide.")
        const tags = a.type === "tag" ? [...new Set([...lead.tags, tag])].slice(0, 20) : lead.tags.filter((t) => t !== tag)
        if (tags.join() !== lead.tags.join()) await prisma.lead.update({ where: { id: lead.id }, data: { tags } })
      }
      updated++
    } catch (error) {
      if (error instanceof LeadError) failures.push({ id: lead.id, message: error.message })
      else throw error
    }
  }
  const notAllowed = input.ids.length - leads.length
  await audit({ action: "lead.bulk_update", actorId: user.id, workspaceId: user.workspaceId, entityType: "Lead", metadata: { action: input.action.type, requested: input.ids.length, updated }, ip })
  return { updated, notAllowed, failures }
}

/** Erases a fiche and what hangs off it (history, meetings, opportunities), then its contacts and company when nothing else uses them. */
export async function deleteLead(user: CurrentUser, id: string, ip?: string | null): Promise<void> {
  if (!can(user.role, "data:delete")) throw new LeadError("forbidden", "Seul le propriétaire peut supprimer définitivement une fiche.", 403)
  const lead = await prisma.lead.findFirst({ where: { id, workspaceId: user.workspaceId }, select: { id: true, companyId: true, contactId: true, company: { select: { name: true } } } })
  if (!lead) throw new LeadError("not_found", "Fiche introuvable.", 404)
  await prisma.$transaction(async (tx) => {
    await tx.lead.delete({ where: { id } })
    if (lead.companyId) {
      const others = await tx.lead.count({ where: { companyId: lead.companyId } })
      if (others === 0) {
        await tx.contact.deleteMany({ where: { companyId: lead.companyId, leads: { none: {} } } })
        await tx.company.delete({ where: { id: lead.companyId } })
      }
    }
    if (lead.contactId) await tx.contact.deleteMany({ where: { id: lead.contactId, leads: { none: {} } } })
  })
  // The suppression list is kept on purpose: erasing a person must not allow contacting them again.
  await audit({ action: "lead.deleted", actorId: user.id, workspaceId: user.workspaceId, entityType: "Lead", entityId: id, metadata: { name: lead.company?.name }, ip })
}
