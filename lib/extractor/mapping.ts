import { inferEmailKind, normalizeEmail } from "@/lib/crm/normalize"
import type { ExtractorBusiness } from "./schemas"

/** An import row as the extractor produces it: the CSV fields plus what a spreadsheet cannot carry. */
export interface ExtractorImportRow {
  name: string
  email?: string
  phone?: string
  website?: string
  address?: string
  city?: string
  postalCode?: string
  country?: string
  sector?: string
  siret?: string
  externalId: string
  rating?: number
  reviewCount?: number
  completeness?: number
  data?: Record<string, unknown>
}

/** The most useful address: a personal one before a generic one, first found otherwise. */
export function bestEmail(emails: string[] | undefined): string | undefined {
  const valid = (emails ?? []).map(normalizeEmail).filter((e): e is string => !!e)
  return valid.find((e) => inferEmailKind(e) === "NOMINATIVE") ?? valid[0]
}

/**
 * Stable identity of the business. The extractor deduplicates sources into one record (`dedup_key`, e.g. "pid:ChIJ…"),
 * so the same business found by two searches maps to the same CRM company. Prefixed so it cannot clash with other sources.
 */
export const externalIdOf = (b: Pick<ExtractorBusiness, "id" | "dedup_key">) => `ext:${b.dedup_key ?? `id:${b.id}`}`

export type Mapped = { row: ExtractorImportRow } | { skip: "closed" }

export function businessToImportRow(b: ExtractorBusiness): Mapped {
  if (b.status === "CLOSED_PERMANENTLY") return { skip: "closed" }
  const email = bestEmail(b.emails)
  return {
    row: {
      name: b.name,
      email,
      phone: b.phone,
      website: b.website,
      address: b.street ?? b.address,
      city: b.city,
      postalCode: b.postal_code,
      country: b.country,
      sector: b.category,
      siret: b.siret,
      externalId: externalIdOf(b),
      rating: b.rating,
      reviewCount: b.reviews_count,
      completeness: b.completeness,
      // Kept for later enrichment, never read by a business rule.
      data: {
        otherEmails: (b.emails ?? []).filter((e) => normalizeEmail(e) !== email),
        socials: b.socials,
        siren: b.siren,
        naf: b.naf,
        placeId: b.place_id,
        lat: b.lat,
        lng: b.lng,
        sources: b.sources,
        sourceUrl: b.source_url,
        status: b.status,
      },
    },
  }
}
