import type { Prisma, PrismaClient } from "@prisma/client"
import {
  companyDomain, inferEmailKind, nameKey, normalizeEmail, normalizePhone, normalizeSiret, normalizeTags,
} from "@/lib/crm/normalize"
import { LeadError } from "./errors"

type Db = PrismaClient | Prisma.TransactionClient

export interface CompanyInput {
  name?: string | null
  website?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
  postalCode?: string | null
  country?: string | null
  sector?: string | null
  siret?: string | null
}

/**
 * Cleans what a person typed. A value that is present but unusable is an error the person can fix
 * (a typo must not be silently dropped); an empty value is simply absent.
 */
export function cleanCompany(input: CompanyInput) {
  const present = (v?: string | null) => (v?.trim() ? v.trim() : null)
  const email = present(input.email) ? normalizeEmail(input.email) : null
  if (present(input.email) && !email) throw new LeadError("invalid", "Adresse email invalide.")
  const phone = present(input.phone) ? normalizePhone(input.phone) : null
  if (present(input.phone) && !phone) throw new LeadError("invalid", "Téléphone invalide : les numéros étrangers commencent par +.")
  const siret = present(input.siret) ? normalizeSiret(input.siret) : null
  if (present(input.siret) && !siret) throw new LeadError("invalid", "SIRET invalide (14 chiffres).")
  const website = present(input.website)
  const name = present(input.name)
  const city = present(input.city)
  return {
    name,
    website,
    phone,
    email,
    address: present(input.address),
    city,
    postalCode: present(input.postalCode),
    country: present(input.country)?.toUpperCase() ?? null,
    sector: present(input.sector),
    siret,
    domain: companyDomain(website, email),
    nameKey: nameKey(name, city),
  }
}

export function cleanContact(input: { name?: string | null; jobTitle?: string | null; email?: string | null; phone?: string | null }) {
  const present = (v?: string | null) => (v?.trim() ? v.trim() : null)
  const email = present(input.email) ? normalizeEmail(input.email) : null
  if (present(input.email) && !email) throw new LeadError("invalid", "Adresse email du contact invalide.")
  const phone = present(input.phone) ? normalizePhone(input.phone) : null
  if (present(input.phone) && !phone) throw new LeadError("invalid", "Téléphone du contact invalide : les numéros étrangers commencent par +.")
  return { name: present(input.name), jobTitle: present(input.jobTitle), email, emailKind: inferEmailKind(email), phone }
}

export { normalizeTags }

export type MatchReason = "externalId" | "siret" | "domain" | "nameKey" | "phone"
export const MATCH_LABELS: Record<MatchReason, string> = {
  externalId: "même identifiant source",
  siret: "même SIRET",
  domain: "même site web",
  nameKey: "même nom et même ville",
  phone: "même téléphone",
}

export interface CompanyKeys {
  externalId?: string | null
  siret?: string | null
  domain?: string | null
  nameKey?: string | null
  phone?: string | null
}

/** The existing company that is the same business, strongest evidence first. Null when nothing matches. */
export async function matchCompany(db: Db, workspaceId: string, keys: CompanyKeys, excludeId?: string) {
  const attempts: [MatchReason, Prisma.CompanyWhereInput | null][] = [
    ["externalId", keys.externalId ? { externalId: keys.externalId } : null],
    ["siret", keys.siret ? { siret: keys.siret } : null],
    ["domain", keys.domain ? { domain: keys.domain } : null],
    ["nameKey", keys.nameKey ? { nameKey: keys.nameKey } : null],
    ["phone", keys.phone ? { phone: keys.phone } : null],
  ]
  for (const [reason, where] of attempts) {
    if (!where) continue
    const company = await db.company.findFirst({ where: { workspaceId, ...where, ...(excludeId ? { id: { not: excludeId } } : {}) }, orderBy: { createdAt: "asc" } })
    if (company) return { company, reason }
  }
  return null
}
