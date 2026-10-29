import type { Prisma, SearchStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { ExtractorError, getExtractorClient, extractorConfig, type ExtractorClient } from "@/lib/extractor/client"
import { bestEmail, businessToImportRow } from "@/lib/extractor/mapping"
import { webhookEventSchema, type ExtractorCounters, type ExtractorHealth, type ExtractorJob } from "@/lib/extractor/schemas"
import { verifyWebhook } from "@/lib/extractor/webhook"
import { LeadError } from "@/features/leads/errors"
import { MAX_IMPORT_ROWS, runImport, type ImportResult, type ImportRow } from "@/features/leads/import"
import { MAX_SEARCH_RESULTS, type ImportOptions, type StartSearchInput } from "./schemas"

export const MAX_ACTIVE_SEARCHES_PER_USER = 3
const TERMINAL: SearchStatus[] = ["COMPLETED", "FAILED", "CANCELLED"]
const STATUS: Record<ExtractorJob["status"], SearchStatus> = { queued: "QUEUED", running: "RUNNING", completed: "COMPLETED", failed: "FAILED", cancelled: "CANCELLED" }

export interface SearchCounters {
  rawFound: number
  unique: number
  complete: number
  crmUseful: number
  enriched: number
  tasksTotal: number
  tasksDone: number
  tasksFailed: number
}

export interface SearchView {
  id: string
  label: string
  status: SearchStatus
  error: string | null
  counters: SearchCounters
  spec: { activity: string; location: string; country?: string; enrich: boolean; maxResults: number }
  createdByName: string | null
  createdAt: string
  finishedAt: string | null
  importedCount: number
  lastImportAt: string | null
  active: boolean
}

const zero: SearchCounters = { rawFound: 0, unique: 0, complete: 0, crmUseful: 0, enriched: 0, tasksTotal: 0, tasksDone: 0, tasksFailed: 0 }

export function toCounters(c: ExtractorCounters | undefined): SearchCounters {
  return {
    rawFound: c?.raw_found ?? 0, unique: c?.unique ?? 0, complete: c?.complete ?? 0, crmUseful: c?.crm_useful ?? 0, enriched: c?.enriched ?? 0,
    tasksTotal: c?.tasks_total ?? 0, tasksDone: c?.tasks_done ?? 0, tasksFailed: c?.tasks_failed ?? 0,
  }
}

type Row = Prisma.ExtractionSearchGetPayload<{ include: { createdBy: { select: { name: true; email: true } } } }>
const include = { createdBy: { select: { name: true, email: true } } } as const

function toView(s: Row): SearchView {
  return {
    id: s.id,
    label: s.label,
    status: s.status,
    error: s.error,
    counters: { ...zero, ...((s.counters as Partial<SearchCounters> | null) ?? {}) },
    spec: s.spec as SearchView["spec"],
    createdByName: s.createdBy?.name ?? s.createdBy?.email ?? null,
    createdAt: s.createdAt.toISOString(),
    finishedAt: s.finishedAt?.toISOString() ?? null,
    importedCount: s.importedCount,
    lastImportAt: s.lastImportAt?.toISOString() ?? null,
    active: !TERMINAL.includes(s.status),
  }
}

/** Webhook target the extractor can reach: public https only (it refuses private addresses) and only when we can verify its signature. */
export function webhookUrl(env: Record<string, string | undefined> = process.env): string | undefined {
  if (!env.EXTRACTOR_WEBHOOK_SECRET) return undefined
  const base = env.EXTRACTOR_WEBHOOK_BASE_URL || env.NEXT_PUBLIC_APP_URL
  try {
    const u = new URL(base ?? "")
    const local = /^(localhost|127\.|10\.|192\.168\.|0\.0\.0\.0|\[::1\])/.test(u.hostname) || u.hostname.endsWith(".local")
    return u.protocol === "https:" && !local ? `${u.origin}/api/webhooks/extractor` : undefined
  } catch {
    return undefined
  }
}

export const isConfigured = () => extractorConfig() !== null

// ---------------------------------------------------------------------------------------------------------------
// Starting, following, cancelling
// ---------------------------------------------------------------------------------------------------------------

export async function startSearch(user: CurrentUser, input: StartSearchInput, ip?: string | null, client: Pick<ExtractorClient, "createJob"> = getExtractorClient()): Promise<SearchView> {
  const active = await prisma.extractionSearch.count({ where: { createdById: user.id, status: { in: ["QUEUED", "RUNNING"] } } })
  if (active >= MAX_ACTIVE_SEARCHES_PER_USER) {
    throw new LeadError("conflict", `Vous avez déjà ${MAX_ACTIVE_SEARCHES_PER_USER} recherches en cours : attendez la fin de l’une d’elles ou annulez-en une.`, 409)
  }
  const spec = { activity: input.activity, location: input.location, country: input.country, enrich: input.enrich, maxResults: Math.min(input.maxResults, MAX_SEARCH_RESULTS) }
  // The row exists before the job: its id is the idempotency key, so a retry after a network error cannot start a second search.
  const row = await prisma.extractionSearch.create({
    data: { workspaceId: user.workspaceId, createdById: user.id, label: `${input.activity} — ${input.location}`, spec },
    include,
  })
  try {
    const { job } = await client.createJob(
      { query: input.activity, location: input.location, country: input.country, language: "fr", enrich: input.enrich, max_results: spec.maxResults, webhook_url: webhookUrl() },
      `crm-search-${row.id}`
    )
    const updated = await prisma.extractionSearch.update({
      where: { id: row.id },
      data: { extractorJobId: job.id, status: STATUS[job.status], counters: toCounters(job.counters) as unknown as Prisma.InputJsonValue },
      include,
    })
    await audit({ action: "search.started", actorId: user.id, workspaceId: user.workspaceId, entityType: "ExtractionSearch", entityId: row.id, metadata: spec, ip })
    return toView(updated)
  } catch (error) {
    // Keep the row, marked failed with the reason, so the person sees what happened instead of a vanished search.
    await prisma.extractionSearch.update({ where: { id: row.id }, data: { status: "FAILED", error: error instanceof ExtractorError ? error.message : "Échec du lancement.", finishedAt: new Date() } })
    throw error
  }
}

/** Folds the extractor's view of a job into the stored search. Returns true when it just became final. */
async function apply(search: { id: string; status: SearchStatus }, job: ExtractorJob): Promise<{ terminalNow: boolean; row: Row }> {
  const status = STATUS[job.status]
  const finished = TERMINAL.includes(status)
  const row = await prisma.extractionSearch.update({
    where: { id: search.id },
    data: {
      status,
      counters: toCounters(job.counters) as unknown as Prisma.InputJsonValue,
      error: job.error ?? null,
      // Our own clock, not the extractor's: a server a few seconds off would make the duration absurd.
      ...(finished && !TERMINAL.includes(search.status) ? { finishedAt: new Date() } : {}),
    },
    include,
  })
  return { terminalNow: finished && !TERMINAL.includes(search.status), row }
}

async function load(user: CurrentUser, id: string) {
  const s = await prisma.extractionSearch.findFirst({ where: { id, workspaceId: user.workspaceId }, include })
  if (!s) throw new LeadError("not_found", "Recherche introuvable.", 404)
  return s
}

/** Current state of a search. While it runs, asks the extractor; once final, answers from the stored copy. */
export async function refreshSearch(user: CurrentUser, id: string): Promise<SearchView> {
  const s = await load(user, id)
  if (!s.extractorJobId || TERMINAL.includes(s.status)) return toView(s)
  const job = await getExtractorClient().getJob(s.extractorJobId)
  return toView((await apply(s, job)).row)
}

/** For a page load: the live state when the extractor answers, the stored copy when it does not. */
export async function getSearchView(user: CurrentUser, id: string): Promise<SearchView> {
  try {
    return await refreshSearch(user, id)
  } catch (error) {
    if (error instanceof ExtractorError && error.kind !== "not_found") return toView(await load(user, id))
    throw error
  }
}

/** Why a search failed or lost tasks, grouped by cause (the extractor does the grouping). */
export async function searchErrors(user: CurrentUser, id: string) {
  const s = await load(user, id)
  if (!s.extractorJobId) return { summary: s.error ?? "", failedTasks: 0, retryingTasks: 0 }
  const e = await getExtractorClient().jobErrors(s.extractorJobId)
  return { summary: e.summary || e.job_error || "", failedTasks: e.tasks_failed ?? 0, retryingTasks: e.tasks_retrying ?? 0 }
}

export async function listSearches(user: CurrentUser, limit = 20): Promise<SearchView[]> {
  const rows = await prisma.extractionSearch.findMany({ where: { workspaceId: user.workspaceId }, orderBy: { createdAt: "desc" }, take: limit, include })
  if (!isConfigured()) return rows.map(toView)
  // Searches still running are brought up to date, a few at a time; a failure here must not break the page.
  const client = getExtractorClient()
  const fresh = await Promise.all(
    rows.map(async (s) => {
      if (!s.extractorJobId || TERMINAL.includes(s.status)) return s
      try {
        return (await apply(s, await client.getJob(s.extractorJobId))).row
      } catch {
        return s
      }
    })
  )
  return fresh.map(toView)
}

export async function cancelSearch(user: CurrentUser, id: string, ip?: string | null): Promise<SearchView> {
  const s = await load(user, id)
  if (TERMINAL.includes(s.status)) throw new LeadError("conflict", "Cette recherche est déjà terminée.", 409)
  if (s.extractorJobId) await getExtractorClient().cancelJob(s.extractorJobId)
  const row = await prisma.extractionSearch.update({ where: { id }, data: { status: "CANCELLED", finishedAt: new Date() }, include })
  await audit({ action: "search.cancelled", actorId: user.id, workspaceId: user.workspaceId, entityType: "ExtractionSearch", entityId: id, ip })
  return toView(row)
}

// ---------------------------------------------------------------------------------------------------------------
// Results and import
// ---------------------------------------------------------------------------------------------------------------

export interface ResultRow {
  id: number
  name: string
  category: string | null
  city: string | null
  phone: string | null
  website: string | null
  email: string | null
  rating: number | null
  reviews: number | null
  completeness: number | null
}

/** A page of what the extractor has found so far, for the preview table. */
export async function searchResults(user: CurrentUser, id: string, options: Pick<ImportOptions, "useful" | "hasEmail" | "minCompleteness"> & { cursor?: string; limit?: number }) {
  const s = await load(user, id)
  if (!s.extractorJobId) return { rows: [] as ResultRow[], nextCursor: null as string | null, hasMore: false }
  const page = await getExtractorClient().businesses(s.extractorJobId, {
    cursor: options.cursor, limit: Math.min(options.limit ?? 25, 100), useful: options.useful, has_email: options.hasEmail, min_completeness: options.minCompleteness || undefined,
  })
  return {
    rows: page.items.map((b): ResultRow => ({
      id: b.id, name: b.name, category: b.category ?? null, city: b.city ?? null, phone: b.phone ?? null, website: b.website ?? null,
      email: bestEmail(b.emails) ?? null, rating: b.rating ?? null, reviews: b.reviews_count ?? null, completeness: b.completeness ?? null,
    })),
    nextCursor: page.next_cursor ?? null,
    hasMore: !!page.has_more,
  }
}

export interface ExtractorImportResult extends ImportResult {
  /** Results the extractor returned but the CRM never imports (permanently closed). */
  excluded: { closed: number }
  fetched: number
  jobStatus: SearchStatus
}

/**
 * Previews or performs the import of a search's results. The same engine as the CSV import: replaying it, or importing
 * the same business found by another search, adds nothing, because every result carries a stable identity.
 */
export async function importSearch(user: CurrentUser, id: string, options: ImportOptions, ip?: string | null): Promise<ExtractorImportResult> {
  const s = await load(user, id)
  if (!s.extractorJobId) throw new LeadError("conflict", "Cette recherche n’a pas démarré côté Extractor : rien à importer.", 409)
  const client = getExtractorClient()

  const rows: ImportRow[] = []
  let closed = 0
  let fetched = 0
  let cursor: string | undefined
  for (let guard = 0; guard < 50; guard++) {
    const page = await client.businesses(s.extractorJobId, { cursor, limit: 500, useful: options.useful, has_email: options.hasEmail, min_completeness: options.minCompleteness || undefined })
    for (const b of page.items) {
      fetched++
      const mapped = businessToImportRow(b)
      if ("skip" in mapped) closed++
      else rows.push(mapped.row)
    }
    if (!page.has_more || !page.next_cursor || fetched >= MAX_IMPORT_ROWS) break
    cursor = page.next_cursor
  }
  if (rows.length === 0) throw new LeadError("conflict", "Aucun résultat à importer avec ces critères pour l’instant.", 409)

  const result = await runImport(user, rows, { commit: options.commit, source: "EXTRACTOR", fileName: `Extractor · ${s.label}`, extractorJobId: s.extractorJobId, ip })
  if (options.commit) {
    await prisma.extractionSearch.update({ where: { id }, data: { importedCount: { increment: result.summary.created }, lastImportAt: new Date() } })
  }
  return { ...result, excluded: { closed }, fetched, jobStatus: s.status }
}

// ---------------------------------------------------------------------------------------------------------------
// Completion webhook
// ---------------------------------------------------------------------------------------------------------------

export type WebhookOutcome = { status: 200 | 400 | 401; body: Record<string, unknown> }

/** Verified, idempotent: the extractor retries, and a replay must neither duplicate the notification nor revive a finished search. */
export async function handleExtractorWebhook(rawBody: string, headers: Headers, now = Date.now()): Promise<WebhookOutcome> {
  const check = verifyWebhook({ secret: process.env.EXTRACTOR_WEBHOOK_SECRET, timestamp: headers.get("x-cleads-timestamp"), signature: headers.get("x-cleads-signature"), body: rawBody, now })
  if (!check.ok) {
    console.warn("[EXTRACTOR_WEBHOOK] rejected:", check.reason)
    return { status: 401, body: { error: "unauthorized" } }
  }
  let event
  try {
    event = webhookEventSchema.parse(JSON.parse(rawBody))
  } catch {
    return { status: 400, body: { error: "invalid_payload" } }
  }
  const search = await prisma.extractionSearch.findUnique({ where: { extractorJobId: event.job.id } })
  // Not ours (another CRM sharing the extractor): acknowledge so that it stops retrying.
  if (!search) return { status: 200, body: { ignored: true } }

  const { terminalNow, row } = await apply(search, event.job)
  if (terminalNow || (TERMINAL.includes(row.status) && !row.notifiedAt)) {
    // The claim is atomic: two deliveries of the same event notify once.
    const claimed = await prisma.extractionSearch.updateMany({ where: { id: search.id, notifiedAt: null }, data: { notifiedAt: new Date() } })
    if (claimed.count === 1 && search.createdById) {
      const c = toCounters(event.job.counters)
      await prisma.notification.create({
        data: {
          userId: search.createdById,
          type: "SYSTEM",
          title: row.status === "COMPLETED" ? "Recherche terminée" : row.status === "CANCELLED" ? "Recherche annulée" : "Recherche en échec",
          message: row.status === "COMPLETED" ? `« ${search.label} » : ${c.unique} entreprise${c.unique > 1 ? "s" : ""} trouvée${c.unique > 1 ? "s" : ""}, dont ${c.crmUseful} joignable${c.crmUseful > 1 ? "s" : ""}. Vérifiez l’import.` : `« ${search.label} » : ${event.job.error ?? "voir le détail de la recherche"}.`,
        },
      })
    }
  }
  return { status: 200, body: { ok: true } }
}

// ---------------------------------------------------------------------------------------------------------------
// Health: "is Google blocking us?"
// ---------------------------------------------------------------------------------------------------------------

export type HealthView = { state: "ok" | "degraded" | "down" | "unreachable" | "not_configured"; lines: string[]; blocked: string[]; checkedAt: string }

let cached: { at: number; value: HealthView } | null = null
const HEALTH_TTL_MS = 15_000

export function summariseHealth(h: ExtractorHealth): HealthView {
  const blocked = h.sources.filter((s) => s.verdict === "blocked" || s.verdict === "failing" || s.circuit_open).map((s) => s.name)
  return { state: h.status, lines: h.summary.split("\n").filter(Boolean), blocked, checkedAt: h.checked_at ?? new Date().toISOString() }
}

export async function extractorHealth(): Promise<HealthView> {
  const now = Date.now()
  if (cached && now - cached.at < HEALTH_TTL_MS) return cached.value
  let value: HealthView
  if (!isConfigured()) value = { state: "not_configured", lines: [], blocked: [], checkedAt: new Date().toISOString() }
  else {
    try {
      value = summariseHealth(await getExtractorClient().health())
    } catch (error) {
      value = { state: "unreachable", lines: [error instanceof ExtractorError ? error.message : "Cleads Extractor ne répond pas."], blocked: [], checkedAt: new Date().toISOString() }
    }
  }
  cached = { at: now, value }
  return value
}
export const resetHealthCache = () => { cached = null }
