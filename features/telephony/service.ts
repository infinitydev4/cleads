import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { CurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { canonicalNumber, zadarmaGet, ZadarmaError } from "@/lib/telephony/zadarma"
import { LeadError } from "@/features/leads/errors"
import { scopeWhere } from "@/features/leads/service"
import { stopForLead } from "@/features/outreach/stops"
import type { PhoneCallData } from "./pending"
import { answered, outcomeOf, pbxTime, pbxTimeText, reachedTheLine, type ReportedCall } from "./rules"

type Tx = Prisma.TransactionClient

/**
 * Files a call the PBX reported, from the webhook or the nightly sync: replaying it only refreshes its facts. A call to a
 * fiche's number goes on its timeline as a CALL activity of the member, merged with the one the member may have logged
 * already, and counts as a contact like a logged call does (features/leads/service.ts, addActivity).
 */
export async function recordCall(workspaceId: string, call: ReportedCall): Promise<{ id: string; created: boolean; leadId: string | null }> {
  const number = canonicalNumber(call.number)
  const user = call.extension ? await prisma.user.findFirst({ where: { workspaceId, zadarmaExtension: call.extension }, select: { id: true } }) : null
  const facts = { durationSec: Math.max(0, Math.round(call.durationSec)), disposition: call.disposition }

  const known = await prisma.phoneCall.findUnique({ where: { provider_externalId: { provider: "zadarma", externalId: call.externalId } } })
  if (known) {
    await prisma.phoneCall.update({
      where: { id: known.id },
      data: { ...facts, ...(call.recordingId && !known.recordingId ? { recordingId: call.recordingId } : {}), ...(user && !known.userId ? { userId: user.id } : {}) },
    })
    return { id: known.id, created: false, leadId: known.leadId }
  }

  const lead = await findLead(workspaceId, number, user?.id ?? null)
  try {
    return await prisma.$transaction(async (tx) => {
      const row = await tx.phoneCall.create({
        data: { workspaceId, externalId: call.externalId, direction: call.direction, userId: user?.id ?? null, leadId: lead?.id ?? null, extension: call.extension, number, startedAt: call.startedAt, recordingId: call.recordingId, ...facts },
      })
      // E33: the AI caller's own extension is filed by its post-call webhook, with the transcript: not twice.
      const aiCaller = !!call.extension && call.extension === process.env.ZADARMA_AI_EXTENSION
      if (lead && !aiCaller && reachedTheLine(call.disposition)) await fileOnLead(tx, workspaceId, lead, user?.id ?? null, row.id, call)
      return { id: row.id, created: true, leadId: lead?.id ?? null }
    })
  } catch (error) {
    // The webhook and the sync raced for the same call: the other one filed it.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const row = await prisma.phoneCall.findUniqueOrThrow({ where: { provider_externalId: { provider: "zadarma", externalId: call.externalId } } })
      return { id: row.id, created: false, leadId: row.leadId }
    }
    throw error
  }
}

/** The fiche whose company or contact has this number: the member's own first, then the most recently touched. */
async function findLead(workspaceId: string, number: string, userId: string | null) {
  if (!number.startsWith("+")) return null
  const leads = await prisma.lead.findMany({
    where: { workspaceId, OR: [{ company: { phone: number } }, { contact: { phone: number } }] },
    select: { id: true, ownerId: true, status: true },
    orderBy: { updatedAt: "desc" },
    take: 10,
  })
  return leads.find((l) => userId && l.ownerId === userId) ?? leads[0] ?? null
}

async function fileOnLead(tx: Tx, workspaceId: string, lead: { id: string; status: string }, actorId: string | null, phoneCallId: string, call: ReportedCall) {
  const facts: PhoneCallData = { phoneCallId, direction: call.direction, durationSec: call.durationSec, disposition: call.disposition }

  // The member logged this call before the PBX reported it: the PBX only adds its facts, the person's word stands.
  if (actorId && call.direction === "OUTBOUND") {
    const logged = (
      await tx.activity.findMany({
        where: { leadId: lead.id, actorId, kind: "CALL", createdAt: { gte: new Date(call.startedAt.getTime() - 5 * 60_000) } },
        orderBy: { createdAt: "desc" },
        take: 5,
      })
    ).find((a) => !(a.data as Partial<PhoneCallData> | null)?.phoneCallId)
    if (logged) {
      await tx.activity.update({ where: { id: logged.id }, data: { data: { ...((logged.data as Prisma.JsonObject | null) ?? {}), ...facts } } })
      return
    }
  }

  const outcome = outcomeOf(call.disposition)
  const pickedUp = answered(call.disposition)
  const missed = call.direction === "INBOUND" && !pickedUp
  await tx.activity.create({
    data: {
      workspaceId,
      leadId: lead.id,
      actorId,
      actorKind: actorId ? "USER" : "SYSTEM",
      kind: "CALL",
      body: missed ? "Appel entrant manqué" : null,
      occurredAt: call.startedAt,
      data: { ...facts, ...(outcome ? { outcome } : {}), pending: !missed } as unknown as Prisma.InputJsonValue,
    },
  })

  // Same rule as a logged call: an attempt is a contact and takes the fiche out of « Nouveau »; a prospect who calls in
  // and is answered has replied. A missed incoming call changes nothing but the timeline.
  if (missed || outcome === "wrong_number") return
  const replied = call.direction === "INBOUND"
  const next = lead.status === "NEW" || lead.status === "CONTACTED" ? (replied ? "REPLIED" : lead.status === "NEW" ? "CONTACTED" : null) : null
  await tx.lead.update({ where: { id: lead.id }, data: { lastContactedAt: new Date(), ...(next ? { status: next } : {}) } })
  if (next) await tx.activity.create({ data: { workspaceId, leadId: lead.id, actorId, actorKind: actorId ? "USER" : "SYSTEM", kind: "STATUS_CHANGE", data: { from: lead.status, to: next, reason: "call" } } })
  if (next === "REPLIED") await stopForLead(tx, lead.id, "REPLIED", actorId)
}

/** NOTIFY_RECORD: the recording is ready. A call not filed yet gets it from the nightly sync. */
export async function attachRecording(externalId: string, recordingId: string): Promise<boolean> {
  const { count } = await prisma.phoneCall.updateMany({ where: { provider: "zadarma", externalId }, data: { recordingId } })
  return count > 0
}

/**
 * A short-lived link to listen to a call: for the member who made it, managers, and whoever may read its fiche.
 * Recordings stay at Zadarma; the CRM never copies them.
 */
export async function recordingLink(user: CurrentUser, phoneCallId: string): Promise<{ url: string }> {
  const call = await prisma.phoneCall.findFirst({ where: { id: phoneCallId, workspaceId: user.workspaceId } })
  const mayListen =
    call &&
    (call.userId === user.id ||
      can(user.role, "team:dispatch") ||
      (call.leadId && (await prisma.lead.count({ where: { id: call.leadId, workspaceId: user.workspaceId, ...scopeWhere(user, "lead:read") } }))))
  if (!call || !mayListen) throw new LeadError("not_found", "Appel introuvable.", 404)
  if (!call.recordingId) throw new LeadError("not_found", "Cet appel n’a pas été enregistré.", 404)
  try {
    const body = JSON.parse(await zadarmaGet("/v1/pbx/record/request/", { call_id: call.recordingId, lifetime: 1800 })) as { link?: string; links?: string[] }
    const url = body.link ?? body.links?.[0]
    if (!url) throw new LeadError("not_found", "Zadarma ne retrouve pas cet enregistrement.", 404)
    return { url }
  } catch (error) {
    if (error instanceof ZadarmaError) throw new LeadError("unavailable", error.message, 503)
    throw error
  }
}

interface StatRow {
  call_id?: string
  sip?: string | number
  clid?: string | number
  destination?: string | number
  callstart?: string
  disposition?: string
  seconds?: number
  is_recorded?: boolean | number | string
  pbx_call_id?: string
}

/** Zadarma's call_id is a number too long for JSON doubles ("1439981389.2702773"): read it as text. */
export function parseStats(text: string): StatRow[] {
  const body = JSON.parse(text.replace(/"call_id"\s*:\s*(-?[\d.]+)/g, '"call_id":"$1"')) as { stats?: StatRow[] }
  return body.stats ?? []
}

const isExtension = (v: unknown) => /^\d{2,6}$/.test(String(v ?? ""))

/**
 * The PBX's statistics as reported calls, one per pbx_call_id: an incoming call that rang several extensions has a row
 * per leg, and the answered (or longest) one is kept.
 */
export function statCalls(rows: StatRow[], direction: ReportedCall["direction"]): ReportedCall[] {
  const best = new Map<string, ReportedCall>()
  for (const r of rows) {
    const startedAt = pbxTime(r.callstart)
    if (!r.pbx_call_id || !startedAt) continue
    const disposition = String(r.disposition ?? "")
    const call: ReportedCall = {
      externalId: r.pbx_call_id,
      direction,
      extension: direction === "OUTBOUND" ? (isExtension(r.sip) ? String(r.sip) : null) : isExtension(r.destination) && answered(disposition) ? String(r.destination) : null,
      number: String((direction === "OUTBOUND" ? r.destination : r.clid) ?? ""),
      startedAt,
      durationSec: Number(r.seconds ?? 0),
      disposition,
      recordingId: r.is_recorded === true || r.is_recorded === 1 || r.is_recorded === "1" || r.is_recorded === "true" ? (r.call_id ?? null) : null,
    }
    const seen = best.get(call.externalId)
    const better = !seen || (answered(call.disposition) && !answered(seen.disposition)) || (answered(call.disposition) === answered(seen.disposition) && call.durationSec > seen.durationSec)
    if (better) best.set(call.externalId, call)
  }
  return [...best.values()]
}

/**
 * Nightly: files the calls of the last two days that a webhook did not bring (Zadarma down, a deploy, a refused
 * signature) and corrects the facts of the others. One page of 1,000 calls per direction: the statistics allow three
 * requests a minute.
 */
export async function syncCalls(workspaceId: string, now = new Date()): Promise<{ seen: number; filed: number; truncated: boolean }> {
  const start = pbxTimeText(new Date(now.getTime() - 48 * 3600_000))
  const end = pbxTimeText(now)
  let seen = 0
  let filed = 0
  let truncated = false
  for (const [type, direction] of [["out", "OUTBOUND"], ["in", "INBOUND"]] as const) {
    const rows = parseStats(await zadarmaGet("/v1/statistics/pbx/", { start, end, version: 2, call_type: type, limit: 1000 }))
    if (rows.length >= 1000) truncated = true
    for (const call of statCalls(rows, direction)) {
      seen += 1
      if ((await recordCall(workspaceId, call)).created) filed += 1
    }
  }
  if (truncated) console.warn("[ZADARMA_SYNC] more than 1,000 calls in 48 hours: the oldest were not checked")
  return { seen, filed, truncated }
}
