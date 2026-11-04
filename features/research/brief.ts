import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { UNTRUSTED_RULE, untrusted } from "@/lib/ai/untrusted"
import { exaNews, perplexityFr, urlKey, type WebSource } from "@/lib/ai/search"
import { generateForRun } from "@/features/ai/calls"
import { RetryableError } from "@/features/ai/handlers"
import { recordStep, type RunContext } from "@/features/ai/runs"
import { workflowInstructions } from "@/features/ai/runtime"
import { LeadError } from "@/features/leads/errors"
import { MEETING_TYPE_LABELS } from "@/features/meetings/rules"
import { activeOffers } from "@/features/offers/service"
import type { SkillOffer } from "@/features/offers/skill"
import { latestFor } from "@/features/prospect-audit/latest"
import { playbookFor } from "@/features/prospect-audit/sectors"
import { identityOf } from "@/features/enrichment/identity"
import { LEGAL_STATE_LABELS, SIGNAL_LABELS, headcountLabel } from "@/features/signals/kinds"
import { notify } from "@/features/signals/store"
import { BRIEF_LIMITS, briefOutputSchema, type BriefClaim, type BriefContent, type BriefOutput, type BriefSource } from "./brief-schemas"
import { geoOf, geoSummary, tradeOf } from "./geo"
import { gatewaySearcher, numbered, type ResearchDeps } from "./search"

/**
 * The meeting brief (E30 lot 2, D51): what a closer should know before meeting a prospect. A coded workflow, like the
 * audit: the code writes four searches (who they are, what clients say, their market, their news of the year), the
 * Enquêteur then writes the brief once from the fiche and the pages found, citing each fact by its page; the code keeps
 * only the facts that cite a page it read or the fiche itself. Prepared the day before each meeting, and on demand.
 */
export const BRIEF_CAP_MICROS = 300_000
/** Sonnet reasoned about 1 000 tokens, then wrote about 1 800 (real dry run of 2026-11-04): room for both, and more. */
export const BRIEF_OUTPUT_TOKENS = 6_000
/** Pages the brief is written from, at most: the four searches give about twenty, the best ranked first. */
const MAX_SOURCES = 16

const DATE = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
const DAY = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric" })
const clip = (text: string, max: number) => text.replace(/\s+/g, " ").trim().slice(0, max)

export const BRIEF_RULES = `## Comment tu travailles ici
- Tu écris un brief pour un commercial qui rencontre ce prospect : des faits courts, utiles pour l'échange.
- Chaque fait cite ce qui le prouve : « W3 » pour la page W3 trouvée par les recherches, « CRM » pour un fait donné par la fiche. Un fait sans référence existante sera retiré. N'écris jamais de lien toi-même.
- Une page peut parler d'un homonyme : ne retiens que ce qui concerne bien cette entreprise (même nom et même ville, ou même site).
- L'actualité est datée et récente ; ce que tu ne trouves pas, tu ne l'inventes pas : une rubrique peut rester vide.
- Pas de vie privée : seulement l'entreprise et le rôle professionnel des personnes.
${UNTRUSTED_RULE}`

export interface BriefFacts {
  company: { name: string; city: string | null; sector: string | null; website: string | null; siren: string | null; nafCode: string | null; foundedOn: Date | null; headcountBand: string | null; legalState: keyof typeof LEGAL_STATE_LABELS; data: unknown }
  meeting: { startsAt: Date; type: keyof typeof MEETING_TYPE_LABELS; contact: string | null } | null
  signals: { kind: keyof typeof SIGNAL_LABELS; summary: string; occurredAt: Date; sourceUrl: string | null }[]
  audit: { score: number | null; summary: string[]; createdAt: Date } | null
  offers: readonly SkillOffer[]
}

/** The searches of a brief: who they are, what clients say, their market (Perplexity), their news of the year (Exa). */
export function briefQueries(c: { name: string; city: string | null; sector: string | null }): { perplexity: string[]; news: string } {
  const where = c.city ? ` ${c.city}` : ""
  const trade = tradeOf(c.sector)
  return { perplexity: [`${c.name}${where}`, `${c.name}${where} avis clients`, ...(trade && c.city ? [`${trade} ${c.city}`] : [])], news: `${c.name}${where}` }
}

export function briefPrompt(f: BriefFacts, sources: readonly WebSource[]): string {
  const c = f.company
  const identity = identityOf(c.data)
  const geo = geoOf(c.data)
  const fiche = [
    `Entreprise : ${[c.name, c.city, c.sector].filter(Boolean).join(" — ")}${c.website ? ` (site ${c.website})` : ""}`,
    [c.siren && `SIREN ${c.siren}`, c.nafCode && `NAF ${c.nafCode}`, c.foundedOn && `créée le ${DAY.format(c.foundedOn)}`, headcountLabel(c.headcountBand), identity?.category, c.legalState !== "ACTIVE" && LEGAL_STATE_LABELS[c.legalState]].filter(Boolean).join(" · ") || null,
    identity?.officers.length ? `Dirigeants listés par le registre : ${identity.officers.map((o) => `${o.name}${o.role ? ` (${o.role})` : ""}`).join(", ")}` : null,
    f.signals.length ? `Signaux du registre et des sondes :\n${f.signals.map((s) => `- ${DAY.format(s.occurredAt)} · ${SIGNAL_LABELS[s.kind]} : ${s.summary}`).join("\n")}` : null,
    geo ? `Sonde GEO du ${DAY.format(new Date(geo.checkedAt))} : ${geoSummary(geo)}` : null,
    f.audit ? `Audit du site (${DAY.format(f.audit.createdAt)}${f.audit.score != null ? `, score ${f.audit.score}/100` : ""}) :\n${f.audit.summary.map((s) => `- ${s}`).join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n")
  const meeting = f.meeting ? `Rendez-vous : ${MEETING_TYPE_LABELS[f.meeting.type].toLowerCase()}, ${DATE.format(f.meeting.startsAt)}${f.meeting.contact ? `, avec ${f.meeting.contact}` : ""}.` : "Pas de rendez-vous fixé : le brief prépare un premier échange."
  const offers = f.offers.length ? f.offers.map((o) => `- ${o.slug} : ${o.name} — ${o.summary}`).join("\n") : "- aucune offre active : les angles ne nomment pas d'offre (null)"
  return [
    meeting,
    `La fiche (CRM) :\n${untrusted(fiche, { source: `fiche de ${c.name}`, maxChars: 6_000 })}`,
    `Offres actives de l'agence :\n${offers}`,
    sources.length ? `Pages trouvées par les recherches :\n${numbered("W", sources, 1_200)}` : "Les recherches n'ont rien trouvé : écris le brief à partir de la fiche seule, et dis-le.",
    `Rédige le brief : qui ils sont, leur actualité, leur marché local, trois angles d'approche reliés aux offres actives et cinq questions à poser. ${BRIEF_LIMITS.who} faits au plus par rubrique.`,
  ].join("\n\n")
}

/**
 * What the code keeps: each claim with the pages it cites that exist (or the fiche); news and market need a page.
 * Angles keep the active offer they serve, questions are trimmed. The pages cited are listed with their title and date.
 */
export function settleBrief(out: BriefOutput, sources: readonly WebSource[], offers: readonly SkillOffer[]): { content: Omit<BriefContent, "signals" | "meeting">; cited: BriefSource[]; dropped: number } {
  const used = new Map<string, BriefSource>()
  let dropped = 0
  const resolve = (refs: readonly string[]) => {
    const urls: string[] = []
    let crm = false
    for (const r of refs) {
      const ref = r.trim().toUpperCase()
      if (ref === "CRM") crm = true
      const m = ref.match(/^W(\d{1,3})$/)
      const s = m ? sources[Number(m[1]) - 1] : undefined
      if (!s || urls.includes(s.url)) continue
      urls.push(s.url)
      used.set(urlKey(s.url), { url: s.url, title: clip(s.title || s.url, 200), date: s.date })
    }
    return { urls, crm }
  }
  const claims = (list: BriefOutput["who"], max: number, needsPage: boolean): BriefClaim[] => {
    const kept: BriefClaim[] = []
    for (const c of list) {
      const text = clip(c.text, BRIEF_LIMITS.claim)
      const { urls, crm } = resolve(c.sources)
      if (!text || (!urls.length && (needsPage || !crm))) {
        dropped++
        continue
      }
      if (kept.length < max) kept.push({ text, sources: urls.slice(0, 3), crm: crm && !urls.length, date: c.date ? clip(c.date, 40) : null })
    }
    return kept
  }
  const names = new Map(offers.map((o) => [o.slug, o.name]))
  const content = {
    who: claims(out.who, BRIEF_LIMITS.who, false),
    news: claims(out.news, BRIEF_LIMITS.news, true),
    market: claims(out.market, BRIEF_LIMITS.market, true),
    angles: out.angles
      .map((a) => ({ title: clip(a.title, BRIEF_LIMITS.title), offer: a.offer && names.has(a.offer) ? a.offer : null, offerName: (a.offer && names.get(a.offer)) ?? null, why: clip(a.why, BRIEF_LIMITS.why), sources: resolve(a.sources).urls.slice(0, 3) }))
      .filter((a) => a.title && a.why)
      .slice(0, BRIEF_LIMITS.angles),
    questions: out.questions.map((q) => clip(q, BRIEF_LIMITS.question)).filter(Boolean).slice(0, BRIEF_LIMITS.questions),
  }
  return { content, cited: [...used.values()], dropped }
}

const meetingIdOf = (input: unknown) => {
  const id = input && typeof input === "object" ? (input as Record<string, unknown>).meetingId : null
  return typeof id === "string" && id.length <= 40 ? id : null
}

export async function runBrief(ctx: RunContext, input: unknown, opts: { signal: AbortSignal }, deps: ResearchDeps = {}): Promise<{ briefId: string; claims: number; dropped: number }> {
  const saved = await prisma.leadBrief.findUnique({ where: { runId: ctx.id }, select: { id: true, dropped: true, content: true } })
  if (saved) return { briefId: saved.id, claims: 0, dropped: saved.dropped }
  const now = deps.now?.() ?? new Date()
  const lead = await prisma.lead.findFirst({
    where: { id: ctx.leadId ?? "", workspaceId: ctx.workspaceId },
    select: {
      id: true,
      ownerId: true,
      company: { select: { id: true, name: true, city: true, sector: true, website: true, domain: true, siren: true, nafCode: true, foundedOn: true, headcountBand: true, legalState: true, data: true } },
    },
  })
  if (!lead?.company) throw new LeadError("not_found", "Fiche ou entreprise introuvable.", 404)
  const c = lead.company
  const meetingId = meetingIdOf(input)
  const meeting = meetingId
    ? await prisma.meeting.findFirst({ where: { id: meetingId, leadId: lead.id, workspaceId: ctx.workspaceId }, select: { id: true, startsAt: true, type: true, hostId: true, contact: { select: { name: true, jobTitle: true } } } })
    : null
  const [signals, audit, offers] = await Promise.all([
    prisma.companySignal.findMany({ where: { companyId: c.id, dismissedAt: null, expiresAt: { gt: now } }, orderBy: { occurredAt: "desc" }, take: 8, select: { kind: true, summary: true, occurredAt: true, sourceUrl: true } }),
    latestFor(ctx.workspaceId, { id: lead.id, company: { domain: c.domain, website: c.website } }),
    activeOffers(ctx.workspaceId),
  ])

  const queries = briefQueries(c)
  const search = deps.search ?? gatewaySearcher(deps)
  const [web, news] = [
    await search(ctx, { tool: "perplexity_search", make: () => perplexityFr(8), query: queries.perplexity, name: "recherche-entreprise" }, opts.signal),
    await search(ctx, { tool: "exa_search", make: () => exaNews(now), query: queries.news, name: "recherche-actualite" }, opts.signal),
  ]
  const seen = new Set<string>()
  const sources = [...web.sources, ...news.sources].filter((s) => !seen.has(urlKey(s.url)) && seen.add(urlKey(s.url))).slice(0, MAX_SOURCES)

  const facts: BriefFacts = {
    company: c,
    meeting: meeting ? { startsAt: meeting.startsAt, type: meeting.type, contact: meeting.contact?.name ? `${meeting.contact.name}${meeting.contact.jobTitle ? `, ${meeting.contact.jobTitle}` : ""}` : null } : null,
    signals,
    audit: audit ? { score: audit.score, summary: audit.summary, createdAt: audit.createdAt } : null,
    offers,
  }
  const runtime = await workflowInstructions(ctx, [playbookFor(c.sector)].filter((s): s is string => !!s))
  const role = runtime.agent.modelRole === "decision" ? "writer" : runtime.agent.modelRole
  const { output, model } = await generateForRun(
    ctx,
    { role, name: "brief", system: `${runtime.system}\n\n${BRIEF_RULES}`, prompt: briefPrompt(facts, sources), schema: briefOutputSchema(offers.map((o) => o.slug)), maxOutputTokens: BRIEF_OUTPUT_TOKENS, abortSignal: opts.signal },
    deps
  )
  if (!output) throw new RetryableError("L'Enquêteur n'a pas rendu de brief lisible.")
  const settled = settleBrief(output, sources, offers)
  const kept = settled.content.who.length + settled.content.news.length + settled.content.market.length
  if (!kept && !settled.content.angles.length) throw new RetryableError("Aucun fait du brief ne cite une source lue : il sera refait.")

  const content: BriefContent = {
    ...settled.content,
    signals: signals.map((s) => ({ label: SIGNAL_LABELS[s.kind], summary: s.summary, occurredAt: s.occurredAt.toISOString().slice(0, 10), sourceUrl: s.sourceUrl })),
    meeting: meeting ? { startsAt: meeting.startsAt.toISOString(), type: meeting.type } : null,
  }
  const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: ctx.id }, select: { costMicros: true } })
  const brief = await prisma.leadBrief.create({
    data: {
      workspaceId: ctx.workspaceId,
      leadId: lead.id,
      meetingId: meeting?.id ?? null,
      runId: ctx.id,
      content: content as unknown as Prisma.InputJsonValue,
      sources: settled.cited as unknown as Prisma.InputJsonValue,
      dropped: settled.dropped,
      model,
      costMicros: run.costMicros,
      createdById: ctx.requester?.id ?? null,
    },
    select: { id: true },
  })
  await recordStep(ctx, { type: "TOOL", name: "save_brief", input: { meetingId: meeting?.id ?? null, sources: sources.length }, output: { briefId: brief.id, claims: kept, angles: content.angles.length, dropped: settled.dropped, cited: settled.cited.length } })
  const when = meeting ? `Rendez-vous ${DATE.format(meeting.startsAt)} : ` : ""
  await notify([meeting?.hostId ?? lead.ownerId, ctx.requester?.id], { title: `Brief prêt : ${c.name}`, message: `${when}le brief de l'Enquêteur est sur la fiche (${kept} faits sourcés, ${content.angles.length} angles).` })
  return { briefId: brief.id, claims: kept, dropped: settled.dropped }
}
