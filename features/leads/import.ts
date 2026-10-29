import { randomUUID } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import {
  companyDomain, emailDomain, inferEmailKind, nameKey, normalizeEmail, normalizePhone, normalizeSiret, normalizeTags,
} from "@/lib/crm/normalize"
import { LeadError } from "./errors"
import { rescore } from "./service"
import type { ImportRow } from "./mapping"
import { scoreLead } from "./scoring"

export const MAX_IMPORT_ROWS = 5000

export type RowStatus = "created" | "existing" | "skipped"
export interface RowOutcome {
  line: number
  name: string
  status: RowStatus
  /** Why a row is skipped, or what it matched. */
  reason?: string
  warnings?: string[]
  /** Fields filled in on an existing fiche. */
  filled?: string[]
}

export interface ImportSummary {
  total: number
  created: number
  existing: number
  /** Existing fiches that received missing information. */
  enriched: number
  skipped: number
  warnings: number
}

export interface ImportResult {
  committed: boolean
  batchId: string | null
  summary: ImportSummary
  /** First rows in file order, for the preview table. */
  rows: RowOutcome[]
  /** Every skipped row and every warning, capped. */
  issues: RowOutcome[]
}

export interface ImportOptions {
  commit: boolean
  source: "CSV" | "EXTRACTOR"
  fileName?: string
  extractorJobId?: string
  ip?: string | null
}

type Cleaned = {
  line: number
  name: string
  email: string | null
  emailKind: "NOMINATIVE" | "GENERIC" | "UNKNOWN"
  phone: string | null
  website: string | null
  domain: string | null
  address: string | null
  city: string | null
  postalCode: string | null
  country: string
  sector: string | null
  siret: string | null
  nameKey: string | null
  contactName: string | null
  jobTitle: string | null
  tags: string[]
  externalId: string | null
  warnings: string[]
}

const blank = (v?: string) => (v?.trim() ? v.trim() : null)

/** Imports are lenient: a bad optional value is dropped with a warning instead of rejecting the row. */
function clean(raw: ImportRow, line: number): Cleaned | { line: number; skip: string; name: string } {
  const name = blank(raw.name)
  const warnings: string[] = []
  if (!name || name.length < 2) return { line, name: name ?? "", skip: "Nom de l’entreprise manquant." }

  const emailRaw = blank(raw.email)
  const email = normalizeEmail(emailRaw)
  if (emailRaw && !email) warnings.push(`Email ignoré : « ${emailRaw} » n’est pas valide.`)
  const phoneRaw = blank(raw.phone)
  const phone = normalizePhone(phoneRaw)
  if (phoneRaw && !phone) warnings.push(`Téléphone ignoré : « ${phoneRaw} » n’est pas reconnu (les numéros étrangers commencent par +).`)
  const siretRaw = blank(raw.siret)
  const siret = normalizeSiret(siretRaw)
  if (siretRaw && !siret) warnings.push(`SIRET ignoré : « ${siretRaw} » n’est pas valide.`)
  const website = blank(raw.website)
  const city = blank(raw.city)
  return {
    line,
    name,
    email,
    emailKind: inferEmailKind(email),
    phone,
    website,
    domain: companyDomain(website, email),
    address: blank(raw.address),
    city,
    postalCode: blank(raw.postalCode),
    country: blank(raw.country)?.toUpperCase().slice(0, 2) ?? "FR",
    sector: blank(raw.sector),
    siret,
    nameKey: nameKey(name, city),
    contactName: blank(raw.contactName),
    jobTitle: blank(raw.jobTitle),
    tags: normalizeTags(raw.tags),
    externalId: blank(raw.externalId),
    warnings,
  }
}

const chunk = <T>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size))
const uniq = <T>(list: (T | null | undefined)[]) => [...new Set(list.filter((x): x is T => x != null))]

interface Known {
  companyId: string
  leadId: string | null
  name: string
  fields: Record<"website" | "phone" | "email" | "address" | "city" | "postalCode" | "sector" | "siret" | "domain" | "nameKey", string | null>
  hasContact: boolean
  tags: string[]
}

/**
 * Previews or performs an import. The plan (what is created, what already exists, what is skipped) is computed in memory
 * from one batch of lookups, so a preview and the real import give the same answer, and replaying a file adds nothing.
 */
export async function runImport(user: CurrentUser, raws: ImportRow[], options: ImportOptions): Promise<ImportResult> {
  if (raws.length === 0) throw new LeadError("invalid", "Le fichier ne contient aucune ligne.")
  if (raws.length > MAX_IMPORT_ROWS) throw new LeadError("invalid", `Trop de lignes (${raws.length}) : ${MAX_IMPORT_ROWS} au maximum par import. Découpez le fichier.`)
  const ws = user.workspaceId

  const cleaned = raws.map((r, i) => clean(r, i + 2)) // line 1 of a CSV is the header
  const rows = cleaned.filter((c): c is Cleaned => !("skip" in c))

  // --- One round of lookups for the whole file -------------------------------------------------------------------
  const keys = {
    externalId: uniq(rows.map((r) => r.externalId)),
    siret: uniq(rows.map((r) => r.siret)),
    domain: uniq(rows.map((r) => r.domain)),
    nameKey: uniq(rows.map((r) => r.nameKey)),
    phone: uniq(rows.map((r) => r.phone)),
  }
  const emails = uniq(rows.map((r) => r.email))
  const companyById = new Map<string, Known>()
  const toKnown = (c: Prisma.CompanyGetPayload<{ include: { leads: { select: { id: true; contactId: true; tags: true } } } }>): Known => ({
    companyId: c.id,
    leadId: c.leads[0]?.id ?? null,
    name: c.name,
    fields: { website: c.website, phone: c.phone, email: c.email, address: c.address, city: c.city, postalCode: c.postalCode, sector: c.sector, siret: c.siret, domain: c.domain, nameKey: c.nameKey },
    hasContact: !!c.leads[0]?.contactId,
    tags: c.leads[0]?.tags ?? [],
  })
  const include = { leads: { select: { id: true, contactId: true, tags: true }, take: 1 } } as const
  for (const [field, values] of Object.entries(keys)) {
    for (const part of chunk(values, 1000)) {
      for (const c of await prisma.company.findMany({ where: { workspaceId: ws, [field]: { in: part } }, include })) companyById.set(c.id, toKnown(c))
    }
  }
  const index = {
    externalId: new Map<string, string>(), siret: new Map<string, string>(), domain: new Map<string, string>(),
    nameKey: new Map<string, string>(), phone: new Map<string, string>(), email: new Map<string, string>(),
  }
  const addToIndex = (companyId: string, f: { externalId?: string | null; siret?: string | null; domain?: string | null; nameKey?: string | null; phone?: string | null }) => {
    for (const k of ["externalId", "siret", "domain", "nameKey", "phone"] as const) if (f[k] && !index[k].has(f[k]!)) index[k].set(f[k]!, companyId)
  }
  const externalIds = new Map<string, string>() // companyId -> externalId, to index existing companies by it
  for (const c of await prisma.company.findMany({ where: { workspaceId: ws, externalId: { in: keys.externalId } }, select: { id: true, externalId: true } })) externalIds.set(c.id, c.externalId!)
  for (const k of companyById.values()) addToIndex(k.companyId, { ...k.fields, externalId: externalIds.get(k.companyId) })

  const existingContacts = new Map<string, string | null>() // email -> companyId
  for (const part of chunk(emails, 1000)) {
    for (const c of await prisma.contact.findMany({ where: { workspaceId: ws, email: { in: part } }, select: { email: true, companyId: true } })) {
      existingContacts.set(c.email!, c.companyId)
      if (c.companyId && !companyById.has(c.companyId)) {
        const company = await prisma.company.findUnique({ where: { id: c.companyId }, include })
        if (company) {
          companyById.set(company.id, toKnown(company))
          addToIndex(company.id, { ...toKnown(company).fields })
        }
      }
    }
  }
  for (const [email, companyId] of existingContacts) if (companyId) index.email.set(email, companyId)
  const suppressedEmails = new Set<string>()
  const suppressedDomains = new Set<string>()
  for (const s of await prisma.suppression.findMany({ where: { workspaceId: ws, OR: [{ email: { in: emails } }, { domain: { in: uniq(emails.map(emailDomain)) } }] }, select: { email: true, domain: true } })) {
    if (s.email) suppressedEmails.add(s.email)
    if (s.domain) suppressedDomains.add(s.domain)
  }

  // --- Plan --------------------------------------------------------------------------------------------------------
  const outcomes: RowOutcome[] = []
  const summary: ImportSummary = { total: raws.length, created: 0, existing: 0, enriched: 0, skipped: 0, warnings: 0 }
  const newCompanies: Prisma.CompanyCreateManyInput[] = []
  const newContacts: Prisma.ContactCreateManyInput[] = []
  const newLeads: Prisma.LeadCreateManyInput[] = []
  const newActivities: Prisma.ActivityCreateManyInput[] = []
  const companyUpdates = new Map<string, Prisma.CompanyUpdateInput>()
  const leadTagUpdates = new Map<string, string[]>()
  const toRescore = new Set<string>()
  const contactForExisting: { leadId: string; contact: Prisma.ContactCreateManyInput }[] = []
  const newLeadForExisting: Prisma.LeadCreateManyInput[] = []
  const batchId = randomUUID()
  const now = new Date()

  cleaned.forEach((c, i) => {
    if ("skip" in c) {
      outcomes.push({ line: c.line, name: c.name, status: "skipped", reason: c.skip })
      summary.skipped++
      return
    }
    const hasStrongKey = !!(c.externalId || c.siret || c.domain || c.nameKey || c.phone || c.email)
    if (!hasStrongKey) {
      outcomes.push({ line: c.line, name: c.name, status: "skipped", reason: "Pas assez d’informations pour éviter les doublons : ajoutez une ville, un site, un téléphone ou un email.", warnings: c.warnings })
      summary.skipped++
      return
    }

    const hit: [string, string | undefined][] = [
      ["même identifiant source", c.externalId ? index.externalId.get(c.externalId) : undefined],
      ["même SIRET", c.siret ? index.siret.get(c.siret) : undefined],
      ["même site web", c.domain ? index.domain.get(c.domain) : undefined],
      ["même nom et même ville", c.nameKey ? index.nameKey.get(c.nameKey) : undefined],
      ["même téléphone", c.phone ? index.phone.get(c.phone) : undefined],
      ["même contact", c.email ? index.email.get(c.email) : undefined],
    ]
    const found = hit.find(([, id]) => id)
    const suppressed = !!c.email && (suppressedEmails.has(c.email) || suppressedDomains.has(emailDomain(c.email)))

    if (found) {
      const known = companyById.get(found[1]!)
      const filled: string[] = []
      if (known) {
        const data: Prisma.CompanyUpdateInput = {}
        const fill = (field: keyof Known["fields"], value: string | null) => {
          if (value && !known.fields[field]) {
            ;(data as Record<string, unknown>)[field] = value
            known.fields[field] = value
            filled.push(field)
          }
        }
        fill("website", c.website); fill("phone", c.phone); fill("email", c.email); fill("address", c.address); fill("city", c.city)
        fill("postalCode", c.postalCode); fill("sector", c.sector); fill("siret", c.siret); fill("domain", c.domain)
        if (filled.includes("city")) {
          const k = nameKey(known.name, c.city)
          if (k) { data.nameKey = k; known.fields.nameKey = k }
        }
        if (Object.keys(data).length) companyUpdates.set(known.companyId, { ...companyUpdates.get(known.companyId), ...data })
        addToIndex(known.companyId, known.fields)
        const merged = uniq([...known.tags, ...c.tags])
        if (known.leadId && merged.length !== known.tags.length) {
          leadTagUpdates.set(known.leadId, merged.slice(0, 20))
          known.tags = merged.slice(0, 20)
          filled.push("étiquettes")
        }
        if (known.leadId && !known.hasContact && (c.contactName || c.email) && !(c.email && existingContacts.has(c.email))) {
          contactForExisting.push({ leadId: known.leadId, contact: { id: randomUUID(), workspaceId: ws, companyId: known.companyId, name: c.contactName, jobTitle: c.jobTitle, email: c.email, emailKind: c.emailKind, phone: c.phone, source: options.source === "CSV" ? "CSV" : "EXTRACTOR", collectedFrom: options.fileName ?? options.source, collectedAt: now, legalBasis: c.email ? "legitimate_interest_b2b" : null, doNotContact: suppressed, doNotContactReason: suppressed ? "Adresse présente dans la liste d’exclusion" : null } })
          if (c.email) existingContacts.set(c.email, known.companyId)
          known.hasContact = true
          filled.push("contact")
        }
        if (!known.leadId) {
          const leadId = randomUUID()
          known.leadId = leadId
          newLeadForExisting.push({ id: leadId, workspaceId: ws, companyId: known.companyId, source: options.source === "CSV" ? "CSV" : "EXTRACTOR", importBatchId: batchId, tags: c.tags })
          filled.push("fiche créée")
        }
      }
      summary.existing++
      if (filled.length) {
        summary.enriched++
        const lead = known?.leadId
        if (lead) {
          toRescore.add(lead)
          newActivities.push({ id: randomUUID(), workspaceId: ws, leadId: lead, actorId: user.id, actorKind: "USER", kind: "SYSTEM", body: `Complétée par l’import : ${filled.join(", ")}`, occurredAt: now })
        }
      }
      outcomes.push({ line: c.line, name: c.name, status: "existing", reason: `Existe déjà (${found[0]})`, warnings: c.warnings, filled })
      return
    }

    // New business.
    const companyId = randomUUID()
    const leadId = randomUUID()
    const contactId = c.contactName || c.email ? randomUUID() : null
    const source = options.source === "CSV" ? "CSV" : "EXTRACTOR"
    newCompanies.push({ id: companyId, workspaceId: ws, name: c.name, domain: c.domain, website: c.website, phone: c.phone, email: c.email, address: c.address, city: c.city, postalCode: c.postalCode, country: c.country, sector: c.sector, siret: c.siret, nameKey: c.nameKey, source, externalId: c.externalId, externalSource: c.externalId ? options.source.toLowerCase() : null })
    if (contactId) newContacts.push({ id: contactId, workspaceId: ws, companyId, name: c.contactName, jobTitle: c.jobTitle, email: c.email, emailKind: c.emailKind, phone: c.phone, source, collectedFrom: options.fileName ?? options.source, collectedAt: now, legalBasis: c.email ? "legitimate_interest_b2b" : null, doNotContact: suppressed, doNotContactReason: suppressed ? "Adresse présente dans la liste d’exclusion" : null })
    const { score, reasons } = scoreLead({ email: c.email, emailKind: c.emailKind, phone: c.phone, website: c.website, domain: c.domain, contactName: c.contactName, address: c.address, city: c.city })
    newLeads.push({ id: leadId, workspaceId: ws, companyId, contactId, source, status: suppressed ? "DO_NOT_CONTACT" : "NEW", score, scoreReasons: reasons as unknown as Prisma.InputJsonValue, tags: c.tags, importBatchId: batchId, createdAt: new Date(now.getTime() + i) })
    newActivities.push({ id: randomUUID(), workspaceId: ws, leadId, actorId: user.id, actorKind: "USER", kind: "SYSTEM", body: `Importé (${options.fileName ?? options.source})`, occurredAt: now })

    addToIndex(companyId, { externalId: c.externalId, siret: c.siret, domain: c.domain, nameKey: c.nameKey, phone: c.phone })
    if (c.email) { index.email.set(c.email, companyId); existingContacts.set(c.email, companyId) }
    companyById.set(companyId, { companyId, leadId, name: c.name, fields: { website: c.website, phone: c.phone, email: c.email, address: c.address, city: c.city, postalCode: c.postalCode, sector: c.sector, siret: c.siret, domain: c.domain, nameKey: c.nameKey }, hasContact: !!contactId, tags: c.tags })
    summary.created++
    outcomes.push({ line: c.line, name: c.name, status: "created", warnings: c.warnings })
  })
  summary.warnings = outcomes.reduce((n, o) => n + (o.warnings?.length ?? 0), 0)

  const result = (committed: boolean, id: string | null): ImportResult => ({
    committed,
    batchId: id,
    summary,
    rows: outcomes.slice(0, 100),
    issues: outcomes.filter((o) => o.status === "skipped" || o.warnings?.length).slice(0, 500),
  })
  if (!options.commit) return result(false, null)

  // --- Apply, all or nothing ---------------------------------------------------------------------------------------
  await prisma.$transaction(
    async (tx) => {
      await tx.importBatch.create({
        data: {
          id: batchId, workspaceId: ws, source: options.source, status: "DONE", extractorJobId: options.extractorJobId, createdById: user.id,
          params: { fileName: options.fileName ?? null }, total: summary.total, created: summary.created, existing: summary.existing, skipped: summary.skipped, finishedAt: now,
        },
      })
      for (const part of chunk(newCompanies, 1000)) await tx.company.createMany({ data: part })
      for (const part of chunk(newContacts, 1000)) await tx.contact.createMany({ data: part })
      for (const part of chunk(newLeads, 1000)) await tx.lead.createMany({ data: part })
      for (const part of chunk(newLeadForExisting, 1000)) await tx.lead.createMany({ data: part })
      for (const part of chunk(newActivities, 1000)) await tx.activity.createMany({ data: part })
      for (const [id, data] of companyUpdates) await tx.company.update({ where: { id }, data })
      for (const [id, tags] of leadTagUpdates) await tx.lead.update({ where: { id }, data: { tags } })
      for (const { leadId, contact } of contactForExisting) {
        await tx.contact.create({ data: contact })
        await tx.lead.update({ where: { id: leadId }, data: { contactId: contact.id } })
      }
      for (const id of toRescore) await rescore(tx, id)
    },
    { timeout: 120_000, maxWait: 10_000 }
  )
  await audit({
    action: "lead.import", actorId: user.id, workspaceId: ws, entityType: "ImportBatch", entityId: batchId, ip: options.ip,
    metadata: { source: options.source, fileName: options.fileName ?? null, ...summary },
  })
  return result(true, batchId)
}
