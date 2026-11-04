import type { Company, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { utc } from "@/lib/ai/sql"
import { ANNUAIRE_SOURCE, findCompany, type AnnuaireDeps, type CompanyRecord } from "./sources/annuaire"

/**
 * A company's identity from the registry (E30, D45): SIREN, activity code, creation date, headcount, legal state, and
 * the officers it lists. Free (the annuaire des entreprises), so every French fiche gets it, in the background, and
 * again every 90 days. Officers are only proposed: a person adds one as a contact with a click.
 */
export const IDENTITY_REFRESH_DAYS = 90
/** Five lookups a second at most: the annuaire allows seven per address. */
export const ANNUAIRE_GAP_MS = 200
export const IDENTITY_BATCH = 25

export interface IdentityData {
  source: string
  url: string | null
  checkedAt: string
  found: boolean
  error?: string
  officers: { name: string; role: string | null }[]
  /** INSEE category: PME, ETI or GE. */
  category: string | null
  labels: string[]
  legalForm: string | null
  /** E30 lot 2: the company objected to commercial use of its registry data: nobody is searched for it. */
  opposition?: boolean
}

type Target = Pick<Company, "id" | "name" | "siren" | "siret" | "postalCode" | "legalState" | "data">
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)

export const identityOf = (data: unknown): IdentityData | null => (isObj(data) && isObj(data.identity) ? (data.identity as unknown as IdentityData) : null)

/** The update a registry answer makes. It never clears a legal state the BODACC set: only the registry closing it. */
export function identityUpdate(c: Target, found: { record: CompanyRecord | null; error: string | null }, now: Date): Prisma.CompanyUpdateInput {
  const r = found.record
  const identity: IdentityData = {
    source: ANNUAIRE_SOURCE,
    url: r?.url ?? null,
    checkedAt: now.toISOString(),
    found: !!r,
    ...(found.error ? { error: found.error } : {}),
    officers: r?.officers ?? [],
    category: r?.category ?? null,
    labels: r?.labels ?? [],
    legalForm: r?.legalForm ?? null,
    opposition: r?.opposition ?? false,
  }
  const update: Prisma.CompanyUpdateInput = { identityCheckedAt: now, data: { ...(isObj(c.data) ? c.data : {}), identity } as unknown as Prisma.InputJsonValue }
  if (!r) return update
  update.siren = r.siren
  if (!c.siret && r.siret && /^\d{14}$/.test(r.siret)) update.siret = r.siret
  update.nafCode = r.naf
  update.foundedOn = r.createdOn && /^\d{4}-\d{2}-\d{2}$/.test(r.createdOn) ? new Date(`${r.createdOn}T00:00:00Z`) : null
  update.headcountBand = r.employees
  if (!r.active && c.legalState !== "CLOSED") {
    update.legalState = "CLOSED"
    update.legalStateAt = now
  }
  return update
}

const select = { id: true, name: true, siren: true, siret: true, postalCode: true, legalState: true, data: true } as const

/** Looks the company up and saves what the registry says. Never throws on the registry's account. */
export async function refreshIdentity(companyId: string, deps: AnnuaireDeps = {}, now = new Date()): Promise<{ found: boolean; error: string | null }> {
  const c = await prisma.company.findUnique({ where: { id: companyId }, select })
  if (!c) return { found: false, error: "Entreprise introuvable" }
  const found = await findCompany({ siren: c.siren ?? c.siret?.slice(0, 9) ?? null, name: c.name, postalCode: c.postalCode }, deps)
  await prisma.company.update({ where: { id: c.id }, data: identityUpdate(c, found, now) })
  return { found: !!found.record, error: found.error }
}

/**
 * Takes the next French companies to look up, marked at once so two workers never take the same: first those never
 * looked up, newest first, then those not looked up for 90 days. A company with neither SIREN, SIRET nor postal code
 * cannot be found without guessing and is left alone.
 */
export async function claimIdentityBatch(limit = IDENTITY_BATCH, now = new Date()): Promise<string[]> {
  const before = new Date(now.getTime() - IDENTITY_REFRESH_DAYS * 86_400_000)
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "Company" SET "identityCheckedAt" = ${utc(now)}
     WHERE "id" IN (
       SELECT "id" FROM "Company"
        WHERE "country" = 'FR' AND ("siren" IS NOT NULL OR "siret" IS NOT NULL OR "postalCode" IS NOT NULL)
          AND ("identityCheckedAt" IS NULL OR "identityCheckedAt" < ${utc(before)})
        ORDER BY "identityCheckedAt" ASC NULLS FIRST, "createdAt" DESC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)
 RETURNING "id"`
  return rows.map((r) => r.id)
}

const pause = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve) => {
  const t = setTimeout(resolve, ms)
  signal?.addEventListener("abort", () => { clearTimeout(t); resolve() }, { once: true })
})

/** Looks up a claimed batch, one company every 200 ms. */
export async function runIdentityBatch(ids: string[], deps: AnnuaireDeps & { signal?: AbortSignal; gapMs?: number } = {}): Promise<{ checked: number; found: number }> {
  let found = 0
  let checked = 0
  for (const id of ids) {
    if (deps.signal?.aborted) break
    const r = await refreshIdentity(id, deps)
    checked++
    if (r.found) found++
    await pause(deps.gapMs ?? ANNUAIRE_GAP_MS, deps.signal)
  }
  // Stopped midway (the worker shutting down): the rest goes back to the queue.
  if (checked < ids.length) await prisma.company.updateMany({ where: { id: { in: ids.slice(checked) } }, data: { identityCheckedAt: null } })
  return { checked, found }
}
