import { prisma } from "@/lib/prisma"
import type { AuditReport, Evidence, SignalHit } from "@/features/prospect-audit/schemas"
import { briefContentSchema } from "./brief-schemas"

/**
 * What the registry and the Enquêteur add to an audit's evidence (E30 lot 2), for the offers (E21) and the writer
 * (E22): a recent creation or takeover, an absence from the answer engines, and the dated news of the latest brief.
 * Each is a source with its link and date, under ids of its own (R1, R2…) that never meet the audit's (P, M, C, S).
 * The three first raise the offer signals new_business, takeover and geo_absent.
 */
export const NEW_BUSINESS_DAYS = 183
const BRIEF_NEWS_DAYS = 30
const DAY = 86_400_000
const DATE = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric" })

export async function researchEvidence(companyId: string | null, now = new Date()): Promise<{ evidence: Evidence[]; signals: SignalHit[] }> {
  if (!companyId) return { evidence: [], signals: [] }
  const [signals, brief] = await Promise.all([
    prisma.companySignal.findMany({
      where: { companyId, dismissedAt: null, expiresAt: { gt: now }, kind: { in: ["CREATED", "TAKEOVER", "GEO_ABSENT"] } },
      orderBy: { occurredAt: "desc" },
      select: { kind: true, summary: true, occurredAt: true, source: true, sourceUrl: true },
    }),
    prisma.leadBrief.findFirst({ where: { lead: { companyId }, createdAt: { gt: new Date(now.getTime() - BRIEF_NEWS_DAYS * DAY) } }, orderBy: { createdAt: "desc" }, select: { content: true, createdAt: true } }),
  ])
  const evidence: Evidence[] = []
  const hits: SignalHit[] = []
  const add = (label: string, value: string, url: string | null) => {
    const id = `R${evidence.length + 1}`
    evidence.push({ id, kind: "source", label: label.slice(0, 200), value: value.slice(0, 300), url: url?.slice(0, 2_000) ?? null })
    return id
  }
  const created = signals.find((s) => s.kind === "CREATED" && now.getTime() - s.occurredAt.getTime() < NEW_BUSINESS_DAYS * DAY)
  if (created) hits.push({ key: "new_business", evidence: [add(`${created.source} : création, le ${DATE.format(created.occurredAt)}`, created.summary, created.sourceUrl)] })
  const takeover = signals.find((s) => s.kind === "TAKEOVER")
  if (takeover) hits.push({ key: "takeover", evidence: [add(`${takeover.source} : reprise, le ${DATE.format(takeover.occurredAt)}`, takeover.summary, takeover.sourceUrl)] })
  const geo = signals.find((s) => s.kind === "GEO_ABSENT")
  if (geo) hits.push({ key: "geo_absent", evidence: [add(`${geo.source}, le ${DATE.format(geo.occurredAt)}`, geo.summary, geo.sourceUrl)] })
  const content = brief ? briefContentSchema.safeParse(brief.content) : null
  if (content?.success) {
    for (const n of content.data.news.slice(0, 2)) add(`Actualité relevée par l'Enquêteur${n.date ? ` (${n.date})` : ""}`, n.text, n.sources[0] ?? null)
  }
  return { evidence, signals: hits }
}

/** The audit as the offers and the writer read it, with the research's evidence and signals. */
export function withResearch<R extends Pick<AuditReport, "evidence" | "signals">>(report: R, extra: { evidence: Evidence[]; signals: SignalHit[] }): R {
  return extra.evidence.length ? { ...report, evidence: [...report.evidence, ...extra.evidence], signals: [...report.signals, ...extra.signals] } : report
}
