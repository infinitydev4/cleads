import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { normalizeName } from "@/lib/crm/normalize"
import { flat, perplexityFr, urlKey, type WebSource } from "@/lib/ai/search"
import { recordStep, remainingMicros, type RunContext } from "@/features/ai/runs"
import { LeadError } from "@/features/leads/errors"
import { RECENT_DAYS, legallyBlocked } from "@/features/signals/kinds"
import { gatewaySearcher, type ResearchDeps } from "./search"

/**
 * The GEO probe (E30 lot 2, D52, which lifts D23's « no external probe » for qualified fiches). Three questions written
 * by the code — « meilleur plombier à Lyon »… — go to Perplexity's search, which returns the pages an answer engine
 * draws on; the code then looks for the prospect among them, by its domain first, then by its full name. No model
 * judges: the finding is a dated fact with its sources. Absent, the company gets the signal GEO_ABSENT, which the offers
 * and the writer read as evidence. Once a month per company at most, for the good targets, or on demand.
 */
export const GEO_REFRESH_DAYS = 30
/** Three Perplexity searches and one short call of the fast model, with room to spare (≈ 0,02 €). */
export const GEO_CAP_MICROS = 30_000
export const GEO_SOURCE = "Perplexity (sonde GEO)"

export interface GeoCited {
  host: string
  title: string
  url: string
}

export interface GeoFinding {
  checkedAt: string
  trade: string
  city: string
  questions: string[]
  present: boolean
  /** How it was found: its own site among the sources, or its full name in one of them. */
  matches: { url: string; title: string; how: "domain" | "name" }[]
  /** Who the sources are, its own site left out: competitors and directories. */
  cited: GeoCited[]
  sources: number
  error?: string
}

export const geoOf = (data: unknown): GeoFinding | null => {
  const geo = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>).geo : null
  return geo && typeof geo === "object" && Array.isArray((geo as GeoFinding).questions) ? (geo as GeoFinding) : null
}

/** The trade as people search for it: the fiche's sector, without its qualifiers. */
export function tradeOf(sector: string | null | undefined): string | null {
  const t = (sector ?? "").split(/[,(/·|]/)[0].replace(/\s+/g, " ").trim().toLowerCase()
  return t.length >= 3 && t.length <= 60 ? t : null
}

/** « à Lyon », « au Havre », « aux Mureaux ». */
const inCity = (city: string) => city.replace(/^le\s+(.+)$/i, "au $1").replace(/^les\s+(.+)$/i, "aux $1").replace(/^(?!au |aux )(.+)$/, "à $1")

export const geoQuestions = (trade: string, city: string) => [`meilleur ${trade} ${inCity(city)}`, `${trade} ${city} avis`, `quel ${trade} choisir ${inCity(city)}`]

const hostOf = (url: string) => urlKey(url).split("/")[0]

/** Where the prospect stands among the sources: by its domain, or by its full name when it is distinctive enough. */
export function geoFinding(sources: readonly WebSource[], c: { name: string; domain: string | null }, base: Pick<GeoFinding, "checkedAt" | "trade" | "city" | "questions">): GeoFinding {
  const domain = c.domain?.toLowerCase().replace(/^www\./, "") ?? null
  const ownSite = (url: string) => !!domain && (hostOf(url) === domain || hostOf(url).endsWith(`.${domain}`))
  // A name of one word (« Plomberie ») or made of the question's words would be found everywhere.
  const name = flat(normalizeName(c.name))
  const asked = new Set(flat(`${base.trade} ${base.city}`).split(" "))
  const distinctive = name.split(" ").filter((w) => w.length > 2 && !asked.has(w)).length >= 1 && name.split(" ").length >= 2
  const matches: GeoFinding["matches"] = []
  const cited = new Map<string, GeoCited>()
  for (const s of sources) {
    if (ownSite(s.url)) matches.push({ url: s.url, title: s.title, how: "domain" })
    else if (distinctive && ` ${flat(s.text)} `.includes(` ${name} `)) matches.push({ url: s.url, title: s.title, how: "name" })
    if (!ownSite(s.url) && !cited.has(hostOf(s.url))) cited.set(hostOf(s.url), { host: hostOf(s.url), title: s.title.slice(0, 160), url: s.url })
  }
  return { ...base, present: matches.length > 0, matches: matches.slice(0, 5), cited: [...cited.values()].slice(0, 10), sources: sources.length }
}

export function geoSummary(f: GeoFinding): string {
  const asked = `« ${f.questions[0]} »${f.questions.length > 1 ? ` et ${f.questions.length - 1} autre${f.questions.length > 2 ? "s" : ""} question${f.questions.length > 2 ? "s" : ""}` : ""}`
  return f.present
    ? `Citée parmi les ${f.sources} sources que Perplexity donne pour ${asked}.`
    : `Absente des ${f.sources} sources que Perplexity donne pour ${asked}${f.cited.length ? ` ; y figurent notamment ${f.cited.slice(0, 3).map((x) => x.host).join(", ")}` : ""}.`
}

export async function runGeo(ctx: RunContext, opts: { signal: AbortSignal }, deps: ResearchDeps = {}): Promise<GeoFinding> {
  const now = deps.now?.() ?? new Date()
  const lead = await prisma.lead.findFirst({
    where: { id: ctx.leadId ?? "", workspaceId: ctx.workspaceId },
    select: { company: { select: { id: true, name: true, domain: true, city: true, sector: true, data: true, legalState: true, legalStateAt: true, legalOverrideAt: true } } },
  })
  const c = lead?.company
  if (!c) throw new LeadError("not_found", "Fiche ou entreprise introuvable.", 404)
  if (legallyBlocked(c)) throw new LeadError("conflict", "Entreprise en procédure collective ou fermée : pas de sonde.", 409)
  const trade = tradeOf(c.sector)
  if (!trade || !c.city) throw new LeadError("invalid", "La sonde GEO a besoin du métier et de la ville de l'entreprise.", 400)
  if ((await remainingMicros(ctx.id)) < GEO_CAP_MICROS) throw new LeadError("budget_exceeded", "Le plafond de l'exécution ne suffit pas pour une sonde GEO.", 429, { scope: "run" })

  const questions = geoQuestions(trade, c.city)
  const search = deps.search ?? gatewaySearcher(deps)
  const found = await search(ctx, { tool: "perplexity_search", make: () => perplexityFr(10), query: questions, name: "sonde-geo" }, opts.signal)
  const finding: GeoFinding = { ...geoFinding(found.sources, c, { checkedAt: now.toISOString(), trade, city: c.city, questions }), ...(found.error && !found.sources.length ? { error: found.error } : {}) }
  const data = { ...((c.data && typeof c.data === "object" && !Array.isArray(c.data) ? c.data : {}) as Record<string, unknown>), geo: finding }
  await prisma.company.update({ where: { id: c.id }, data: { geoCheckedAt: now, data: data as unknown as Prisma.InputJsonValue } })
  // A probe that read nothing proves nothing: no signal.
  if (!finding.present && finding.sources > 0) {
    await prisma.companySignal.createMany({
      data: {
        workspaceId: ctx.workspaceId,
        companyId: c.id,
        kind: "GEO_ABSENT",
        occurredAt: now,
        summary: geoSummary(finding).slice(0, 500),
        details: { questions, cited: finding.cited.map((x) => x.host), sources: finding.sources } as Prisma.InputJsonValue,
        source: GEO_SOURCE,
        sourceUrl: finding.cited[0]?.url ?? null,
        externalKey: `geo:${now.toISOString().slice(0, 7)}`,
        expiresAt: new Date(now.getTime() + RECENT_DAYS * 86_400_000),
      },
      skipDuplicates: true,
    })
  }
  await recordStep(ctx, { type: "TOOL", name: "constat-geo", input: { questions }, output: { present: finding.present, sources: finding.sources, matches: finding.matches.map((m) => m.how), cited: finding.cited.map((x) => x.host) } })
  return finding
}
