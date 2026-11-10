import { randomBytes } from "node:crypto"
import type { AiCallOutcome, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { toCrmRole } from "@/lib/crm/roles"
import { dayKey, addDays } from "@/lib/crm/day"
import { normalizePhone } from "@/lib/crm/normalize"
import { LeadError } from "@/features/leads/errors"
import { siteState } from "@/features/leads/insights"
import { domainOf } from "@/features/prospect-audit/latest"
import type { AuditReport } from "@/features/prospect-audit/schemas"
import { insertTask, closeOpenTasks } from "@/features/activity/core"
import { HOST_ROLES, bookMeeting, listSlots } from "@/features/meetings/service"
import { ACTIVE_STATUSES } from "@/features/meetings/rules"
import { dayKeyIn, zonedToUtc } from "@/features/meetings/slots"
import { appBaseUrl } from "@/features/team/invite-email"
import { ElevenLabsError, createAgent, createTool, elevenLabsConfigured, listPhoneNumbers, listVoices, placeCall } from "@/lib/telephony/elevenlabs"
import {
  FACT_FIELDS, HOOK_KEYS, MAX_ATTEMPTS, MAX_CONCURRENT, OUTCOME_LABELS, RETRY_AFTER_HOURS, STALE_AFTER_MIN, TZ,
  buildPrompt, callableNumber, costMicrosOf, dynamicVariables, failureOutcome, finalOutcome, firstMessage, hooksOf, inCallingHours,
  parseFacts, parseTranscript, pickHook, retryable,
  type CallFacts, type HookKey, type HookMode, type TranscriptLine,
} from "./rules"
import type { LaunchWaveInput, SettingsInput, WaveSource } from "./schemas"

type Tx = Prisma.TransactionClient
const who = (u: { name?: string | null; email?: string | null } | null | undefined) => u?.name || u?.email || "—"

// ── Settings ───────────────────────────────────────────────────────────────────────────────────────────────────

async function settingOf(workspaceId: string) {
  return prisma.aiCallSetting.upsert({ where: { workspaceId }, create: { workspaceId }, update: {} })
}

export interface SetupState {
  key: boolean
  webhookSecret: boolean
  agent: boolean
  number: boolean
  host: boolean
  /** Everything needed to dial. */
  ready: boolean
}

function setupOf(s: { agentId: string | null; phoneNumberId: string | null; hostId: string | null }): SetupState {
  const key = elevenLabsConfigured()
  const webhookSecret = Boolean(process.env.ELEVENLABS_WEBHOOK_SECRET)
  const state = { key, webhookSecret, agent: !!s.agentId, number: !!s.phoneNumberId, host: !!s.hostId }
  return { ...state, ready: Object.values(state).every(Boolean) }
}

export async function hostsFor(workspaceId: string) {
  const rows = await prisma.user.findMany({ where: { workspaceId, active: true, role: { in: [...HOST_ROLES] } }, select: { id: true, name: true, email: true, bookingProfile: { select: { videoUrl: true } } }, orderBy: { name: "asc" } })
  return rows.map((h) => ({ id: h.id, name: who(h), hasVideoLink: !!h.bookingProfile?.videoUrl }))
}

export async function settingsView(user: CurrentUser) {
  const s = await settingOf(user.workspaceId)
  return {
    paused: s.paused,
    agentId: s.agentId,
    phoneNumberId: s.phoneNumberId,
    voiceId: s.voiceId,
    hostId: s.hostId,
    meetingFormat: (s.meetingFormat === "phone" ? "phone" : "meet") as "meet" | "phone",
    hooks: hooksOf(s.hooks),
    monthlyCapCents: s.monthlyCapCents,
    setup: setupOf(s),
    webhookUrl: `${appBaseUrl()}/api/webhooks/elevenlabs`,
  }
}
export type AiCallerSettings = Awaited<ReturnType<typeof settingsView>>

export async function updateSettings(user: CurrentUser, patch: SettingsInput) {
  if (patch.hostId) {
    const host = await prisma.user.findFirst({ where: { id: patch.hostId, workspaceId: user.workspaceId, active: true, role: { in: [...HOST_ROLES] } }, select: { id: true } })
    if (!host) throw new LeadError("invalid", "Cette personne ne reçoit pas de rendez-vous.")
  }
  const data: Prisma.AiCallSettingUpdateInput = {
    ...(patch.paused !== undefined ? { paused: patch.paused } : {}),
    ...(patch.phoneNumberId !== undefined ? { phoneNumberId: patch.phoneNumberId || null } : {}),
    ...(patch.voiceId !== undefined ? { voiceId: patch.voiceId || null } : {}),
    ...(patch.hostId !== undefined ? { hostId: patch.hostId || null } : {}),
    ...(patch.meetingFormat ? { meetingFormat: patch.meetingFormat } : {}),
    ...(patch.monthlyCapCents !== undefined ? { monthlyCapCents: patch.monthlyCapCents } : {}),
    ...(patch.hooks ? { hooks: { ...hooksOf((await settingOf(user.workspaceId)).hooks), ...patch.hooks } } : {}),
  }
  await settingOf(user.workspaceId)
  await prisma.aiCallSetting.update({ where: { workspaceId: user.workspaceId }, data })
  await audit({ action: "ai_caller.settings_changed", actorId: user.id, workspaceId: user.workspaceId, entityType: "AiCallSetting", entityId: user.workspaceId, metadata: { fields: Object.keys(patch) } })
  if (patch.paused === false) await dispatchCalls(user.workspaceId)
  return settingsView(user)
}

/** The numbers and voices of the ElevenLabs account, for the settings page. Empty when the key is missing. */
export async function accountChoices() {
  if (!elevenLabsConfigured()) return { numbers: [], voices: [], error: null as string | null }
  try {
    const [numbers, voices] = await Promise.all([listPhoneNumbers(), listVoices()])
    return { numbers, voices: voices.slice(0, 40), error: null }
  } catch (e) {
    return { numbers: [], voices: [], error: e instanceof ElevenLabsError ? e.message : "ElevenLabs ne répond pas." }
  }
}

/**
 * Creates the agent in the ElevenLabs account: four tools that call Cleads back, what to extract from each call, and
 * the per-call overrides allowed. The prompt sent with each call replaces the placeholder one.
 */
export async function setupAgent(user: CurrentUser) {
  const base = `${appBaseUrl()}/api/ai-caller/tools`
  const toolIds = [
    await createTool({ name: "get_slots", description: "Donne les prochains créneaux libres du chef de projet. À appeler avant de proposer un rendez-vous.", url: `${base}/slots`, params: {} }),
    await createTool({
      name: "book_meeting",
      description: "Réserve le rendez-vous sur le créneau choisi par le prospect.",
      url: `${base}/book`,
      params: {
        starts_at: { type: "string", description: "Le champ starts_at exact du créneau choisi, tel que donné par get_slots." },
        email: { type: "string", description: "L’adresse email du prospect s’il l’a donnée pour recevoir le lien, sinon vide." },
      },
      required: ["starts_at"],
    }),
    await createTool({
      name: "callback",
      description: "Note qu’il faut rappeler le prospect plus tard (pas le bon moment, pas le décideur).",
      url: `${base}/callback`,
      params: {
        when: { type: "string", description: "Quand rappeler, avec les mots du prospect (ex. « demain vers 14 h »)." },
        day: { type: "string", description: "Le jour du rappel au format AAAA-MM-JJ si on le connaît, sinon vide." },
        who: { type: "string", description: "Qui demander au rappel, si la personne l’a dit. Sinon vide." },
      },
      required: ["when"],
    }),
    await createTool({ name: "do_not_call", description: "Le prospect ne veut plus être appelé : retire son numéro. À utiliser dès qu’il le demande.", url: `${base}/do-not-call`, params: {} }),
  ]
  const s = await settingOf(user.workspaceId)
  const agentId = await createAgent({
    name: "Cleads · agent d’appel",
    prompt: "Tu es l’assistante IA de Cleads. Les consignes de chaque appel sont envoyées au moment de l’appel.",
    firstMessage: "Bonjour, ici l’assistante IA de Cleads.",
    voiceId: s.voiceId,
    toolIds,
    dataCollection: FACT_FIELDS,
  })
  await prisma.aiCallSetting.update({ where: { workspaceId: user.workspaceId }, data: { agentId } })
  await audit({ action: "ai_caller.agent_created", actorId: user.id, workspaceId: user.workspaceId, entityType: "AiCallSetting", entityId: user.workspaceId, metadata: { agentId } })
  return settingsView(user)
}

// ── What the agent may say about a fiche ───────────────────────────────────────────────────────────────────────

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 } as const

/** "Le site met 9 s à s’afficher." → "le site met 9 s à s’afficher", to sit inside a sentence. */
const inline = (title: string) => {
  const t = title.trim().replace(/[.!]+$/, "")
  return t.charAt(0).toLowerCase() + t.slice(1)
}

function problem(report: AuditReport | null, areas: string[]): string | null {
  const hit = (report?.findings ?? []).filter((f) => areas.includes(f.area)).sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])[0]
  return hit ? inline(hit.title) : null
}

const leadSelect = {
  id: true,
  status: true,
  ownerId: true,
  company: { select: { name: true, sector: true, city: true, phone: true, website: true, domain: true } },
  contact: { select: { name: true, phone: true, doNotContact: true } },
  generatedSites: { where: { status: "READY" as const }, select: { id: true }, take: 1 },
} satisfies Prisma.LeadSelect
type LeadRow = Prisma.LeadGetPayload<{ select: typeof leadSelect }>

export interface Candidate {
  leadId: string
  number: string | null
  facts: CallFacts
}

/** Facts for many fiches at once, with each one's latest audit (its own, or a fresh one of the same domain). */
async function candidates(workspaceId: string, leads: LeadRow[], now = new Date()): Promise<Candidate[]> {
  const ids = leads.map((l) => l.id)
  const domains = [...new Set(leads.map((l) => domainOf(l.company)).filter((d): d is string => !!d))]
  const audits = ids.length
    ? await prisma.prospectAudit.findMany({
        where: { workspaceId, OR: [{ leadId: { in: ids } }, ...(domains.length ? [{ domain: { in: domains }, validUntil: { gt: now } }] : [])] },
        orderBy: { createdAt: "desc" },
        select: { leadId: true, domain: true, score: true, summary: true, report: true },
      })
    : []
  return leads.map((l) => {
    const domain = domainOf(l.company)
    const a = audits.find((x) => x.leadId === l.id || (domain && x.domain === domain)) ?? null
    const report = (a?.report ?? null) as AuditReport | null
    return {
      leadId: l.id,
      number: normalizePhone(l.contact?.phone) ?? normalizePhone(l.company?.phone),
      facts: {
        company: l.company?.name ?? "votre entreprise",
        trade: l.company?.sector ?? null,
        city: l.company?.city ?? null,
        contactName: l.contact?.name ?? null,
        site: siteState(l.company?.website, a?.score),
        mobileProblem: problem(report, ["mobile", "vitesse"]),
        searchProblem: problem(report, ["seoLocal", "geo", "presence"]),
        auditPoints: (a?.summary ?? []).slice(0, 3),
        hasMockup: l.generatedSites.length > 0,
      },
    }
  })
}

// ── Waves ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Fiches still worth a first call: not blocked, not already in talks, not called by the agent this month. */
function sourceWhere(workspaceId: string, source: WaveSource, now: Date): Prisma.LeadWhereInput {
  return {
    workspaceId,
    status: { in: ["NEW", "CONTACTED"] },
    ...(source.kind === "campaign" ? { campaignId: source.campaignId } : { ownerId: null }),
    // A fiche whose contact refused stays out; one without contact is called on the company's number.
    NOT: { contact: { is: { doNotContact: true } } },
    aiCalls: { none: { createdAt: { gt: new Date(now.getTime() - 30 * 86_400_000) } } },
    meetings: { none: { status: { in: [...ACTIVE_STATUSES] } } },
  }
}

const POOL_LIMIT = 1000

/** Who a wave would call, and why the others are left out. */
async function eligible(user: CurrentUser, source: WaveSource, mode: HookMode, now = new Date()) {
  const texts = hooksOf((await settingOf(user.workspaceId)).hooks)
  const where = sourceWhere(user.workspaceId, source, now)
  const leads = await prisma.lead.findMany({
    where,
    select: leadSelect,
    orderBy: [{ score: "desc" }, { createdAt: "asc" }],
    take: POOL_LIMIT,
  })
  const rows = await candidates(user.workspaceId, leads, now)
  const out: { leadId: string; number: string; hook: HookKey }[] = []
  let noPhone = 0
  let noHook = 0
  for (const c of rows) {
    if (!callableNumber(c.number)) {
      noPhone++
      continue
    }
    const pick = pickHook(mode, c.facts, texts)
    if (!pick) {
      noHook++
      continue
    }
    out.push({ leadId: c.leadId, number: c.number, hook: pick.hook })
  }
  return { rows: out, noPhone, noHook }
}

export async function previewWave(user: CurrentUser, source: WaveSource, mode: HookMode) {
  const { rows, noPhone, noHook } = await eligible(user, source, mode)
  const byHook = Object.fromEntries(HOOK_KEYS.map((k) => [k, rows.filter((r) => r.hook === k).length])) as Record<HookKey, number>
  return { eligible: rows.length, noPhone, noHook, byHook }
}

export async function launchWave(user: CurrentUser, input: LaunchWaveInput) {
  const s = await settingOf(user.workspaceId)
  const setup = setupOf(s)
  if (!setup.ready) throw new LeadError("unavailable", "L’agent n’est pas encore prêt : terminez sa configuration dans Réglages.", 503)
  const hostId = input.hostId ?? s.hostId
  if (!hostId) throw new LeadError("invalid", "Choisissez le chef de projet qui reçoit les rendez-vous.")
  const host = await prisma.user.findFirst({ where: { id: hostId, workspaceId: user.workspaceId, active: true, role: { in: [...HOST_ROLES] } }, select: { id: true } })
  if (!host) throw new LeadError("invalid", "Cette personne ne reçoit pas de rendez-vous.")
  let name = "Fiches non attribuées"
  if (input.source.kind === "campaign") {
    const campaign = await prisma.campaign.findFirst({ where: { id: input.source.campaignId, workspaceId: user.workspaceId }, select: { name: true } })
    if (!campaign) throw new LeadError("not_found", "Campagne introuvable.", 404)
    name = campaign.name
  }
  const { rows } = await eligible(user, input.source, input.hookMode)
  const picked = rows.slice(0, input.size)
  if (!picked.length) throw new LeadError("invalid", "Aucune fiche à appeler : il faut un numéro français et un audit (ou pas de site).")
  const wave = await prisma.aiCallWave.create({
    data: {
      workspaceId: user.workspaceId,
      name,
      createdById: user.id,
      hostId,
      meetingFormat: input.meetingFormat ?? s.meetingFormat,
      hookMode: input.hookMode,
      calls: { create: picked.map((r) => ({ workspaceId: user.workspaceId, leadId: r.leadId, number: r.number, hook: r.hook, token: newToken() })) },
    },
  })
  await audit({ action: "ai_caller.wave_launched", actorId: user.id, workspaceId: user.workspaceId, entityType: "AiCallWave", entityId: wave.id, metadata: { calls: picked.length, source: input.source.kind, hookMode: input.hookMode } })
  await dispatchCalls(user.workspaceId)
  return { id: wave.id, calls: picked.length }
}

export async function setWaveStatus(user: CurrentUser, waveId: string, status: "RUNNING" | "PAUSED" | "CANCELED") {
  const wave = await prisma.aiCallWave.findFirst({ where: { id: waveId, workspaceId: user.workspaceId }, select: { id: true, status: true } })
  if (!wave) throw new LeadError("not_found", "Vague introuvable.", 404)
  if (wave.status === "DONE" || wave.status === "CANCELED") throw new LeadError("conflict", "Cette vague est terminée.", 409)
  await prisma.aiCallWave.update({ where: { id: wave.id }, data: { status } })
  if (status === "CANCELED") await prisma.aiCall.updateMany({ where: { waveId: wave.id, status: "QUEUED" }, data: { status: "CANCELED" } })
  await audit({ action: `ai_caller.wave_${status.toLowerCase()}`, actorId: user.id, workspaceId: user.workspaceId, entityType: "AiCallWave", entityId: wave.id })
  if (status === "RUNNING") await dispatchCalls(user.workspaceId)
}

const newToken = () => randomBytes(24).toString("base64url")

// ── Dialling ───────────────────────────────────────────────────────────────────────────────────────────────────

/** First instant of the current month in Paris. */
export function monthStart(now: Date): Date {
  const day = dayKeyIn(now, TZ)
  return zonedToUtc(`${day.slice(0, 7)}-01`, 0, TZ) ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

export async function monthSpentMicros(workspaceId: string, now = new Date()) {
  const r = await prisma.aiCall.aggregate({ where: { workspaceId, createdAt: { gte: monthStart(now) } }, _sum: { costMicros: true } })
  return r._sum.costMicros ?? 0
}

export type DispatchResult = { placed: number; stopped?: "not_ready" | "paused" | "hours" | "budget" | "busy" | "empty" | "error" }

/**
 * Hands queued calls to ElevenLabs while the hours, the budget and the free lines allow. Called by the cron every five
 * minutes, after a wave starts or resumes, and after each call ends. Rows are claimed before dialling, so two runs at
 * once never dial the same call.
 */
export async function dispatchCalls(workspaceId: string, now = new Date()): Promise<DispatchResult> {
  await prisma.aiCall.updateMany({
    where: { workspaceId, status: "DIALING", dispatchedAt: { lt: new Date(now.getTime() - STALE_AFTER_MIN * 60_000) } },
    data: { status: "FAILED", outcome: "FAILED", error: "ElevenLabs n’a jamais envoyé le compte rendu de cet appel." },
  })
  const s = await prisma.aiCallSetting.findUnique({ where: { workspaceId } })
  const result = await (async (): Promise<DispatchResult> => {
    if (!s || !setupOf(s).ready) return { placed: 0, stopped: "not_ready" }
    if (s.paused) return { placed: 0, stopped: "paused" }
    if (!inCallingHours(now)) return { placed: 0, stopped: "hours" }
    if ((await monthSpentMicros(workspaceId, now)) >= s.monthlyCapCents * 10_000) return { placed: 0, stopped: "budget" }

    const claimed = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"ai-calls:" + workspaceId}))`
      const live = await tx.aiCall.count({ where: { workspaceId, status: "DIALING" } })
      const free = MAX_CONCURRENT - live
      if (free <= 0) return null
      const next = await tx.aiCall.findMany({
        where: { workspaceId, status: "QUEUED", notBefore: { lte: now }, wave: { status: "RUNNING" } },
        orderBy: [{ attempt: "asc" }, { createdAt: "asc" }],
        take: free,
        include: { wave: { select: { hostId: true, meetingFormat: true } } },
      })
      if (next.length) await tx.aiCall.updateMany({ where: { id: { in: next.map((c) => c.id) } }, data: { status: "DIALING", dispatchedAt: now } })
      return next
    })
    if (claimed === null) return { placed: 0, stopped: "busy" }
    if (!claimed.length) return { placed: 0, stopped: "empty" }

    let placed = 0
    for (const c of claimed) {
      const ok = await dial(workspaceId, s, c, now)
      if (ok === "fatal") return { placed, stopped: "error" }
      if (ok) placed++
    }
    return { placed }
  })()
  await closeFinishedWaves(workspaceId)
  return result
}

async function dial(workspaceId: string, s: { agentId: string | null; phoneNumberId: string | null; voiceId: string | null; hooks: Prisma.JsonValue }, c: { id: string; leadId: string; hook: string; token: string; wave: { hostId: string; meetingFormat: string } }, now: Date): Promise<boolean | "fatal"> {
  const lead = await prisma.lead.findUnique({ where: { id: c.leadId }, select: leadSelect })
  const [cand] = lead ? await candidates(workspaceId, [lead], now) : []
  const blocked = !lead || lead.status === "DO_NOT_CONTACT" || lead.status === "DISQUALIFIED" || lead.contact?.doNotContact
  const pick = cand ? pickHook(c.hook as HookKey, cand.facts, hooksOf(s.hooks)) : null
  if (blocked || !cand || !callableNumber(cand.number) || !pick) {
    await prisma.aiCall.update({ where: { id: c.id }, data: { status: "CANCELED", error: blocked ? "Fiche bloquée entre-temps." : "Plus rien de vrai à dire à cette fiche." } })
    return false
  }
  const host = await prisma.user.findUnique({ where: { id: c.wave.hostId }, select: { name: true, email: true } })
  const brief = { facts: cand.facts, hookText: pick.text, hostName: who(host), format: (c.wave.meetingFormat === "phone" ? "phone" : "meet") as "meet" | "phone", today: todayLabel(now) }
  try {
    const r = await placeCall({
      agentId: s.agentId!,
      phoneNumberId: s.phoneNumberId!,
      to: cand.number,
      dynamicVariables: dynamicVariables(c.token, brief),
      override: { prompt: buildPrompt(brief), firstMessage: firstMessage(brief), language: "fr", voiceId: s.voiceId },
    })
    await prisma.aiCall.update({ where: { id: c.id }, data: { conversationId: r.conversationId, hook: pick.hook, number: cand.number } })
    return true
  } catch (e) {
    const message = e instanceof ElevenLabsError ? e.message : "L’appel n’a pas pu partir."
    await prisma.aiCall.update({ where: { id: c.id }, data: { status: "FAILED", outcome: "FAILED", error: message } })
    console.error("[AI_CALLER_DIAL]", message)
    // A refused key or agent will refuse the next calls too: stop and let the owner look.
    return e instanceof ElevenLabsError && (e.kind === "not_configured" || e.status === 401 || e.status === 404) ? "fatal" : false
  }
}

const todayFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ })
const todayLabel = (now: Date) => `${todayFormat.format(now)} (${dayKeyIn(now, TZ)})`

async function closeFinishedWaves(workspaceId: string) {
  const open = await prisma.aiCallWave.findMany({ where: { workspaceId, status: { in: ["RUNNING", "PAUSED"] }, calls: { none: { status: { in: ["QUEUED", "DIALING"] } } } }, select: { id: true } })
  if (open.length) await prisma.aiCallWave.updateMany({ where: { id: { in: open.map((w) => w.id) } }, data: { status: "DONE" } })
}

// ── The agent's tools, during the call ─────────────────────────────────────────────────────────────────────────

/** The live call a tool's token names, with the member it books for (the wave's creator). */
async function liveCall(token: string) {
  const call = await prisma.aiCall.findUnique({
    where: { token },
    include: { wave: { include: { createdBy: { select: { id: true, workspaceId: true, name: true, email: true, image: true, role: true, active: true } } } } },
  })
  if (!call || call.status !== "DIALING") throw new LeadError("not_found", "Cet appel n’est plus en cours.", 404)
  const u = call.wave.createdBy
  const role = toCrmRole(u.role)
  if (!u.active || !role || !u.workspaceId) throw new LeadError("forbidden", "La personne qui a lancé la vague n’a plus accès.", 403)
  const actor: CurrentUser = { id: u.id, workspaceId: u.workspaceId, name: u.name ?? u.email ?? "", email: u.email ?? "", image: u.image, role }
  return { call, actor }
}

const slotFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: TZ })

/** Up to four open slots, spread over different half-days, so two real choices can be offered. */
export async function toolSlots(token: string, now = new Date()) {
  const { call, actor } = await liveCall(token)
  const { slots } = await listSlots(actor, call.wave.hostId, dayKey(now), 10)
  const picked: string[] = []
  const halfDay = (iso: string) => {
    const d = new Date(iso)
    return `${dayKeyIn(d, TZ)}-${Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(d)) < 13 ? "am" : "pm"}`
  }
  for (const s of slots) {
    if (new Date(s).getTime() < now.getTime() + 3 * 3600_000) continue
    if (picked.some((p) => halfDay(p) === halfDay(s))) continue
    picked.push(s)
    if (picked.length === 4) break
  }
  if (!picked.length) return { slots: [], message: "Aucun créneau libre dans les dix prochains jours : propose plutôt un rappel avec l’outil callback." }
  return { slots: picked.map((iso) => ({ starts_at: iso, label: slotFormat.format(new Date(iso)).replace(":", " h ") })) }
}

export async function toolBook(token: string, input: { starts_at: string; email?: string | null }) {
  const { call, actor } = await liveCall(token)
  const lead = await prisma.lead.findUnique({ where: { id: call.leadId }, select: { contactId: true } })
  const email = input.email?.trim().toLowerCase()
  // The address the prospect gave on the phone goes on the contact when it has none: that is where the link is sent.
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && lead?.contactId) await prisma.contact.updateMany({ where: { id: lead.contactId, email: null }, data: { email } })
  const phone = call.wave.meetingFormat === "phone"
  try {
    const meeting = await bookMeeting(
      actor,
      { leadId: call.leadId, hostId: call.wave.hostId, startsAt: new Date(input.starts_at).toISOString(), type: "DISCOVERY", notes: `Pris par l’agent d’appel IA. ${phone ? `Rendez-vous téléphonique : appeler le ${call.number}.` : "Visio Google Meet."}`, notifyGuest: true },
      null,
      { source: "ai-caller" }
    )
    await prisma.aiCall.update({ where: { id: call.id }, data: { outcome: "MEETING", meetingId: meeting.id } })
    return { booked: true, message: `Rendez-vous réservé : ${slotFormat.format(new Date(meeting.startsAt)).replace(":", " h ")}, ${phone ? "au téléphone" : "en visio"}.` }
  } catch (e) {
    if (e instanceof LeadError) return { booked: false, message: `${e.message} Propose un autre créneau de get_slots.` }
    throw e
  }
}

export async function toolCallback(token: string, input: { when: string; day?: string | null; who?: string | null }) {
  const { call, actor } = await liveCall(token)
  const lead = await prisma.lead.findUnique({ where: { id: call.leadId }, select: { ownerId: true } })
  const day = input.day && /^\d{4}-\d{2}-\d{2}$/.test(input.day) ? input.day : addDays(dayKey(new Date()), 1)
  const title = `Rappeler : ${input.when.trim().slice(0, 120)}${input.who?.trim() ? ` (demander ${input.who.trim().slice(0, 60)})` : ""} · demandé à l’agent IA`
  await prisma.$transaction((tx: Tx) => insertTask(tx, actor, { leadId: call.leadId, title, dueDay: day, assigneeId: lead?.ownerId ?? actor.id }))
  await prisma.aiCall.update({ where: { id: call.id }, data: { outcome: "CALLBACK" } })
  return { saved: true, message: "C’est noté, le rappel est prévu." }
}

export async function toolDoNotCall(token: string) {
  const { call, actor } = await liveCall(token)
  await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({ where: { id: call.leadId }, select: { status: true, contactId: true } })
    if (lead && lead.status !== "DO_NOT_CONTACT") {
      await tx.lead.update({ where: { id: call.leadId }, data: { status: "DO_NOT_CONTACT" } })
      await tx.activity.create({ data: { workspaceId: call.workspaceId, leadId: call.leadId, actorKind: "AGENT", kind: "STATUS_CHANGE", body: `Statut : ${lead.status} → DO_NOT_CONTACT (demandé au téléphone à l’agent IA)`, data: { from: lead.status, to: "DO_NOT_CONTACT", aiCallId: call.id } } })
      await closeOpenTasks(tx, actor, call.leadId, "le prospect ne veut plus être appelé")
    }
    if (lead?.contactId) await tx.contact.update({ where: { id: lead.contactId }, data: { doNotContact: true, doNotContactReason: "Demandé à l’agent d’appel IA" } })
    await tx.aiCall.update({ where: { id: call.id }, data: { outcome: "DO_NOT_CALL" } })
    await tx.aiCall.updateMany({ where: { leadId: call.leadId, status: "QUEUED" }, data: { status: "CANCELED" } })
  })
  return { saved: true, message: "Le numéro est retiré, il ne sera plus appelé." }
}

// ── After the call: ElevenLabs' webhook ────────────────────────────────────────────────────────────────────────

const minSec = (s: number) => `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")}`

interface Finished {
  conversationId: string
  token: string | null
  durationSec: number
  startedAt: Date | null
  transcript: TranscriptLine[]
  summary: string | null
  dataCollection: unknown
}

export function readTranscriptionEvent(data: Record<string, unknown>): Finished | null {
  const conversationId = typeof data.conversation_id === "string" ? data.conversation_id : null
  if (!conversationId) return null
  const meta = (data.metadata ?? {}) as { call_duration_secs?: unknown; start_time_unix_secs?: unknown }
  const analysis = (data.analysis ?? {}) as { transcript_summary?: unknown; data_collection_results?: unknown }
  const init = (data.conversation_initiation_client_data ?? {}) as { dynamic_variables?: Record<string, unknown> }
  const token = init.dynamic_variables?.call_token
  return {
    conversationId,
    token: typeof token === "string" ? token : null,
    durationSec: typeof meta.call_duration_secs === "number" ? Math.round(meta.call_duration_secs) : 0,
    startedAt: typeof meta.start_time_unix_secs === "number" ? new Date(meta.start_time_unix_secs * 1000) : null,
    transcript: parseTranscript(data.transcript),
    summary: typeof analysis.transcript_summary === "string" ? analysis.transcript_summary.slice(0, 2000) : null,
    dataCollection: analysis.data_collection_results,
  }
}

async function findCall(conversationId: string, token: string | null) {
  return (await prisma.aiCall.findUnique({ where: { conversationId } })) ?? (token ? await prisma.aiCall.findUnique({ where: { token } }) : null)
}

/** Files the finished call: its result, transcript and cost, a CALL line on the fiche, and a second try when nobody answered. */
export async function finishCall(f: Finished, now = new Date()) {
  const call = await findCall(f.conversationId, f.token)
  if (!call) return { filed: false as const, reason: "unknown_call" }
  if (call.status === "DONE") return { filed: false as const, reason: "already_filed" }
  const { facts, voicemail } = parseFacts(f.dataCollection)
  const userSpoke = f.transcript.some((t) => t.role === "user")
  const outcome = finalOutcome({ fromTool: call.outcome && call.outcome !== "FAILED" ? call.outcome : null, voicemail, userSpoke, durationSec: f.durationSec })
  const startedAt = f.startedAt ?? call.dispatchedAt ?? now
  await prisma.$transaction(async (tx) => {
    await tx.aiCall.update({
      where: { id: call.id },
      data: { status: "DONE", outcome, conversationId: f.conversationId, startedAt, durationSec: f.durationSec, costMicros: costMicrosOf(f.durationSec), transcript: f.transcript as unknown as Prisma.InputJsonValue, summary: f.summary, facts, error: null },
    })
    await tx.activity.create({
      data: { workspaceId: call.workspaceId, leadId: call.leadId, actorKind: "AGENT", kind: "CALL", occurredAt: startedAt, body: f.summary ?? `${OUTCOME_LABELS[outcome]} (${minSec(f.durationSec)})`, data: { aiCallId: call.id, aiOutcome: outcome, durationSec: f.durationSec } },
    })
    if (userSpoke) {
      const lead = await tx.lead.findUnique({ where: { id: call.leadId }, select: { status: true } })
      await tx.lead.update({ where: { id: call.leadId }, data: { lastContactedAt: startedAt, ...(lead?.status === "NEW" ? { status: "CONTACTED" } : {}) } })
    }
    if (retryable(outcome) && call.attempt < MAX_ATTEMPTS) {
      await tx.aiCall.create({ data: { workspaceId: call.workspaceId, waveId: call.waveId, leadId: call.leadId, number: call.number, hook: call.hook, attempt: call.attempt + 1, notBefore: new Date(now.getTime() + RETRY_AFTER_HOURS * 3600_000), token: newToken() } })
    }
  })
  await dispatchCalls(call.workspaceId, now)
  return { filed: true as const, outcome }
}

/** call_initiation_failure: the line was busy, nobody picked up, or the call could not start. */
export async function failCall(data: Record<string, unknown>, now = new Date()) {
  const conversationId = typeof data.conversation_id === "string" ? data.conversation_id : null
  if (!conversationId) return { filed: false as const }
  const call = await prisma.aiCall.findUnique({ where: { conversationId } })
  if (!call || call.status === "DONE") return { filed: false as const }
  const outcome = failureOutcome(data.failure_reason)
  await prisma.$transaction(async (tx) => {
    await tx.aiCall.update({ where: { id: call.id }, data: { status: "DONE", outcome, error: outcome === "FAILED" ? `Échec de l’appel (${String(data.failure_reason ?? "inconnu")})` : null } })
    if (retryable(outcome) && call.attempt < MAX_ATTEMPTS) {
      await tx.aiCall.create({ data: { workspaceId: call.workspaceId, waveId: call.waveId, leadId: call.leadId, number: call.number, hook: call.hook, attempt: call.attempt + 1, notBefore: new Date(now.getTime() + RETRY_AFTER_HOURS * 3600_000), token: newToken() } })
    }
  })
  await dispatchCalls(call.workspaceId, now)
  return { filed: true as const, outcome }
}

// ── What the page shows ────────────────────────────────────────────────────────────────────────────────────────

const REACHED: AiCallOutcome[] = ["MEETING", "CALLBACK", "NOT_INTERESTED", "DO_NOT_CALL"]

export interface CallRow {
  id: string
  leadId: string
  company: string
  meta: string
  hook: HookKey
  status: "QUEUED" | "DIALING" | "DONE" | "FAILED" | "CANCELED"
  outcome: AiCallOutcome | null
  durationSec: number
  attempt: number
  at: string
}

export async function overview(user: CurrentUser, now = new Date()) {
  const s = await settingOf(user.workspaceId)
  const dayStart = zonedToUtc(dayKeyIn(now, TZ), 0, TZ) ?? now
  const [today, spent, waves, calls, campaigns] = await Promise.all([
    prisma.aiCall.groupBy({ by: ["outcome"], where: { workspaceId: user.workspaceId, dispatchedAt: { gte: dayStart } }, _count: { _all: true } }),
    monthSpentMicros(user.workspaceId, now),
    prisma.aiCallWave.findMany({
      where: { workspaceId: user.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, status: true, hookMode: true, meetingFormat: true, createdAt: true, _count: { select: { calls: true } }, calls: { where: { status: { in: ["DONE", "FAILED", "CANCELED"] } }, select: { id: true } } },
    }),
    prisma.aiCall.findMany({
      where: { workspaceId: user.workspaceId },
      orderBy: [{ updatedAt: "desc" }],
      take: 150,
      select: { id: true, leadId: true, hook: true, status: true, outcome: true, durationSec: true, attempt: true, updatedAt: true, lead: { select: { company: { select: { name: true, sector: true, city: true } } } } },
    }),
    prisma.campaign.findMany({ where: { workspaceId: user.workspaceId, status: { not: "COMPLETED" } }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, name: true } }),
  ])
  const count = (pred: (o: AiCallOutcome | null) => boolean) => today.filter((g) => pred(g.outcome)).reduce((n, g) => n + g._count._all, 0)
  const placed = count(() => true)
  const reached = count((o) => !!o && REACHED.includes(o))
  return {
    paused: s.paused,
    setup: setupOf(s),
    hostId: s.hostId,
    meetingFormat: (s.meetingFormat === "phone" ? "phone" : "meet") as "meet" | "phone",
    capMicros: s.monthlyCapCents * 10_000,
    spentMicros: spent,
    inHours: inCallingHours(now),
    today: { placed, reached, meetings: count((o) => o === "MEETING"), callbacks: count((o) => o === "CALLBACK") },
    waves: waves.map((w) => ({ id: w.id, name: w.name, status: w.status, hookMode: w.hookMode, total: w._count.calls, done: w.calls.length, createdAt: w.createdAt.toISOString() })),
    calls: calls.map(
      (c): CallRow => ({
        id: c.id,
        leadId: c.leadId,
        company: c.lead.company?.name ?? "Fiche sans entreprise",
        meta: [c.lead.company?.sector, c.lead.company?.city].filter(Boolean).join(" · "),
        hook: c.hook as HookKey,
        status: c.status,
        outcome: c.outcome,
        durationSec: c.durationSec,
        attempt: c.attempt,
        at: c.updatedAt.toISOString(),
      })
    ),
    campaigns,
  }
}
export type AiCallerOverview = Awaited<ReturnType<typeof overview>>

export async function callDetail(user: CurrentUser, id: string) {
  const c = await prisma.aiCall.findFirst({
    where: { id, workspaceId: user.workspaceId },
    include: {
      lead: { select: { id: true, company: { select: { name: true, sector: true, city: true } }, contact: { select: { name: true } } } },
      wave: { select: { name: true, meetingFormat: true, hostId: true } },
    },
  })
  if (!c) throw new LeadError("not_found", "Appel introuvable.", 404)
  const meeting = c.meetingId ? await prisma.meeting.findUnique({ where: { id: c.meetingId }, select: { id: true, startsAt: true, status: true, host: { select: { name: true, email: true } } } }) : null
  return {
    id: c.id,
    leadId: c.leadId,
    company: c.lead.company?.name ?? "Fiche sans entreprise",
    meta: [c.lead.contact?.name, c.lead.company?.sector, c.lead.company?.city].filter(Boolean).join(" · "),
    number: c.number,
    hook: c.hook as HookKey,
    status: c.status,
    outcome: c.outcome,
    attempt: c.attempt,
    startedAt: (c.startedAt ?? c.dispatchedAt)?.toISOString() ?? null,
    durationSec: c.durationSec,
    costMicros: c.costMicros,
    summary: c.summary,
    facts: (c.facts ?? {}) as Record<string, string>,
    transcript: (Array.isArray(c.transcript) ? c.transcript : []) as unknown as TranscriptLine[],
    hasAudio: !!c.conversationId && c.status === "DONE" && c.durationSec > 0,
    error: c.error,
    format: (c.wave.meetingFormat === "phone" ? "phone" : "meet") as "meet" | "phone",
    meeting: meeting ? { id: meeting.id, startsAt: meeting.startsAt.toISOString(), status: meeting.status, hostName: who(meeting.host) } : null,
  }
}
export type AiCallDetail = Awaited<ReturnType<typeof callDetail>>

export async function conversationOf(user: CurrentUser, id: string) {
  const c = await prisma.aiCall.findFirst({ where: { id, workspaceId: user.workspaceId }, select: { conversationId: true } })
  if (!c?.conversationId) throw new LeadError("not_found", "Pas d’enregistrement pour cet appel.", 404)
  return c.conversationId
}
