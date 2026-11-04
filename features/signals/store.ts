import type { Prisma, SignalKind } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { publishNotifications } from "@/lib/ai/realtime"
import { BODACC_SOURCE } from "@/features/enrichment/sources/bodacc"
import { RECENT_DAYS, legalStateOf, type SignalDraft } from "./kinds"

const DAY = 86_400_000
const dayDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`)

export interface SavedSignal {
  id: string
  companyId: string
  kind: SignalKind
  summary: string
  occurredAt: Date
}

/**
 * Saves the signals of some notices for the companies they name. A notice already saved for a company is skipped (its
 * key is unique per company), so replaying a day adds nothing. Proceedings and closures set the company's legal state;
 * a later judgment never reopens a closed company.
 */
export async function saveSignals(
  workspaceId: string,
  drafts: SignalDraft[],
  companiesBySiren: Map<string, string[]>,
  opts: { watchId?: string | null } = {}
): Promise<SavedSignal[]> {
  const rows: Prisma.CompanySignalCreateManyInput[] = []
  for (const d of drafts) {
    for (const companyId of companiesBySiren.get(d.siren) ?? []) {
      rows.push({
        workspaceId,
        companyId,
        kind: d.kind,
        occurredAt: dayDate(d.occurredAt),
        summary: d.summary.slice(0, 500),
        details: d.details,
        source: BODACC_SOURCE,
        sourceUrl: d.sourceUrl,
        externalKey: d.externalKey,
        watchId: opts.watchId ?? null,
        expiresAt: new Date(dayDate(d.publishedOn).getTime() + RECENT_DAYS * DAY),
      })
    }
  }
  if (!rows.length) return []
  const saved = await prisma.companySignal.createManyAndReturn({ data: rows, skipDuplicates: true, select: { id: true, companyId: true, kind: true, summary: true, occurredAt: true } })
  for (const s of saved) {
    const state = legalStateOf(s.kind)
    if (!state) continue
    await prisma.company.updateMany({
      where: { id: s.companyId, legalState: state === "CLOSED" ? { not: "CLOSED" } : "ACTIVE" },
      data: { legalState: state, legalStateAt: s.occurredAt },
    })
  }
  return saved
}

/** The companies of a workspace that carry these SIRENs (a duplicate fiche gets the signal too). */
export async function companiesBySiren(workspaceId: string, sirens: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  for (let i = 0; i < sirens.length; i += 1000) {
    const part = sirens.slice(i, i + 1000)
    for (const c of await prisma.company.findMany({ where: { workspaceId, siren: { in: part } }, select: { id: true, siren: true } })) {
      out.set(c.siren!, [...(out.get(c.siren!) ?? []), c.id])
    }
  }
  return out
}

/** A note in the bell of each person. Never throws: the signal stays on the fiche. */
export async function notify(userIds: (string | null | undefined)[], note: { title: string; message: string }): Promise<void> {
  const to = [...new Set(userIds.filter((id): id is string => !!id))]
  if (!to.length) return
  try {
    const notes = await prisma.notification.createManyAndReturn({ data: to.map((userId) => ({ userId, type: "SYSTEM", title: note.title.slice(0, 120), message: note.message.slice(0, 500) })) })
    await publishNotifications(notes)
  } catch (error) {
    console.warn("[SIGNALS] notification failed", error instanceof Error ? error.message : error)
  }
}
