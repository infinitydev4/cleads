import type { LegalState, SignalKind } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { canAccessRecord } from "@/lib/rbac"
import { normalizeName } from "@/lib/crm/normalize"
import { LeadError } from "@/features/leads/errors"
import { scopeWhere } from "@/features/leads/service"
import { visibleLead } from "@/features/prospect-audit/service"
import { identityOf, refreshIdentity } from "@/features/enrichment/identity"
import { ANNUAIRE_SOURCE, LEGAL_BASIS } from "@/features/enrichment/sources/annuaire"
import type { MetaTokenState } from "@/features/enrichment/sources/meta-ads"
import { LEGAL_STATE_LABELS, SIGNAL_LABELS, headcountLabel, legallyBlocked } from "./kinds"
import { adLibraryAdUrl, adLibraryPageUrl, adsOf, platformLabel, type AdsData } from "./ads"

/** What the fiche shows of the registry (E30): the company's identity, its officers, and its signals. */
export interface RegistryView {
  identity: {
    siren: string | null
    nafCode: string | null
    foundedOn: string | null
    headcount: string | null
    category: string | null
    labels: string[]
    url: string | null
    checkedAt: string | null
    found: boolean | null
    error: string | null
  }
  legal: { state: LegalState; label: string; since: string | null; blocked: boolean; overriddenAt: string | null }
  officers: { index: number; name: string; role: string | null; added: boolean }[]
  signals: { id: string; kind: SignalKind; label: string; summary: string; occurredAt: string; sourceUrl: string | null; recent: boolean; dismissed: boolean }[]
  /** E30 lot 3: its ads in Meta's Ad Library, as the worker last read them. */
  ads: AdsView
  can: { write: boolean; override: boolean }
}

export interface AdsView {
  /** The worker's Meta reading: working, token soon to renew, none set, to renew now, identity to confirm; null when no worker said. */
  meta: "ok" | "expiring" | "off" | "renew" | "identity" | null
  tokenExpiresAt: string | null
  checkedAt: string | null
  requested: boolean
  page: { name: string | null; url: string; how: AdsData["how"] } | null
  active: number
  more: boolean
  since: string | null
  platforms: string[]
  ads: { url: string; start: string | null; title: string | null }[]
}

const META_STATES: Record<MetaTokenState["state"], AdsView["meta"]> = { ok: "ok", unknown: "ok", expiring: "expiring", missing: "off", expired: "renew", invalid: "renew", identity: "identity" }

/** What the freshest worker said of its Meta token, in its heartbeat. */
async function metaReading(): Promise<{ meta: AdsView["meta"]; expiresAt: string | null }> {
  const w = await prisma.aiWorker.findFirst({ orderBy: { beatAt: "desc" }, select: { meta: true } })
  const m = w?.meta && typeof w.meta === "object" && !Array.isArray(w.meta) ? (w.meta as { state?: unknown; expiresAt?: unknown }) : null
  const state = typeof m?.state === "string" && m.state in META_STATES ? META_STATES[m.state as MetaTokenState["state"]] : null
  return { meta: state, expiresAt: typeof m?.expiresAt === "string" ? m.expiresAt : null }
}

function adsView(c: { data: unknown; adsRequestedAt: Date | null }, reading: Awaited<ReturnType<typeof metaReading>>): AdsView {
  const d = adsOf(c.data)
  return {
    meta: reading.meta,
    tokenExpiresAt: reading.expiresAt,
    checkedAt: d?.checkedAt ?? null,
    requested: !!c.adsRequestedAt,
    page: d?.pageId ? { name: d.pageName, url: adLibraryPageUrl(d.pageId), how: d.how } : null,
    active: d?.active ?? 0,
    more: !!d?.more,
    since: d?.since ?? null,
    platforms: (d?.platforms ?? []).map(platformLabel),
    ads: (d?.ads ?? []).map((a) => ({ url: adLibraryAdUrl(a.id), start: a.start, title: a.title })),
  }
}

const MANAGERS = ["OWNER", "MANAGER"] as const
const isManager = (u: CurrentUser) => (MANAGERS as readonly string[]).includes(u.role)

async function companyOf(actor: CurrentUser, leadId: string) {
  const lead = await visibleLead(actor, leadId)
  if (!lead.companyId) throw new LeadError("invalid", "La fiche n'a pas d'entreprise.", 400)
  return lead as typeof lead & { companyId: string }
}

export async function registryView(actor: CurrentUser, leadId: string, now = new Date()): Promise<RegistryView> {
  const lead = await companyOf(actor, leadId)
  const c = await prisma.company.findUniqueOrThrow({
    where: { id: lead.companyId },
    select: { siren: true, nafCode: true, foundedOn: true, headcountBand: true, legalState: true, legalStateAt: true, legalOverrideAt: true, identityCheckedAt: true, adsRequestedAt: true, data: true, contacts: { select: { name: true } } },
  })
  const identity = identityOf(c.data)
  const [signals, reading] = await Promise.all([prisma.companySignal.findMany({ where: { companyId: lead.companyId }, orderBy: { occurredAt: "desc" }, take: 20 }), metaReading()])
  const names = new Set(c.contacts.map((k) => normalizeName(k.name ?? "")).filter(Boolean))
  return {
    identity: {
      siren: c.siren,
      nafCode: c.nafCode,
      foundedOn: c.foundedOn?.toISOString().slice(0, 10) ?? null,
      headcount: headcountLabel(c.headcountBand),
      category: identity?.category ?? null,
      labels: identity?.labels ?? [],
      url: identity?.url ?? null,
      checkedAt: c.identityCheckedAt?.toISOString() ?? null,
      found: identity ? identity.found : null,
      error: identity?.error ?? null,
    },
    legal: { state: c.legalState, label: LEGAL_STATE_LABELS[c.legalState], since: c.legalStateAt?.toISOString() ?? null, blocked: legallyBlocked(c), overriddenAt: c.legalOverrideAt?.toISOString() ?? null },
    officers: (identity?.officers ?? []).map((o, index) => ({ index, name: o.name, role: o.role, added: names.has(normalizeName(o.name)) })),
    signals: signals.map((s) => ({
      id: s.id,
      kind: s.kind,
      label: SIGNAL_LABELS[s.kind],
      summary: s.summary,
      occurredAt: s.occurredAt.toISOString().slice(0, 10),
      sourceUrl: s.sourceUrl,
      recent: s.expiresAt > now && !s.dismissedAt,
      dismissed: !!s.dismissedAt,
    })),
    ads: adsView(c, reading),
    can: { write: canAccessRecord(actor, "lead:write", lead.ownerId), override: isManager(actor) },
  }
}

/**
 * Asks the worker to read the company's ads in Meta's Ad Library now (free): it takes it within a minute. Refused when
 * the worker cannot read them, with what to do.
 */
export async function requestAdsCheck(actor: CurrentUser, leadId: string): Promise<void> {
  const lead = await companyOf(actor, leadId)
  assertWrite(actor, lead)
  const c = await prisma.company.findUniqueOrThrow({ where: { id: lead.companyId }, select: { legalState: true } })
  if (c.legalState !== "ACTIVE") throw new LeadError("conflict", "Entreprise en procédure collective ou fermée : ses publicités ne sont pas relues.", 409)
  const { meta } = await metaReading()
  if (meta === "off" || meta === null) throw new LeadError("conflict", "La lecture des publicités Meta n'est pas branchée : le jeton Meta n'est pas posé sur le worker.", 409)
  if (meta === "renew") throw new LeadError("conflict", "Le jeton Meta du worker est expiré ou refusé : le propriétaire doit le renouveler.", 409)
  if (meta === "identity") throw new LeadError("conflict", "Meta attend la confirmation d'identité du titulaire du jeton (facebook.com/ID) avant toute lecture.", 409)
  await prisma.company.update({ where: { id: lead.companyId }, data: { adsRequestedAt: new Date() } })
}

function assertWrite(actor: CurrentUser, lead: { ownerId: string | null }) {
  if (!canAccessRecord(actor, "lead:write", lead.ownerId)) throw new LeadError("forbidden", "Cette fiche ne vous est pas attribuée.", 403)
}

/** Reads the registry again now (one lookup, free). */
export async function refreshLeadIdentity(actor: CurrentUser, leadId: string): Promise<{ found: boolean; error: string | null }> {
  const lead = await companyOf(actor, leadId)
  assertWrite(actor, lead)
  return refreshIdentity(lead.companyId)
}

/** A signal that says nothing useful for this fiche stops counting as recent. */
export async function dismissSignal(actor: CurrentUser, leadId: string, signalId: string): Promise<void> {
  const lead = await companyOf(actor, leadId)
  assertWrite(actor, lead)
  const res = await prisma.companySignal.updateMany({ where: { id: signalId, companyId: lead.companyId, dismissedAt: null }, data: { dismissedAt: new Date(), dismissedById: actor.id } })
  if (!res.count) throw new LeadError("not_found", "Signal introuvable ou déjà ignoré.", 404)
}

/** An owner or a manager prospects a company despite its legal state; a newer judgment blocks it again. Journaled. */
export async function overrideLegalState(actor: CurrentUser, leadId: string, ip?: string | null): Promise<void> {
  if (!isManager(actor)) throw new LeadError("forbidden", "Seuls le propriétaire et les managers peuvent reprendre la prospection d'une entreprise en procédure.", 403)
  const lead = await companyOf(actor, leadId)
  const c = await prisma.company.findUniqueOrThrow({ where: { id: lead.companyId }, select: { legalState: true } })
  if (c.legalState === "ACTIVE") throw new LeadError("conflict", "Cette entreprise n'est pas bloquée.", 409)
  await prisma.company.update({ where: { id: lead.companyId }, data: { legalOverrideAt: new Date(), legalOverrideById: actor.id } })
  await audit({ action: "lead.legal_override", actorId: actor.id, workspaceId: actor.workspaceId, entityType: "Lead", entityId: lead.id, metadata: { legalState: c.legalState }, ip })
}

/** Adds an officer the registry lists as a contact of the company, with its source and legal basis (never an email). */
export async function addOfficerContact(actor: CurrentUser, leadId: string, index: number, ip?: string | null): Promise<{ contactId: string; linked: boolean }> {
  const lead = await companyOf(actor, leadId)
  assertWrite(actor, lead)
  const view = await registryView(actor, leadId)
  const officer = view.officers[index]
  if (!officer) throw new LeadError("not_found", "Dirigeant introuvable : actualisez l'identité de la fiche.", 404)
  if (officer.added) throw new LeadError("conflict", `${officer.name} est déjà un contact de cette entreprise.`, 409)
  const result = await prisma.$transaction(async (tx) => {
    const contact = await tx.contact.create({
      data: {
        workspaceId: actor.workspaceId,
        companyId: lead.companyId,
        name: officer.name,
        jobTitle: officer.role,
        role: "EXECUTIVE",
        source: "REGISTRY",
        collectedFrom: ANNUAIRE_SOURCE,
        collectedAt: view.identity.checkedAt ? new Date(view.identity.checkedAt) : new Date(),
        legalBasis: LEGAL_BASIS,
      },
      select: { id: true },
    })
    const linked = !lead.contactId
    if (linked) await tx.lead.update({ where: { id: lead.id }, data: { contactId: contact.id } })
    return { contactId: contact.id, linked }
  })
  await audit({ action: "lead.contact_added_from_registry", actorId: actor.id, workspaceId: actor.workspaceId, entityType: "Lead", entityId: lead.id, metadata: { contactId: result.contactId, linked: result.linked }, ip })
  return result
}

/** The workspace's recent signals, newest first, for the copilot and MCP. */
export async function recentSignals(actor: CurrentUser, opts: { kinds?: SignalKind[]; days?: number; take?: number } = {}, now = new Date()) {
  const since = new Date(now.getTime() - Math.min(opts.days ?? 30, 365) * 86_400_000)
  const rows = await prisma.companySignal.findMany({
    where: { workspaceId: actor.workspaceId, dismissedAt: null, occurredAt: { gte: since }, ...(opts.kinds?.length ? { kind: { in: opts.kinds } } : {}), company: { leads: { some: scopeWhere(actor, "lead:read") } } },
    orderBy: { occurredAt: "desc" },
    take: Math.min(opts.take ?? 30, 100),
    select: { kind: true, summary: true, occurredAt: true, source: true, sourceUrl: true, company: { select: { name: true, city: true, leads: { select: { id: true }, take: 1 } } } },
  })
  return rows.map((r) => ({ kind: r.kind, label: SIGNAL_LABELS[r.kind], summary: r.summary, occurredAt: r.occurredAt.toISOString().slice(0, 10), source: r.source, sourceUrl: r.sourceUrl, company: r.company.name, city: r.company.city, leadId: r.company.leads[0]?.id ?? null }))
}
