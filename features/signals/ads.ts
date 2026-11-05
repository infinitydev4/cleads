import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { utc } from "@/lib/ai/sql"
import { normalizeName } from "@/lib/crm/normalize"
import { META_ADS_SOURCE, MetaAdsError, PAGES_PER_CALL, checkToken, searchAds, tokenPrint, type MetaAd, type MetaAdsDeps, type MetaTokenState } from "@/features/enrichment/sources/meta-ads"
import { notify } from "./store"

/**
 * E30 lot 3: the ads a company runs now (D49), read by the worker in Meta's Ad Library, once a week for the fiches of
 * the active campaigns, or at once when someone asks from the fiche. What it finds goes into data.ads; ads running give
 * the signal ADS_RUNNING, which the offers and the writer read as the proof of a marketing budget.
 *
 * The page comes from its number when the company's Facebook address gives it, or from a previous read; otherwise from
 * a search on the company's name, kept only for a page whose ads show the company's domain, or whose name is the
 * company's, whole and distinctive. A homonym's page is never taken on a shared word. Worker-safe.
 */
export const ADS_REFRESH_DAYS = 7
export const ADS_BATCH = 10
/** Ads are a state, not an event: a sighting stays recent a month, and each week's read renews it while they run. */
export const ADS_RECENT_DAYS = 30
/** Meta does not publish the Ad Library's quota: the worker keeps well under it, and pauses an hour when told. */
export const ADS_CALLS_PER_HOUR = 120
const TOKEN_CHECK_MS = 6 * 3600_000
const RATE_PAUSE_MS = 3600_000
const DOWN_PAUSE_MS = 15 * 60_000
const ADS_GAP_MS = 1_000
/** A company advertising again after this long is news for its owners. */
const NEWS_AFTER_DAYS = 60
const DAY = 86_400_000

export interface AdsData {
  checkedAt: string
  pageId: string | null
  pageName: string | null
  /** How the page was tied to the company: its number, the domain its ads show, or its name. */
  how: "page" | "domain" | "name" | null
  active: number
  /** More ads run than were read (500 at most). */
  more: boolean
  /** YYYY-MM-DD: the oldest start among the ads running. */
  since: string | null
  platforms: string[]
  domains: string[]
  ads: { id: string; start: string | null; platforms: string[]; title: string | null }[]
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
export const adsOf = (data: unknown): AdsData | null => (isObj(data) && isObj(data.ads) ? (data.ads as unknown as AdsData) : null)

/** The public page of a Facebook page's ads in the Ad Library (no token, no login). */
export const adLibraryPageUrl = (pageId: string) => `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=FR&view_all_page_id=${pageId}`
export const adLibraryAdUrl = (adId: string) => `https://www.facebook.com/ads/library/?id=${adId}`

/**
 * The page a Facebook address names by its number: profile.php?id=…, /pages/<name>/<id>, /people/<name>/<id>, or a
 * name ending with it. A vanity address (facebook.com/plomberie.roche) gives none: resolving it needs an app review.
 */
export function pageIdOf(url: unknown): string | null {
  if (typeof url !== "string") return null
  try {
    const u = new URL(url)
    if (!/(^|\.)facebook\.com$/i.test(u.hostname)) return null
    const id = u.pathname.toLowerCase() === "/profile.php" ? u.searchParams.get("id") : (/^\/(?:pages|people)\/[^/]+\/(\d+)\/?$/.exec(u.pathname)?.[1] ?? /^\/[^/]*-(\d{10,})\/?$/.exec(u.pathname)?.[1])
    return id && /^\d{6,20}$/.test(id) ? id : null
  } catch {
    return null
  }
}

export interface PageMatch {
  pageId: string
  pageName: string
  how: "page" | "domain" | "name"
  ads: MetaAd[]
}

const sameSite = (domain: string, own: string) => domain === own || domain.endsWith(`.${own}`)

/**
 * Among the pages of some ads, the company's: one whose ads show its domain first, else one that bears its name,
 * whole. A name of one word (« Boulangerie ») is matched by its domain only: it would match strangers.
 */
export function matchPage(ads: readonly MetaAd[], c: { name: string; domain: string | null }): PageMatch | null {
  const own = c.domain?.trim().toLowerCase().replace(/^www\./, "") || null
  const name = normalizeName(c.name)
  const words = name.split(" ").filter(Boolean)
  const distinctive = words.length >= 2 && words.some((w) => w.length > 3)
  const pages = new Map<string, MetaAd[]>()
  for (const a of ads) pages.set(a.pageId, [...(pages.get(a.pageId) ?? []), a])
  let best: PageMatch | null = null
  for (const [pageId, list] of pages) {
    const pageName = list[0].pageName
    const byDomain = !!own && list.some((a) => a.domains.some((d) => sameSite(d, own)))
    const page = normalizeName(pageName)
    const byName = distinctive && (page === name || ` ${page} `.includes(` ${name} `))
    if (!byDomain && !byName) continue
    const candidate: PageMatch = { pageId, pageName, how: byDomain ? "domain" : "name", ads: list }
    if (!best || (candidate.how === "domain" && best.how !== "domain") || (candidate.how === best.how && list.length > best.ads.length)) best = candidate
  }
  return best
}

const PLATFORMS: Record<string, string> = { FACEBOOK: "Facebook", INSTAGRAM: "Instagram", MESSENGER: "Messenger", AUDIENCE_NETWORK: "Audience Network", THREADS: "Threads", WHATSAPP: "WhatsApp" }
export const platformLabel = (p: string) => PLATFORMS[p] ?? p.charAt(0) + p.slice(1).toLowerCase().replace(/_/g, " ")

/** What a read found for a company, for data.ads. A known page with no ad running keeps its number. */
export function adsData(found: { pageId: string | null; pageName: string | null; how: AdsData["how"]; ads: readonly MetaAd[] }, more: boolean, now: Date): AdsData {
  const starts = found.ads.map((a) => a.start).filter((s): s is string => !!s).sort()
  return {
    checkedAt: now.toISOString(),
    pageId: found.pageId,
    pageName: found.pageName,
    how: found.how,
    active: found.ads.length,
    more: more && found.ads.length > 0,
    since: starts[0] ?? null,
    platforms: [...new Set(found.ads.flatMap((a) => a.platforms))],
    domains: [...new Set(found.ads.flatMap((a) => a.domains))].slice(0, 5),
    ads: found.ads.slice(0, 5).map((a) => ({ id: a.id, start: a.start, platforms: a.platforms, title: a.titles[0] ?? null })),
  }
}

const DATE = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })
const list = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} et ${items.at(-1)}` : (items[0] ?? ""))

/** One sentence, written by code: « 3 publicités en cours sur Facebook et Instagram, la plus ancienne depuis le 3 octobre 2026. » */
export function adsSummary(d: AdsData): string {
  const count = d.more ? `Plus de ${d.active} publicités en cours` : `${d.active} publicité${d.active > 1 ? "s" : ""} en cours`
  const where = d.platforms.length ? ` sur ${list(d.platforms.map(platformLabel))}` : ""
  const since = d.since ? `, ${d.active > 1 ? "la plus ancienne " : ""}depuis le ${DATE.format(new Date(`${d.since}T00:00:00Z`))}` : ""
  return `${count}${where}${since}.`
}

// The worker's view of Meta: one process, one token. Tests reset it.
let tokenState: MetaTokenState | null = null
let pausedUntil = 0
let hour = { start: 0, calls: 0 }

/** The token's state as the worker last checked it, for its heartbeat (never the token). */
export const adsTokenState = (): MetaTokenState | null => tokenState

/** Tests only. */
export function resetAdsState() {
  tokenState = null
  pausedUntil = 0
  hour = { start: 0, calls: 0 }
}

export interface AdsDeps extends MetaAdsDeps {
  gapMs?: number
}

const tokenOf = (deps: AdsDeps) => (deps.token !== undefined ? deps.token : (process.env.META_ADS_TOKEN ?? null))

/**
 * Whether the worker may read the Ad Library now: a token that works, no pause, calls left this hour. The token is
 * checked every six hours, or at once when it changes, and the owners hear once of one about to expire or refused.
 */
export async function adsReady(deps: AdsDeps = {}, now = new Date()): Promise<boolean> {
  const token = tokenOf(deps)?.trim() || null
  const print = token ? tokenPrint(token) : null
  if (!tokenState || tokenState.print !== print || now.getTime() - new Date(tokenState.checkedAt).getTime() >= TOKEN_CHECK_MS) {
    tokenState = await checkToken({ ...deps, token }, now)
    await tellOwners(tokenState)
  }
  if (!["ok", "expiring", "unknown"].includes(tokenState.state)) return false
  if (now.getTime() < pausedUntil) return false
  if (now.getTime() - hour.start >= 3600_000) hour = { start: now.getTime(), calls: 0 }
  return hour.calls < ADS_CALLS_PER_HOUR
}

/**
 * Claims the companies to read now: those someone asked for, then those of an active campaign not read for a week.
 * Each is dated as it is claimed, so another worker never takes it too; a read that stops gives it back.
 */
export async function claimAdsBatch(limit = ADS_BATCH, now = new Date()): Promise<string[]> {
  const before = new Date(now.getTime() - ADS_REFRESH_DAYS * DAY)
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "Company" SET "adsCheckedAt" = ${utc(now)}
     WHERE "id" IN (
       SELECT c."id" FROM "Company" c
        WHERE c."country" = 'FR' AND c."legalState" = 'ACTIVE'
          AND ((c."adsRequestedAt" IS NOT NULL AND (c."adsCheckedAt" IS NULL OR c."adsCheckedAt" < c."adsRequestedAt"))
            OR ((c."adsCheckedAt" IS NULL OR c."adsCheckedAt" < ${utc(before)})
              AND EXISTS (SELECT 1 FROM "Lead" l JOIN "Campaign" k ON k."id" = l."campaignId"
                           WHERE l."companyId" = c."id" AND k."status" = 'ACTIVE' AND k."archivedAt" IS NULL
                             AND l."status" NOT IN ('DISQUALIFIED', 'DO_NOT_CONTACT'))))
        ORDER BY c."adsRequestedAt" ASC NULLS LAST, c."adsCheckedAt" ASC NULLS FIRST, c."createdAt" DESC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)
 RETURNING "id"`
  return rows.map((r) => r.id)
}

const pause = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t)
        resolve()
      },
      { once: true }
    )
  })

type Target = { id: string; workspaceId: string; name: string; domain: string | null; data: Prisma.JsonValue; pageId: string | null }

export interface AdsReport {
  read: number
  running: number
  signals: number
  error: string | null
}

/**
 * Reads a claimed batch: the known pages ten per call, then each other company by its name. A failure of Meta stops
 * the batch and gives the rest back: a refused token or identity until the token changes, a rate limit for an hour.
 */
export async function runAdsBatch(ids: string[], deps: AdsDeps = {}, now = new Date()): Promise<AdsReport> {
  const token = tokenOf(deps)
  const meta = { ...deps, token }
  const rows = await prisma.company.findMany({ where: { id: { in: ids } }, select: { id: true, workspaceId: true, name: true, domain: true, data: true } })
  const targets: Target[] = rows.map((c) => {
    const socials = isObj(c.data) && isObj(c.data.socials) ? c.data.socials : {}
    return { ...c, pageId: adsOf(c.data)?.pageId ?? pageIdOf(socials.facebook) }
  })
  const report: AdsReport = { read: 0, running: 0, signals: 0, error: null }
  const done = new Set<string>()
  const call = async <T>(read: () => Promise<T>) => {
    hour.calls++
    return read()
  }
  const file = async (t: Target, found: Parameters<typeof adsData>[0], more: boolean) => {
    const d = adsData(found, more, now)
    if (await saveAds(t, d, now)) report.signals++
    report.read++
    if (d.active) report.running++
    done.add(t.id)
  }
  try {
    const known = targets.filter((t) => t.pageId)
    for (let i = 0; i < known.length && !deps.signal?.aborted; i += PAGES_PER_CALL) {
      const part = known.slice(i, i + PAGES_PER_CALL)
      const r = await call(() => searchAds({ pageIds: part.map((t) => t.pageId!) }, meta))
      for (const t of part) {
        const ads = r.ads.filter((a) => a.pageId === t.pageId)
        await file(t, { pageId: t.pageId, pageName: ads[0]?.pageName ?? adsOf(t.data)?.pageName ?? null, how: "page", ads }, r.more)
      }
      await pause(deps.gapMs ?? ADS_GAP_MS, deps.signal)
    }
    for (const t of targets.filter((x) => !x.pageId)) {
      if (deps.signal?.aborted) break
      const r = await call(() => searchAds({ terms: t.name }, meta))
      const match = matchPage(r.ads, t)
      await file(t, match ? { pageId: match.pageId, pageName: match.pageName, how: match.how, ads: match.ads } : { pageId: null, pageName: null, how: null, ads: [] }, r.more)
      await pause(deps.gapMs ?? ADS_GAP_MS, deps.signal)
    }
  } catch (error) {
    if (!(error instanceof MetaAdsError)) throw error
    report.error = error.message
    if (error.kind === "rate") pausedUntil = now.getTime() + RATE_PAUSE_MS
    else if (error.kind === "unavailable") pausedUntil = now.getTime() + DOWN_PAUSE_MS
    else {
      tokenState = { state: error.kind === "identity" ? "identity" : "invalid", expiresAt: tokenState?.expiresAt ?? null, checkedAt: now.toISOString(), print: token ? tokenPrint(token) : null, message: error.message }
      await tellOwners(tokenState)
    }
  } finally {
    // Not read (stopped, refused): back to the queue, first in line once Meta answers again.
    const rest = ids.filter((id) => !done.has(id))
    if (rest.length) await prisma.company.updateMany({ where: { id: { in: rest } }, data: { adsCheckedAt: null } })
  }
  return report
}

/**
 * Files a read: data.ads for the fiche (merged in SQL, so a concurrent write of data keeps its keys), and the month's
 * ADS_RUNNING signal while ads run, renewed by each read. A company that starts advertising is news for its owners.
 * True when a signal was created.
 */
async function saveAds(t: Target, d: AdsData, now: Date): Promise<boolean> {
  await prisma.$executeRaw`
    UPDATE "Company" SET "data" = COALESCE("data", '{}'::jsonb) || jsonb_build_object('ads', ${JSON.stringify(d)}::jsonb),
           "adsRequestedAt" = CASE WHEN "adsRequestedAt" <= ${utc(now)} THEN NULL ELSE "adsRequestedAt" END
     WHERE "id" = ${t.id}`
  if (!d.active || !d.pageId) return false
  const day = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`)
  const fields = {
    occurredAt: day,
    summary: adsSummary(d).slice(0, 500),
    details: {
      page: d.pageName ?? "",
      pageId: d.pageId,
      active: d.more ? `${d.active}+` : String(d.active),
      since: d.since ?? "",
      platforms: d.platforms.map(platformLabel).join(", "),
      domains: d.domains.join(", "),
      matchedBy: d.how ?? "",
    },
    sourceUrl: adLibraryPageUrl(d.pageId),
    expiresAt: new Date(now.getTime() + ADS_RECENT_DAYS * DAY),
  }
  const externalKey = `meta-ads:${d.pageId}:${now.toISOString().slice(0, 7)}`
  const created = await prisma.companySignal.createManyAndReturn({
    data: [{ workspaceId: t.workspaceId, companyId: t.id, kind: "ADS_RUNNING", source: META_ADS_SOURCE, externalKey, ...fields }],
    skipDuplicates: true,
    select: { id: true },
  })
  if (!created.length) {
    await prisma.companySignal.update({ where: { companyId_externalKey: { companyId: t.id, externalKey } }, data: fields })
    return false
  }
  const before = await prisma.companySignal.count({
    where: { companyId: t.id, kind: "ADS_RUNNING", id: { not: created[0].id }, occurredAt: { gte: new Date(now.getTime() - NEWS_AFTER_DAYS * DAY) } },
  })
  if (!before) {
    const leads = await prisma.lead.findMany({ where: { companyId: t.id, status: { notIn: ["DISQUALIFIED", "DO_NOT_CONTACT"] } }, select: { ownerId: true } })
    await notify(
      leads.map((l) => l.ownerId),
      { title: `Publicités Meta : ${t.name}`, message: `${fields.summary} Une preuve de budget marketing : le détail est sur la fiche.` }
    )
  }
  return true
}

const DAY_FR = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric" })
const RENEW = "Générez un jeton dans l'explorateur de l'API Graph (app cleads), prolongez-le à 60 jours dans l'outil de débogage des jetons, puis posez-le sur le worker : scripts/set-ai-worker-env.sh META_ADS_TOKEN, puis scripts/deploy-ai-worker.sh."

/** The notice a token's state calls for, once per state and token; none while it works, or when there is none. */
export function tokenNotice(s: MetaTokenState): { key: string; title: string; message: string } | null {
  if (!s.print) return null
  if (s.state === "expiring" && s.expiresAt) {
    const on = DAY_FR.format(new Date(s.expiresAt))
    return { key: `expiring:${s.expiresAt.slice(0, 10)}:${s.print}`, title: `Jeton Meta à renouveler avant le ${on}`, message: `La lecture des publicités Meta s'arrêtera le ${on}. ${RENEW}` }
  }
  if (s.state === "expired" || s.state === "invalid") {
    return { key: `invalid:${s.print}`, title: "Jeton Meta expiré ou refusé", message: `Les publicités Meta ne sont plus relues. ${RENEW}` }
  }
  if (s.state === "identity") {
    return {
      key: `identity:${s.print}`,
      title: "Meta : identité à confirmer",
      message: "Meta refuse la lecture de sa bibliothèque publicitaire tant que l'identité du titulaire du jeton n'est pas confirmée. Confirmez-la sur facebook.com/ID (quelques jours), le worker réessaie seul toutes les six heures.",
    }
  }
  return null
}

/**
 * Tells the owners of each workspace, once per notice and token: the notices sent for the token in use are kept, so a
 * state that comes back (an identity still to confirm, checked every six hours) is not told again. Never throws: the
 * state stays on the fiches.
 */
async function tellOwners(s: MetaTokenState): Promise<void> {
  const notice = tokenNotice(s)
  if (!notice) return
  try {
    for (const { workspaceId, metaNotice } of await prisma.signalSweep.findMany({ select: { workspaceId: true, metaNotice: true } })) {
      const sent = (metaNotice ?? "").split(" ").filter(Boolean)
      if (sent.includes(notice.key)) continue
      const kept = [...sent.filter((k) => k.endsWith(`:${s.print}`)), notice.key].slice(-6).join(" ")
      const claimed = await prisma.signalSweep.updateMany({ where: { workspaceId, metaNotice }, data: { metaNotice: kept } })
      if (!claimed.count) continue
      const owners = await prisma.user.findMany({ where: { workspaceId, role: "OWNER", active: true }, select: { id: true } })
      await notify(
        owners.map((o) => o.id),
        notice
      )
    }
  } catch (error) {
    console.warn("[ADS] owners not told", error instanceof Error ? error.message : error)
  }
}
