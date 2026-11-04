import type { CampaignWatch, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { utc } from "@/lib/ai/sql"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { addDays, dayKey, startOfDay } from "@/lib/crm/day"
import { toCrmRole } from "@/lib/crm/roles"
import { can } from "@/lib/rbac"
import { runImport, type ImportRow } from "@/features/leads/import"
import { sortAfterImport } from "@/features/relevance/service"
import { ANNUAIRE_GAP_MS, identityUpdate } from "@/features/enrichment/identity"
import { findCompany, type AnnuaireDeps, type CompanyRecord } from "@/features/enrichment/sources/annuaire"
import { fetchNotices, type BodaccDeps, type BodaccNotice } from "@/features/enrichment/sources/bodacc"
import { SIGNAL_LABELS, WATCH_FAMILIES, WATCH_KINDS, activityMatches, nafMatches, signalsOf, type WatchKind, type WatchSector } from "./kinds"
import { companiesBySiren, notify, saveSignals } from "./store"

/**
 * A campaign's watch of the BODACC (E30, D50). Each morning it reads the new companies and the businesses that changed
 * hands in its départements, checks each one in the annuaire (activity code, public record, no objection, still open),
 * and imports those of its sectors into the campaign; Jev sorts them, and nothing is sent without a person's click.
 * It acts for its owner: their rights are read again at every pass, and a watch whose owner lost them stops.
 * Worker-safe: no Next import.
 */
export const RUN_MINUTE = 7 * 60 + 30
/** Lookups in the annuaire per pass: about a minute. What is left waits for the next morning. */
export const MAX_LOOKUPS = 300
/** A watch reads back two days, so a company the annuaire did not know yet is tried again. */
export const LOOKBACK_DAYS = 2
export const FIRST_DAYS = 7
const LOCK_MS = 15 * 60_000

export interface WatchReport {
  at: string
  from: string
  to: string
  notices: number
  candidates: number
  created: number
  existing: number
  /** Not yet in the annuaire: tried again at the next pass while within the window. */
  pending: number
  rejected: { sector: number; closed: number; withheld: number; unknown: number }
  byKind: Partial<Record<WatchKind, number>>
  truncated: boolean
  error?: string
}

/** The next 7:30 in Paris (the BODACC publishes in the morning). */
export function nextMorning(now: Date): Date {
  const today = dayKey(now)
  const at = (key: string) => new Date(startOfDay(key).getTime() + RUN_MINUTE * 60_000)
  const t = at(today)
  return t.getTime() > now.getTime() ? t : at(addDays(today, 1))
}

export const sectorsOf = (json: Prisma.JsonValue | null | undefined): WatchSector[] =>
  Array.isArray(json)
    ? json.flatMap((s) => {
        const o = s as Record<string, unknown> | null
        if (!o || typeof o.key !== "string" || typeof o.label !== "string") return []
        const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [])
        return [{ key: o.key, label: o.label, naf: list(o.naf), keywords: list(o.keywords) }]
      })
    : []

export const watchKinds = (w: Pick<CampaignWatch, "kinds">): WatchKind[] => WATCH_KINDS.filter((k) => w.kinds.includes(k))

/** The person a watch acts for, with their role of now; null when the account is gone, off or lacks the rights. */
export async function ownerOf(w: Pick<CampaignWatch, "ownerId" | "workspaceId">): Promise<CurrentUser | null> {
  if (!w.ownerId) return null
  const u = await prisma.user.findUnique({ where: { id: w.ownerId }, select: { id: true, name: true, email: true, image: true, role: true, active: true, workspaceId: true } })
  const role = toCrmRole(u?.role)
  if (!u || !u.active || !role || u.workspaceId !== w.workspaceId || !can(role, "lead:import") || !can(role, "campaign:manage")) return null
  return { id: u.id, workspaceId: w.workspaceId, name: u.name ?? u.email ?? "", email: u.email ?? "", image: u.image, role }
}

/** Takes the next watch that is due, for this worker, for 15 minutes at most. */
export async function claimWatch(workerId: string, now = new Date()): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "CampaignWatch" SET "lockedBy" = ${workerId}, "lockedAt" = ${utc(now)}
     WHERE "id" = (
       SELECT "id" FROM "CampaignWatch"
        WHERE "active" AND "nextRunAt" <= ${utc(now)} AND ("lockedAt" IS NULL OR "lockedAt" < ${utc(new Date(now.getTime() - LOCK_MS))})
        ORDER BY "nextRunAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED)
 RETURNING "id"`
  return rows[0]?.id ?? null
}

export interface WatchDeps {
  bodacc?: BodaccDeps
  annuaire?: AnnuaireDeps
  gapMs?: number
  signal?: AbortSignal
}

const pause = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve())
const clip = (s: string | null, max: number) => (s && s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s)

/** The import row of a company the registry vouched for. */
function rowOf(n: BodaccNotice, r: CompanyRecord, sectors: WatchSector[]): ImportRow {
  const sector = sectors.find((s) => r.naf && s.naf.includes(r.naf))?.label ?? clip(n.activity, 80) ?? undefined
  return {
    name: n.tradeName ?? r.name,
    city: r.city ?? n.city ?? undefined,
    postalCode: r.postalCode ?? n.postalCode ?? undefined,
    siret: r.siret ?? undefined,
    sector,
    externalId: `siren:${r.siren}`,
    data: { siren: r.siren, naf: r.naf, registry: { notice: n.id, family: n.family } },
  }
}

/** One pass of a claimed watch. Always gives the watch back, with its report and its next morning. */
export async function runWatch(id: string, workerId: string, deps: WatchDeps = {}, now = new Date()): Promise<WatchReport | null> {
  const w = await prisma.campaignWatch.findUnique({ where: { id }, include: { campaign: { select: { id: true, name: true, archivedAt: true, ownerId: true } } } })
  if (!w || w.lockedBy !== workerId) return null
  const today = dayKey(now)
  const from = w.cursorDay ? addDays(w.cursorDay.toISOString().slice(0, 10), -LOOKBACK_DAYS) : addDays(today, -FIRST_DAYS)
  const report: WatchReport = { at: now.toISOString(), from, to: today, notices: 0, candidates: 0, created: 0, existing: 0, pending: 0, rejected: { sector: 0, closed: 0, withheld: 0, unknown: 0 }, byKind: {}, truncated: false }
  const release = (data: Prisma.CampaignWatchUpdateInput) =>
    prisma.campaignWatch.updateMany({ where: { id, lockedBy: workerId }, data: { ...data, lockedBy: null, lockedAt: null, lastRunAt: now, lastReport: report as unknown as Prisma.InputJsonValue } })

  const owner = await ownerOf(w)
  if (!owner || w.campaign.archivedAt || !w.active) {
    report.error = w.campaign.archivedAt ? "Campagne archivée : la veille s'est arrêtée." : "Le responsable de la veille n'a plus les droits d'importer dans une campagne : la veille s'est arrêtée."
    await release({ active: false, nextRunAt: null })
    if (w.active) await notify([w.ownerId, w.campaign.ownerId], { title: `Veille arrêtée : ${w.campaign.name}`, message: report.error })
    return report
  }

  try {
    const sectors = sectorsOf(w.sectors)
    const kinds = watchKinds(w)
    const { notices, truncated } = await fetchNotices({ families: kinds.flatMap((k) => WATCH_FAMILIES[k]), departments: w.departments, from, to: today }, { ...deps.bodacc, signal: deps.signal })
    report.notices = notices.length
    report.truncated = truncated
    const done = new Set(
      (await prisma.companySignal.findMany({ where: { workspaceId: w.workspaceId, externalKey: { in: notices.map((n) => `bodacc:${n.id}`) } }, select: { externalKey: true } })).map((s) => s.externalKey)
    )
    // The free-text activity sorts out most notices before any lookup; a notice without one is checked by its code.
    // A notice that says nothing for the watch (a merger among the sales) is not looked up.
    const fresh = notices.filter((n) => n.sirens[0] && !done.has(`bodacc:${n.id}`) && signalsOf(n).length > 0)
    const candidates = fresh.filter((n) => !n.activity || activityMatches(n.activity, sectors))
    report.candidates = candidates.length
    report.rejected.sector = fresh.length - candidates.length

    const accepted: { n: BodaccNotice; r: CompanyRecord }[] = []
    const recent = addDays(today, -LOOKBACK_DAYS)
    for (const [i, n] of candidates.entries()) {
      if (deps.signal?.aborted) break
      if (i >= MAX_LOOKUPS) {
        report.pending += candidates.length - i
        break
      }
      const { record: r, error } = await findCompany({ siren: n.sirens[0], name: n.name }, deps.annuaire)
      await pause(deps.gapMs ?? ANNUAIRE_GAP_MS)
      if (!r) {
        if (error || n.publishedOn >= recent) report.pending++
        else report.rejected.unknown++
        continue
      }
      if (!r.diffusible || r.opposition) report.rejected.withheld++
      else if (!r.active) report.rejected.closed++
      else if (!nafMatches(r.naf, sectors) && !(r.naf === null && n.activity && activityMatches(n.activity, sectors))) report.rejected.sector++
      else accepted.push({ n, r })
    }

    if (accepted.length) {
      const result = await runImport(owner, accepted.map(({ n, r }) => rowOf(n, r, sectors)), { commit: true, source: "REGISTRY", fileName: `Veille BODACC · ${w.campaign.name}`, campaignId: w.campaignId })
      report.created = result.summary.created
      report.existing = result.summary.existing
      const records = new Map(accepted.map(({ r }) => [r.siren, r]))
      const companies = await prisma.company.findMany({ where: { workspaceId: w.workspaceId, OR: [{ externalId: { in: accepted.map(({ r }) => `siren:${r.siren}`) } }, { siren: { in: [...records.keys()] } }] }, select: { id: true, name: true, siren: true, siret: true, postalCode: true, legalState: true, data: true, externalId: true } })
      for (const c of companies) {
        const r = records.get(c.siren ?? c.externalId?.replace(/^siren:/, "") ?? "")
        if (r) await prisma.company.update({ where: { id: c.id }, data: identityUpdate(c, { record: r, error: null }, now) })
      }
      const drafts = accepted.flatMap(({ n }) => signalsOf(n))
      const saved = await saveSignals(w.workspaceId, drafts, await companiesBySiren(w.workspaceId, [...new Set(drafts.map((d) => d.siren))]), { watchId: w.id })
      for (const s of saved) if (s.kind === "CREATED" || s.kind === "TAKEOVER") report.byKind[s.kind] = (report.byKind[s.kind] ?? 0) + 1
      if (report.created > 0) await sortAfterImport(owner, w.campaignId)
    }

    if (report.created > 0) {
      const what = WATCH_KINDS.filter((k) => report.byKind[k]).map((k) => `${SIGNAL_LABELS[k].toLowerCase()}s ${report.byKind[k]}`).join(", ")
      await notify([w.ownerId, w.campaign.ownerId], {
        title: `Veille : ${report.created} nouvelle${report.created > 1 ? "s" : ""} fiche${report.created > 1 ? "s" : ""}`,
        message: `Campagne « ${w.campaign.name} »${what ? ` (${what})` : ""}. Jev les trie ; rien n'est envoyé sans votre clic.`,
      })
    }
    await release({ cursorDay: new Date(`${today}T00:00:00Z`), nextRunAt: nextMorning(now) })
  } catch (error) {
    report.error = error instanceof Error ? error.message : "Erreur inconnue"
    // A source that does not answer is tried again in an hour, without moving the cursor.
    await release({ nextRunAt: new Date(now.getTime() + 3600_000) })
  }
  await audit({ action: "campaign.watch_run", actorId: null, workspaceId: w.workspaceId, entityType: "CampaignWatch", entityId: w.id, metadata: { ...report } as unknown as Prisma.InputJsonValue })
  return report
}
