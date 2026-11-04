import type { ContactRole, Prisma } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { normalizeName } from "@/lib/crm/normalize"
import { UNTRUSTED_RULE } from "@/lib/ai/untrusted"
import { exaPeople, exaSocials, flat, quotes, type WebSource } from "@/lib/ai/search"
import { generateForRun } from "@/features/ai/calls"
import { recordStep, remainingMicros, type RunContext } from "@/features/ai/runs"
import { identityOf } from "@/features/enrichment/identity"
import { networkOf } from "@/features/prospect-audit/html"
import { legallyBlocked } from "@/features/signals/kinds"
import { gatewaySearcher, numbered, type ResearchDeps, type WebSearcher } from "./search"

/**
 * Decision makers and social profiles (E30 lot 2, D45, D48). For a fiche, Exa looks for the officers the registry lists
 * and, in a company of ten people or more, its marketing, communication or sales lead; then for the company's own
 * accounts on Instagram, Facebook, LinkedIn and TikTok. A fast model compares each result with the company and copies
 * the words that tie them; the code keeps a result only when those words are really in it.
 *
 * People are proposed on the fiche until someone confirms them (features/research/service.ts); the company's accounts
 * go into data.socials with their provenance. Of a profile, only its address, the name and the title are kept, and
 * never an email (D48). A company that objected to commercial use of its registry data is searched for its accounts
 * only.
 */
export const PEOPLE_REFRESH_DAYS = 30
/** Fiches of one run: a campaign's search is split into runs of ten, each with its own cap. */
export const PEOPLE_BATCH = 10
/** What one fiche may cost: three Exa searches, four short calls of the fast model, with room to spare (≈ 0,03 €). */
export const PEOPLE_FICHE_CAP_MICROS = 40_000
export const PROBABLE_AT = 0.8
export const CHECK_AT = 0.5

/** INSEE bands of ten people or more: their marketing, communication or sales lead is searched for too (D45). */
const TEN_OR_MORE = new Set(["11", "12", "21", "22", "31", "32", "41", "42", "51", "52", "53"])
const LEAD_TITLE = /market|communic|commercial|vente|sales|business|developpement|digital|growth|brand|marque|acquisition/
export const WANTED_NETWORKS = ["instagram", "facebook", "linkedin", "tiktok"] as const
export type WantedNetwork = (typeof WANTED_NETWORKS)[number]

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)

export interface PeopleTarget {
  role: Extract<ContactRole, "EXECUTIVE" | "DECISION_MAKER">
  /** The officer's name; null for the marketing or sales lead, whose name is not known. */
  name: string | null
  title: string | null
  query: string
}

interface CompanyFacts {
  name: string
  city: string | null
  headcountBand: string | null
  data: unknown
  contacts: { name: string | null; linkedinUrl: string | null }[]
}

/** Who to look for: the officers not yet tied to a profile (two at most), and the marketing or sales lead of a PME. */
export function peopleTargets(c: CompanyFacts): PeopleTarget[] {
  const identity = identityOf(c.data)
  if (identity?.opposition) return []
  const where = c.city ? ` ${c.city}` : ""
  const linked = new Set(c.contacts.filter((k) => k.linkedinUrl).map((k) => normalizeName(k.name)))
  const targets: PeopleTarget[] = (identity?.officers ?? [])
    .filter((o) => !linked.has(normalizeName(o.name)))
    .slice(0, 2)
    .map((o) => ({ role: "EXECUTIVE", name: o.name, title: o.role, query: `${o.name} ${o.role ?? "dirigeant"} ${c.name}${where}` }))
  if (c.headcountBand && TEN_OR_MORE.has(c.headcountBand)) targets.push({ role: "DECISION_MAKER", name: null, title: null, query: `Responsable marketing, communication ou commercial chez ${c.name}${where}` })
  return targets
}

/** The four networks the company has no account for yet. */
export function missingNetworks(data: unknown): WantedNetwork[] {
  const socials = isObj(data) && isObj(data.socials) ? Object.values(data.socials) : []
  const have = new Set(socials.map((u) => (typeof u === "string" ? networkOf(u) : null)))
  return WANTED_NETWORKS.filter((n) => !have.has(n))
}

/** A person's public profile, linkedin.com/in/<handle>, written one way whatever the country's sub-domain. */
export function personProfile(url: string): string | null {
  if (networkOf(url) !== "linkedin") return null
  const m = new URL(url).pathname.match(/^\/in\/([^/?#]+)\/?$/)
  return m ? `https://www.linkedin.com/in/${m[1]}` : null
}

const NOT_ACCOUNTS: Record<WantedNetwork, Set<string>> = {
  instagram: new Set(["p", "reel", "reels", "explore", "stories", "tv", "accounts", "about", "legal"]),
  facebook: new Set(["groups", "events", "watch", "photo", "photos", "photo.php", "story.php", "hashtag", "marketplace", "sharer", "share", "login", "help", "people", "public", "search"]),
  linkedin: new Set(),
  tiktok: new Set(),
}

/** A company's own account on one of the four networks: not a post, a group, a hashtag or a person. */
export function companyProfile(url: string): { network: WantedNetwork; url: string } | null {
  const network = networkOf(url) as WantedNetwork | null
  if (!network || !(WANTED_NETWORKS as readonly string[]).includes(network)) return null
  const u = new URL(url)
  const parts = u.pathname.split("/").filter(Boolean)
  const first = parts[0]?.toLowerCase() ?? ""
  if (!first || NOT_ACCOUNTS[network].has(first)) return null
  if (network === "linkedin") return first === "company" && parts[1] && parts.length <= 3 ? { network, url: `https://www.linkedin.com/company/${parts[1]}` } : null
  if (network === "tiktok") return first.startsWith("@") && parts.length === 1 ? { network, url: `https://www.tiktok.com/${parts[0]}` } : null
  if (network === "facebook" && first === "profile.php") {
    const id = u.searchParams.get("id")
    return id && /^\d+$/.test(id) ? { network, url: `https://www.facebook.com/profile.php?id=${id}` } : null
  }
  return parts.length === 1 ? { network, url: `https://www.${network}.com/${parts[0]}` } : null
}

export const judgeSchema = z.object({
  people: z
    .array(
      z.object({
        result: z.number().int().describe("Numéro du résultat de personne (pour R2, donne 2)"),
        target: z.number().int().describe("Numéro de la personne recherchée (pour P1, donne 1)"),
        name: z.string().describe("Le nom de la personne, tel que le résultat l'écrit"),
        title: z.string().nullable().describe("Son poste, tel que le résultat l'écrit, ou null"),
        match: z.enum(["yes", "unsure", "no"]).describe("yes : c'est bien la personne recherchée, dans cette entreprise ; unsure : un homonyme est possible ; no : une autre personne ou une autre entreprise"),
        confidence: z.number().describe("Ta confiance, de 0 à 1"),
        evidence: z.string().describe("Les mots du résultat qui relient la personne à l'entreprise (son nom, sa ville, son poste), copiés exactement"),
      })
    )
    .describe("Un avis par résultat de personne"),
  accounts: z
    .array(
      z.object({
        result: z.number().int().describe("Numéro du compte (pour S3, donne 3)"),
        match: z.enum(["yes", "unsure", "no"]).describe("yes : le compte de cette entreprise ; unsure : peut-être ; no : un autre compte, un homonyme, une page de fan"),
        confidence: z.number().describe("Ta confiance, de 0 à 1"),
        evidence: z.string().describe("Les mots du résultat qui montrent que c'est le compte de l'entreprise, copiés exactement"),
      })
    )
    .describe("Un avis par compte de réseau social"),
})
export type Judgment = z.infer<typeof judgeSchema>

export const JUDGE_SYSTEM = `Tu vérifies des résultats de recherche pour un CRM de prospection B2B. Pour chaque profil de personne, dis s'il s'agit de la personne recherchée dans cette entreprise ; pour chaque compte de réseau social, dis s'il s'agit du compte officiel de l'entreprise.
- Une personne n'est la bonne que si le résultat cite l'entreprise (ou son activité dans la même ville) ; un nom seul ne suffit pas : homonyme possible, réponds « unsure ».
- La preuve est copiée mot pour mot du résultat. Sans preuve, la confiance est basse.
- N'invente ni nom, ni poste, ni lien.
${UNTRUSTED_RULE}`

export function judgePrompt(c: { name: string; city: string | null; postalCode: string | null; domain: string | null; sector: string | null }, targets: readonly PeopleTarget[], people: readonly WebSource[], accounts: readonly WebSource[]): string {
  const company = [c.name, c.city && `à ${c.city}${c.postalCode ? ` (${c.postalCode})` : ""}`, c.sector && `activité : ${c.sector}`, c.domain && `site : ${c.domain}`].filter(Boolean).join(", ")
  const wanted = targets.map((t, i) => `P${i + 1}. ${t.name ? `${t.name}${t.title ? `, ${t.title}` : ""} (dirigeant listé par le registre)` : "le ou la responsable marketing, communication ou commercial"}`).join("\n")
  return [
    `Entreprise : ${company}.`,
    targets.length ? `Personnes recherchées :\n${wanted}` : null,
    people.length ? `Profils de personnes trouvés :\n${numbered("R", people)}` : null,
    accounts.length ? `Comptes de réseaux sociaux trouvés :\n${numbered("S", accounts, 600)}` : null,
  ]
    .filter(Boolean)
    .join("\n\n")
}

export interface KeptPerson {
  role: PeopleTarget["role"]
  name: string
  title: string | null
  url: string
  confidence: number
  evidence: string
  status: "PROBABLE" | "TO_CHECK"
}
export interface KeptAccount {
  network: WantedNetwork
  url: string
  confidence: number
  evidence: string
}

const words = (text: string) => flat(text).split(" ").filter((w) => w.length > 1)
/** A whole word of a flattened text: « roche » is not in « rocher ». */
const hasWord = (text: string, word: string) => ` ${text} `.includes(` ${word} `)
/** The company's name without its legal form, as words: « Plomberie Martin SARL » → plomberie, martin. */
const companyWords = (name: string) => words(normalizeName(name)).filter((w) => w.length > 2)

/**
 * What the code keeps of the model's judgment: a known result of the right kind, words really copied from it, the
 * officer's surname or the company's name in it, and a confidence over the threshold. The best profile per person.
 */
export function keepJudgment(j: Judgment, c: { name: string }, targets: readonly PeopleTarget[], people: readonly WebSource[], accounts: readonly WebSource[], wanted: readonly WantedNetwork[]): { people: KeptPerson[]; accounts: KeptAccount[] } {
  const kept = new Map<string, KeptPerson>()
  const firm = companyWords(c.name)
  for (const p of j.people) {
    const source = people[p.result - 1]
    const target = targets[p.target - 1]
    const url = source && personProfile(source.url)
    if (!source || !target || !url || p.match === "no" || !quotes(source, p.evidence)) continue
    const text = flat(source.text)
    const confidence = Math.min(Math.max(p.confidence, 0), 1)
    // An officer: their surname is in the result. The marketing or sales lead: a title of that kind, and the company's name.
    const surname = target.name ? words(target.name).at(-1) : null
    const fits = target.name ? !!surname && hasWord(text, surname) : LEAD_TITLE.test(flat(`${p.title ?? ""} ${p.evidence}`))
    const namesFirm = firm.length > 0 && firm.every((w) => hasWord(text, w))
    if (!fits || confidence < CHECK_AT) continue
    const status = p.match === "yes" && confidence >= PROBABLE_AT && (target.name ? true : namesFirm) ? "PROBABLE" : "TO_CHECK"
    const person: KeptPerson = { role: target.role, name: p.name.trim().slice(0, 120) || target.name || "Inconnu", title: p.title?.trim().slice(0, 160) || null, url, confidence, evidence: p.evidence.trim().slice(0, 400), status }
    const before = kept.get(url)
    if (!before || before.confidence < confidence) kept.set(url, person)
  }
  const best = new Map<WantedNetwork, KeptAccount>()
  for (const a of j.accounts) {
    const source = accounts[a.result - 1]
    const profile = source && companyProfile(source.url)
    const confidence = Math.min(Math.max(a.confidence, 0), 1)
    if (!source || !profile || !wanted.includes(profile.network) || a.match !== "yes" || confidence < PROBABLE_AT || !quotes(source, a.evidence)) continue
    const before = best.get(profile.network)
    if (!before || before.confidence < confidence) best.set(profile.network, { network: profile.network, url: profile.url, confidence, evidence: a.evidence.trim().slice(0, 300) })
  }
  return { people: [...kept.values()], accounts: [...best.values()] }
}

export interface PeopleReport {
  fiches: number
  searched: number
  people: number
  probable: number
  accounts: number
  skipped: { leadId: string; why: string }[]
}

async function loadFiche(ctx: RunContext, leadId: string) {
  return prisma.lead.findFirst({
    where: { id: leadId, workspaceId: ctx.workspaceId },
    select: {
      id: true,
      company: {
        select: {
          id: true,
          name: true,
          city: true,
          postalCode: true,
          domain: true,
          sector: true,
          headcountBand: true,
          legalState: true,
          legalStateAt: true,
          legalOverrideAt: true,
          peopleCheckedAt: true,
          data: true,
          contacts: { select: { name: true, linkedinUrl: true } },
          candidates: { select: { url: true, status: true } },
        },
      },
    },
  })
}

/** Files what was kept: people as proposals (decided ones are left alone), accounts into data.socials. */
async function save(ctx: RunContext, company: NonNullable<NonNullable<Awaited<ReturnType<typeof loadFiche>>>["company"]>, kept: ReturnType<typeof keepJudgment>, now: Date) {
  const decided = new Set(company.candidates.filter((k) => k.status === "CONFIRMED" || k.status === "DISMISSED").map((k) => k.url))
  const contacts = new Set(company.contacts.map((k) => k.linkedinUrl).filter(Boolean))
  const fresh = kept.people.filter((p) => !decided.has(p.url) && !contacts.has(p.url))
  for (const p of fresh) {
    const row = { role: p.role, name: p.name, title: p.title, confidence: p.confidence, evidence: p.evidence, status: p.status, runId: ctx.id }
    await prisma.contactCandidate.upsert({ where: { companyId_url: { companyId: company.id, url: p.url } }, create: { workspaceId: ctx.workspaceId, companyId: company.id, url: p.url, ...row }, update: row })
  }
  const data = isObj(company.data) ? { ...company.data } : {}
  if (kept.accounts.length) {
    const socials = isObj(data.socials) ? { ...data.socials } : {}
    const found = isObj(data.socialsFound) ? { ...data.socialsFound } : {}
    for (const a of kept.accounts) {
      socials[a.network] = a.url
      found[a.network] = { url: a.url, source: "Exa", foundAt: now.toISOString(), confidence: a.confidence, evidence: a.evidence, runId: ctx.id }
    }
    data.socials = socials
    data.socialsFound = found
  }
  await prisma.company.update({ where: { id: company.id }, data: { peopleCheckedAt: now, ...(kept.accounts.length ? { data: data as Prisma.InputJsonValue } : {}) } })
  return fresh
}

/**
 * Searches the fiches one after the other, within the run's cap: a fiche starts only when the run can still pay for
 * its worst case. A fiche searched less than 30 days ago is skipped, unless a person asked for it on the fiche itself.
 */
export async function runPeople(ctx: RunContext, leadIds: readonly string[], opts: { force?: boolean; signal: AbortSignal }, deps: ResearchDeps = {}): Promise<PeopleReport> {
  const search: WebSearcher = deps.search ?? gatewaySearcher(deps)
  const report: PeopleReport = { fiches: leadIds.length, searched: 0, people: 0, probable: 0, accounts: 0, skipped: [] }
  for (const [i, leadId] of leadIds.entries()) {
    if (opts.signal.aborted) break
    const now = deps.now?.() ?? new Date()
    const lead = await loadFiche(ctx, leadId)
    const c = lead?.company
    if (!c) {
      report.skipped.push({ leadId, why: "fiche ou entreprise introuvable" })
      continue
    }
    if (legallyBlocked(c)) {
      report.skipped.push({ leadId, why: "entreprise en procédure collective ou fermée" })
      continue
    }
    if (!opts.force && c.peopleCheckedAt && now.getTime() - c.peopleCheckedAt.getTime() < PEOPLE_REFRESH_DAYS * 86_400_000) {
      report.skipped.push({ leadId, why: "déjà cherchée ce mois-ci" })
      continue
    }
    if ((await remainingMicros(ctx.id)) < PEOPLE_FICHE_CAP_MICROS) {
      report.skipped.push(...leadIds.slice(i).map((id) => ({ leadId: id, why: "plafond de l'exécution atteint" })))
      break
    }
    const targets = peopleTargets(c)
    const wanted = missingNetworks(c.data)
    const people: WebSource[] = []
    for (const t of targets) {
      const found = await search(ctx, { tool: "exa_search", make: exaPeople, query: t.query, name: "recherche-personne", private: t.role === "EXECUTIVE" ? "Recherche du profil d'un dirigeant" : "Recherche du responsable marketing ou commercial" }, opts.signal)
      for (const s of found.sources) if (personProfile(s.url) && !people.some((p) => personProfile(p.url) === personProfile(s.url))) people.push(s)
    }
    let accounts: WebSource[] = []
    if (wanted.length) {
      const found = await search(ctx, { tool: "exa_search", make: exaSocials, query: [c.name, c.city].filter(Boolean).join(" "), name: "recherche-reseaux" }, opts.signal)
      accounts = found.sources.filter((s) => {
        const p = companyProfile(s.url)
        return p && wanted.includes(p.network)
      })
    }
    report.searched++
    let kept: ReturnType<typeof keepJudgment> = { people: [], accounts: [] }
    if (people.length || accounts.length) {
      const judged = await generateForRun(
        ctx,
        { role: "fast", name: "concordance", system: JUDGE_SYSTEM, prompt: judgePrompt(c, targets, people.slice(0, 12), accounts.slice(0, 10)), schema: judgeSchema, maxOutputTokens: 2_000, abortSignal: opts.signal, private: "Comparaison des profils trouvés avec l'entreprise" },
        deps
      )
      kept = keepJudgment(judged.output ?? { people: [], accounts: [] }, c, targets, people.slice(0, 12), accounts.slice(0, 10), wanted)
    }
    const fresh = await save(ctx, c, kept, now)
    report.people += fresh.length
    report.probable += fresh.filter((p) => p.status === "PROBABLE").length
    report.accounts += kept.accounts.length
    await recordStep(ctx, {
      type: "TOOL",
      name: "decideurs-reseaux",
      input: { leadId, targets: targets.map((t) => t.role), networks: wanted },
      // Counts only: the names stay on the fiche, with their source.
      output: { profiles: people.length, accounts: accounts.length, kept: fresh.length, probable: fresh.filter((p) => p.status === "PROBABLE").length, networks: kept.accounts.map((a) => a.network) },
    })
  }
  return report
}
