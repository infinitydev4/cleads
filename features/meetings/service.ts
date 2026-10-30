import type { MeetingStatus, MeetingType, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import { rateLimit } from "@/lib/rate-limit"
import type { CurrentUser } from "@/lib/auth/guard"
import { canAccessRecord, scopeOf } from "@/lib/rbac"
import { addDays, dayKey } from "@/lib/crm/day"
import { companyDomain, normalizeEmail, normalizePhone } from "@/lib/crm/normalize"
import { LeadError } from "@/features/leads/errors"
import { scopeWhere } from "@/features/leads/service"
import { cleanCompany, matchCompany } from "@/features/leads/keys"
import { insertTask } from "@/features/activity/core"
import { lockLead } from "@/features/pipeline/deals"
import { DEAL_OWNER_ROLES, OPEN_STAGES } from "@/features/pipeline/rules"
import { appBaseUrl } from "@/features/team/invite-email"
import { computeSlots, isSlotOpen, isValidTimezone, validateException, validateWindows, type SlotRequest } from "./slots"
import {
  ACTIVE_STATUSES, MEETING_TYPE_LABELS, checkMeetingAction, guestMayChange, isActive,
  type AvailabilityInput, type BookMeetingInput, type MeetingActionInput, type PublicBookingInput,
} from "./rules"
import { bookingLink, manageLink, sendMeetingMail, whenLabel } from "./emails"
import { signMeetingToken, verifyMeetingToken } from "./token"

type Tx = Prisma.TransactionClient
const who = (u: { name?: string | null; email?: string | null } | null | undefined) => u?.name || u?.email || "—"
const ACTIVE = [...ACTIVE_STATUSES]

// ── Types shown to the interface ────────────────────────────────────────────────────────────────────────────────

export interface MeetingView {
  id: string
  leadId: string | null
  leadName: string
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  hostId: string
  hostName: string
  startsAt: string
  endsAt: string
  timezone: string
  type: MeetingType
  status: MeetingStatus
  outcome: string | null
  videoUrl: string | null
  notes: string | null
  source: string
  /** Over, but nobody has said how it went: the file keeps asking. */
  needsOutcome: boolean
}

const meetingInclude = {
  host: { select: { name: true, email: true } },
  contact: { select: { name: true, email: true, phone: true } },
  lead: { select: { id: true, company: { select: { name: true } }, contact: { select: { name: true, email: true, phone: true } } } },
} satisfies Prisma.MeetingInclude
type MeetingRow = Prisma.MeetingGetPayload<{ include: typeof meetingInclude }>

export function toMeetingView(m: MeetingRow, now = new Date()): MeetingView {
  const contact = m.contact ?? m.lead?.contact ?? null
  return {
    id: m.id,
    leadId: m.leadId,
    leadName: m.lead?.company?.name ?? contact?.name ?? "Rendez-vous",
    contactName: contact?.name ?? null,
    contactEmail: contact?.email ?? null,
    contactPhone: contact?.phone ?? null,
    hostId: m.hostId,
    hostName: who(m.host),
    startsAt: m.startsAt.toISOString(),
    endsAt: m.endsAt.toISOString(),
    timezone: m.timezone,
    type: m.type,
    status: m.status,
    outcome: m.outcome,
    videoUrl: m.videoUrl,
    notes: m.notes,
    source: m.source,
    needsOutcome: isActive(m.status) && m.endsAt.getTime() < now.getTime(),
  }
}

// ── Hosts, hours and the slot request ───────────────────────────────────────────────────────────────────────────

export const HOST_ROLES = DEAL_OWNER_ROLES

const DEFAULTS = { timezone: "Europe/Paris", durationMin: 30, bufferMin: 10, minNoticeMin: 120, horizonDays: 21 }

async function assertHost(db: Pick<Tx, "user">, workspaceId: string, hostId: string) {
  const host = await db.user.findFirst({ where: { id: hostId, workspaceId, active: true, role: { in: [...HOST_ROLES] } }, select: { id: true, name: true, email: true } })
  if (!host) throw new LeadError("invalid", "Cette personne ne reçoit pas de rendez-vous (closer, manager ou propriétaire).")
  return host
}

interface HostConfig {
  req: Omit<SlotRequest, "from" | "to" | "now">
  profile: { slug: string; enabled: boolean; videoUrl: string | null; intro: string | null } | null
}

/** The hours and rules of a host, and what is already in their calendar. Reads through `db` so it can run inside the booking transaction. */
async function slotRequest(db: Tx | typeof prisma, hostId: string, window: { from: Date; to: Date }, opts: { ignoreMeetingId?: string; durationMin?: number } = {}): Promise<HostConfig> {
  const [profile, rules, exceptions, busy] = await Promise.all([
    db.bookingProfile.findUnique({ where: { hostId } }),
    db.availabilityRule.findMany({ where: { hostId, active: true } }),
    db.availabilityException.findMany({ where: { hostId, date: { gte: new Date(window.from.getTime() - 2 * 86_400_000), lte: new Date(window.to.getTime() + 2 * 86_400_000) } } }),
    db.meeting.findMany({
      where: { hostId, status: { in: ACTIVE }, startsAt: { lt: new Date(window.to.getTime() + 86_400_000) }, endsAt: { gt: new Date(window.from.getTime() - 86_400_000) }, ...(opts.ignoreMeetingId ? { id: { not: opts.ignoreMeetingId } } : {}) },
      select: { startsAt: true, endsAt: true },
    }),
  ])
  const p = profile ?? DEFAULTS
  return {
    req: {
      timezone: p.timezone,
      rules: rules.map((r) => ({ weekday: r.weekday, startMinute: r.startMinute, endMinute: r.endMinute })),
      exceptions: exceptions.map((e) => ({ date: e.date.toISOString().slice(0, 10), available: e.available, startMinute: e.startMinute, endMinute: e.endMinute })),
      busy: busy.map((b) => ({ start: b.startsAt, end: b.endsAt })),
      durationMin: opts.durationMin ?? p.durationMin,
      bufferMin: p.bufferMin,
      minNoticeMin: p.minNoticeMin,
      horizonDays: p.horizonDays,
    },
    profile: profile ? { slug: profile.slug, enabled: profile.enabled, videoUrl: profile.videoUrl, intro: profile.intro } : null,
  }
}

const withRange = (cfg: HostConfig, from: Date, to: Date, now: Date): SlotRequest => ({ ...cfg.req, from, to, now })

/** Cap on the span of a slot query, so a caller cannot ask for years of slots. */
const MAX_RANGE_DAYS = 35
function parseRange(from: string, days: number) {
  const start = new Date(`${from}T00:00:00Z`)
  if (Number.isNaN(start.getTime())) throw new LeadError("invalid", "Date invalide.")
  // One day of margin on each side: the caller reads days in its own timezone.
  return { from: new Date(start.getTime() - 86_400_000), to: new Date(start.getTime() + (Math.min(Math.max(days, 1), MAX_RANGE_DAYS) + 1) * 86_400_000) }
}

export async function listHosts(user: CurrentUser) {
  const own = scopeOf(user.role, "meeting:book") === "own"
  const hosts = await prisma.user.findMany({
    where: { workspaceId: user.workspaceId, active: true, role: { in: [...HOST_ROLES] }, ...(own ? { id: user.id } : {}) },
    select: { id: true, name: true, email: true, role: true, bookingProfile: { select: { slug: true, enabled: true } }, _count: { select: { availabilityRules: { where: { active: true } } } } },
    orderBy: { name: "asc" },
  })
  return hosts.map((h) => ({ id: h.id, name: who(h), role: h.role, hasHours: h._count.availabilityRules > 0, slug: h.bookingProfile?.slug ?? null, bookingOpen: !!h.bookingProfile?.enabled }))
}

/** Open slots of a host for an internal booking. `from` is a calendar day; the answer is UTC instants. */
export async function listSlots(user: CurrentUser, hostId: string, from: string, days: number, opts: { ignoreMeetingId?: string } = {}) {
  if (!canAccessRecord(user, "meeting:book", hostId)) throw new LeadError("forbidden", "Vous ne planifiez que vos propres rendez-vous.", 403)
  await assertHost(prisma, user.workspaceId, hostId)
  const { from: a, to: b } = parseRange(from, days)
  const cfg = await slotRequest(prisma, hostId, { from: a, to: b }, opts)
  const slots = computeSlots(withRange(cfg, a, b, new Date()))
  return { timezone: cfg.req.timezone, durationMin: cfg.req.durationMin, slots: slots.map((s) => s.start.toISOString()) }
}

// ── Writing helpers ─────────────────────────────────────────────────────────────────────────────────────────────

interface Ctx {
  workspaceId: string
  actorId: string | null
}

/** Every write to meetings takes this lock first, so two bookings for the same time cannot both succeed. Held until the transaction ends. */
async function lockMeetings(tx: Tx, workspaceId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"meetings:" + workspaceId}))`
}

async function logMeeting(tx: Tx, ctx: Ctx, leadId: string | null, body: string, data: Prisma.InputJsonValue, dealId?: string | null) {
  if (!leadId) return
  await tx.activity.create({ data: { workspaceId: ctx.workspaceId, leadId, dealId: dealId ?? undefined, actorId: ctx.actorId, actorKind: ctx.actorId ? "USER" : "SYSTEM", kind: "MEETING", body, data } })
}

async function logDealMove(tx: Tx, ctx: Ctx, leadId: string, dealId: string, body: string, data: Prisma.InputJsonValue) {
  await tx.activity.create({ data: { workspaceId: ctx.workspaceId, leadId, dealId, actorId: ctx.actorId, actorKind: ctx.actorId ? "USER" : "SYSTEM", kind: "SYSTEM", body, data } })
}

async function assertNoOverlap(tx: Tx, hostId: string, start: Date, end: Date, ignoreId?: string) {
  const clash = await tx.meeting.findFirst({ where: { hostId, status: { in: ACTIVE }, startsAt: { lt: end }, endsAt: { gt: start }, ...(ignoreId ? { id: { not: ignoreId } } : {}) }, select: { id: true } })
  if (clash) throw new LeadError("conflict", "Ce créneau vient d’être pris. Choisissez-en un autre.", 409, { code: "slot_taken" })
}

/** One active meeting of a type per contact: booking twice is a mistake, moving the first is the way. */
async function assertNoDuplicate(tx: Tx, contactId: string | null, type: MeetingType, ignoreId?: string) {
  if (!contactId) return
  const same = await tx.meeting.findFirst({ where: { contactId, type, status: { in: ACTIVE }, ...(ignoreId ? { id: { not: ignoreId } } : {}) }, select: { startsAt: true } })
  if (same) throw new LeadError("conflict", `Un rendez-vous « ${MEETING_TYPE_LABELS[type].toLowerCase()} » est déjà prévu pour ce contact (${whenLabel(same.startsAt)}). Déplacez-le plutôt que d’en créer un second.`, 409, { code: "duplicate_meeting" })
}

const BLOCKED_LEAD = ["DO_NOT_CONTACT", "DISQUALIFIED"]

/** A meeting puts the opportunity at "RDV planifié", creating it when the fiche had none. */
async function syncDealOnBooked(tx: Tx, ctx: Ctx, lead: { id: string; status: string }, hostId: string): Promise<string | null> {
  if (BLOCKED_LEAD.includes(lead.status)) return null
  await lockLead(tx, lead.id)
  const open = await tx.deal.findFirst({ where: { leadId: lead.id, stage: { in: [...OPEN_STAGES] } }, orderBy: { createdAt: "desc" } })
  if (!open) {
    const deal = await tx.deal.create({ data: { workspaceId: ctx.workspaceId, leadId: lead.id, ownerId: hostId, stage: "MEETING_SET" } })
    await logDealMove(tx, ctx, lead.id, deal.id, "Opportunité créée : RDV planifié", { to: "MEETING_SET", meeting: true })
    if (["NEW", "CONTACTED", "REPLIED"].includes(lead.status)) await tx.lead.update({ where: { id: lead.id }, data: { status: "QUALIFIED" } })
    return deal.id
  }
  if (open.stage === "QUALIFIED") {
    await tx.deal.update({ where: { id: open.id }, data: { stage: "MEETING_SET", ownerId: open.ownerId ?? hostId } })
    await logDealMove(tx, ctx, lead.id, open.id, "Opportunité : QUALIFIED → MEETING_SET (rendez-vous pris)", { from: "QUALIFIED", to: "MEETING_SET", meeting: true })
  }
  return open.id
}

/** When nothing is planned any more, the opportunity goes back to "Qualifié" rather than pretending a meeting is coming. */
async function syncDealOnFreed(tx: Tx, ctx: Ctx, leadId: string | null, excludeMeetingId: string, now: Date) {
  if (!leadId) return
  await lockLead(tx, leadId)
  const stillPlanned = await tx.meeting.count({ where: { leadId, id: { not: excludeMeetingId }, status: { in: ACTIVE }, startsAt: { gt: now } } })
  if (stillPlanned) return
  const deal = await tx.deal.findFirst({ where: { leadId, stage: "MEETING_SET" } })
  if (!deal) return
  await tx.deal.update({ where: { id: deal.id }, data: { stage: "QUALIFIED" } })
  await logDealMove(tx, ctx, leadId, deal.id, "Opportunité : MEETING_SET → QUALIFIED (plus de rendez-vous prévu)", { from: "MEETING_SET", to: "QUALIFIED", meeting: true })
}

// ── Emails sent once the change is saved ────────────────────────────────────────────────────────────────────────

type After = () => Promise<unknown>
const runAfter = async (jobs: After[]) => {
  for (const job of jobs) {
    try {
      await job()
    } catch (error) {
      console.error("[MEETING_AFTER]", error)
    }
  }
}

interface MailTargets {
  guest?: After
  host?: After
}

function mailJobs(row: MeetingRow, kind: "confirmation" | "canceled" | "rescheduled", guestTimezone?: string): MailTargets {
  const contact = row.contact ?? row.lead?.contact ?? null
  const base = { kind, meeting: { id: row.id, startsAt: row.startsAt, endsAt: row.endsAt, type: row.type, videoUrl: row.videoUrl }, hostName: who(row.host), guestName: contact?.name ?? row.lead?.company?.name ?? "Le contact" }
  return {
    guest: contact?.email ? () => sendMeetingMail({ ...base, to: contact.email!, audience: "guest", manageUrl: manageLink(row.id), timezone: guestTimezone ?? row.timezone }) : undefined,
    host: row.host.email ? () => sendMeetingMail({ ...base, to: row.host.email!, audience: "host", leadUrl: row.leadId ? `${appBaseUrl()}/app/leads/${row.leadId}` : undefined, timezone: row.timezone }) : undefined,
  }
}

const pick = (t: MailTargets, who: { guest: boolean; host: boolean }): After[] => [who.guest ? t.guest : undefined, who.host ? t.host : undefined].filter((j): j is After => !!j)

/** Placing a meeting outside the open hours is for the host and for managers: an SDR books what the closer offered. */
const mayOverrideHours = (user: CurrentUser, hostId: string) => user.role === "OWNER" || user.role === "MANAGER" || user.id === hostId

// ── Internal booking, by a person ───────────────────────────────────────────────────────────────────────────────

export async function bookMeeting(user: CurrentUser, input: BookMeetingInput, ip?: string | null): Promise<MeetingView> {
  if (!canAccessRecord(user, "meeting:book", input.hostId)) throw new LeadError("forbidden", "Vous ne planifiez que vos propres rendez-vous.", 403)
  const lead = await prisma.lead.findFirst({ where: { id: input.leadId, workspaceId: user.workspaceId, ...scopeWhere(user, "lead:read") }, select: { id: true, status: true, contactId: true } })
  if (!lead) throw new LeadError("not_found", "Fiche introuvable.", 404)
  if (lead.status === "DO_NOT_CONTACT") throw new LeadError("invalid", "Ce prospect est marqué « ne pas contacter » : aucun rendez-vous ne peut lui être proposé.")
  const host = await assertHost(prisma, user.workspaceId, input.hostId)
  const allowOverride = !!input.override && mayOverrideHours(user, input.hostId)
  const start = new Date(input.startsAt)
  const now = new Date()
  if (start.getTime() <= now.getTime()) throw new LeadError("invalid", "Choisissez un créneau à venir.")
  const ctx: Ctx = { workspaceId: user.workspaceId, actorId: user.id }
  const after: After[] = []

  const row = await prisma.$transaction(async (tx) => {
    await lockMeetings(tx, user.workspaceId)
    const cfg = await slotRequest(tx, host.id, { from: new Date(start.getTime() - 86_400_000), to: new Date(start.getTime() + 2 * 86_400_000) })
    const end = new Date(start.getTime() + cfg.req.durationMin * 60_000)
    await assertNoOverlap(tx, host.id, start, end)
    if (!allowOverride && !isSlotOpen({ ...cfg.req, from: start, to: end, now }, start)) throw new LeadError("conflict", "Ce créneau n’est pas dans les disponibilités du closer.", 409, { code: "slot_closed" })
    await assertNoDuplicate(tx, lead.contactId, input.type)

    const created = await tx.meeting.create({
      data: { workspaceId: user.workspaceId, hostId: host.id, leadId: lead.id, contactId: lead.contactId, startsAt: start, endsAt: end, timezone: cfg.req.timezone, type: input.type, videoUrl: input.videoUrl || cfg.profile?.videoUrl || null, notes: input.notes || null, source: user.role === "SDR" ? "sdr" : "manual", createdById: user.id },
      include: meetingInclude,
    })
    const dealId = await syncDealOnBooked(tx, ctx, lead, host.id)
    if (dealId) await tx.meeting.update({ where: { id: created.id }, data: { dealId } })
    await logMeeting(tx, ctx, lead.id, `Rendez-vous planifié avec ${who(created.host)} : ${whenLabel(start, cfg.req.timezone)}`, { event: "booked", meetingId: created.id, hostId: host.id, startsAt: start.toISOString() }, dealId)
    after.push(...pick(mailJobs(created, "confirmation"), { guest: input.notifyGuest, host: host.id !== user.id }))
    return created
  })
  await audit({ action: "meeting.booked", actorId: user.id, workspaceId: user.workspaceId, entityType: "Meeting", entityId: row.id, metadata: { hostId: host.id, source: row.source }, ip })
  await runAfter(after)
  return toMeetingView(row)
}

// ── Public booking, by the prospect ─────────────────────────────────────────────────────────────────────────────

async function publicHost(slug: string) {
  const profile = await prisma.bookingProfile.findUnique({ where: { slug: slug.toLowerCase() }, include: { host: { select: { id: true, name: true, email: true, active: true, role: true, workspaceId: true } } } })
  const host = profile?.host
  if (!profile || !host || !profile.enabled || !host.active || !host.workspaceId || !(HOST_ROLES as readonly string[]).includes(host.role)) {
    throw new LeadError("not_found", "Cette page de réservation n’existe pas ou n’est plus ouverte.", 404)
  }
  return { profile, host: { ...host, workspaceId: host.workspaceId } }
}

export async function publicProfile(slug: string) {
  const { profile, host } = await publicHost(slug)
  return { hostName: who(host), intro: profile.intro, durationMin: profile.durationMin, timezone: profile.timezone, horizonDays: profile.horizonDays }
}

const TOO_MANY = "Trop de demandes. Réessayez dans une minute."

export async function publicSlots(slug: string, from: string, days: number, requester: string | null) {
  if (!(await rateLimit("rdv-slots", requester, 60, 60))) throw new LeadError("rate_limited", TOO_MANY, 429)
  const { profile, host } = await publicHost(slug)
  const { from: a, to: b } = parseRange(from, days)
  const cfg = await slotRequest(prisma, host.id, { from: a, to: b })
  return { timezone: profile.timezone, durationMin: profile.durationMin, slots: computeSlots(withRange(cfg, a, b, new Date())).map((s) => s.start.toISOString()) }
}

/** The fiche a prospect belongs to: theirs if their address is known, else a new one (inbound), attached to the company if it already exists. */
async function resolveGuest(tx: Tx, workspaceId: string, hostId: string, input: PublicBookingInput) {
  const email = normalizeEmail(input.email)
  if (!email) throw new LeadError("invalid", "Adresse email invalide.")
  const phone = input.phone?.trim() ? normalizePhone(input.phone) : null
  if (input.phone?.trim() && !phone) throw new LeadError("invalid", "Téléphone invalide : les numéros étrangers commencent par +.")

  const known = await tx.contact.findUnique({ where: { workspaceId_email: { workspaceId, email } } })
  if (known) {
    const lead = (await tx.lead.findFirst({ where: { workspaceId, contactId: known.id } })) ?? (known.companyId ? await tx.lead.findFirst({ where: { workspaceId, companyId: known.companyId } }) : null)
    if (lead) return { lead, contactId: known.id, created: false }
  }
  const c = cleanCompany({ name: input.company?.trim() || input.name, phone })
  const domain = companyDomain(null, email)
  const same = await matchCompany(tx, workspaceId, { domain, nameKey: c.nameKey, phone: c.phone })
  const company = same?.company ?? (await tx.company.create({ data: { workspaceId, name: c.name!, phone: c.phone, domain, nameKey: c.nameKey, country: "FR", source: "INBOUND" } }))
  const contact =
    known ??
    (await tx.contact.create({ data: { workspaceId, companyId: company.id, name: input.name.trim(), email, emailKind: "UNKNOWN", phone, source: "INBOUND", collectedFrom: "Réservation en ligne", collectedAt: new Date(), legalBasis: "consent" } }))
  const existing = await tx.lead.findFirst({ where: { workspaceId, companyId: company.id } })
  if (existing) {
    if (!existing.contactId) await tx.lead.update({ where: { id: existing.id }, data: { contactId: contact.id } })
    return { lead: existing, contactId: contact.id, created: false }
  }
  const lead = await tx.lead.create({ data: { workspaceId, companyId: company.id, contactId: contact.id, ownerId: hostId, source: "INBOUND", status: "NEW", tags: ["rdv-en-ligne"] } })
  return { lead, contactId: contact.id, created: true }
}

export interface PublicBookingResult {
  startsAt: string
  endsAt: string
  hostName: string
  manageUrl: string
  emailSent: boolean
}

/**
 * A prospect books a slot. No account is created: a contact and a fiche are (or are found), the meeting is stored first,
 * and the email comes after, so a mail failure never loses a booking.
 */
export async function bookPublic(slug: string, input: PublicBookingInput, requester: string | null, guestTimezone?: string): Promise<PublicBookingResult> {
  // A robot filled the invisible field: answer as if it worked, store nothing.
  if (input.website?.trim()) return { startsAt: input.startsAt, endsAt: input.startsAt, hostName: "", manageUrl: "", emailSent: false }
  if (!(await rateLimit("rdv-book", requester, 5, 3600))) throw new LeadError("rate_limited", "Trop de réservations depuis cette connexion. Réessayez plus tard ou écrivez-nous.", 429)
  const { host } = await publicHost(slug)
  const start = new Date(input.startsAt)
  const now = new Date()
  const ctx: Ctx = { workspaceId: host.workspaceId, actorId: null }

  const row = await prisma.$transaction(async (tx) => {
    await lockMeetings(tx, ctx.workspaceId)
    const cfg = await slotRequest(tx, host.id, { from: new Date(start.getTime() - 86_400_000), to: new Date(start.getTime() + 2 * 86_400_000) })
    const end = new Date(start.getTime() + cfg.req.durationMin * 60_000)
    if (!isSlotOpen({ ...cfg.req, from: start, to: end, now }, start)) throw new LeadError("conflict", "Ce créneau n’est plus disponible. Choisissez-en un autre.", 409, { code: "slot_taken" })
    const guest = await resolveGuest(tx, ctx.workspaceId, host.id, input)
    await assertNoDuplicate(tx, guest.contactId, "DISCOVERY").catch(() => {
      throw new LeadError("conflict", "Un rendez-vous est déjà prévu avec cette adresse email. Utilisez le lien de l’email de confirmation pour le modifier.", 409, { code: "duplicate_meeting" })
    })
    const created = await tx.meeting.create({
      data: { workspaceId: ctx.workspaceId, hostId: host.id, leadId: guest.lead.id, contactId: guest.contactId, startsAt: start, endsAt: end, timezone: cfg.req.timezone, type: "DISCOVERY", videoUrl: cfg.profile?.videoUrl ?? null, notes: input.message?.trim() || null, source: "booking" },
      include: meetingInclude,
    })
    const dealId = await syncDealOnBooked(tx, ctx, guest.lead, host.id)
    if (dealId) await tx.meeting.update({ where: { id: created.id }, data: { dealId } })
    await logMeeting(tx, ctx, guest.lead.id, `Rendez-vous réservé en ligne avec ${who(created.host)} : ${whenLabel(start, cfg.req.timezone)}${guest.created ? " (nouvelle fiche)" : ""}`, { event: "booked", via: "public", meetingId: created.id, startsAt: start.toISOString() }, dealId)
    if (input.message?.trim()) await tx.activity.create({ data: { workspaceId: ctx.workspaceId, leadId: guest.lead.id, actorKind: "SYSTEM", kind: "NOTE", body: `Message laissé à la réservation : ${input.message.trim()}` } })
    return created
  })
  await audit({ action: "meeting.booked_public", workspaceId: ctx.workspaceId, entityType: "Meeting", entityId: row.id, actorKind: "SYSTEM", metadata: { hostId: host.id } })

  const mails = mailJobs(row, "confirmation", guestTimezone && isValidTimezone(guestTimezone) ? guestTimezone : undefined)
  let emailSent = false
  try {
    emailSent = !!(await mails.guest?.())
  } catch (error) {
    console.error("[MEETING_AFTER]", error)
  }
  await runAfter(pick(mails, { guest: false, host: true }))
  return { startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), hostName: who(row.host), manageUrl: manageLink(row.id), emailSent }
}

// ── Changing a meeting ──────────────────────────────────────────────────────────────────────────────────────────

async function loadForUser(user: CurrentUser, id: string, permission: "meeting:book" | "meeting:outcome" | "meeting:read") {
  const m = await prisma.meeting.findFirst({ where: { id, workspaceId: user.workspaceId }, select: { id: true, hostId: true } })
  if (!m) throw new LeadError("not_found", "Rendez-vous introuvable.", 404)
  if (!canAccessRecord(user, permission, m.hostId)) throw new LeadError("forbidden", permission === "meeting:outcome" ? "Seul le closer du rendez-vous, un manager ou le propriétaire en indique le résultat." : "Ce rendez-vous ne vous est pas attribué.", 403)
  return m
}

export async function getMeeting(user: CurrentUser, id: string): Promise<MeetingView> {
  await loadForUser(user, id, "meeting:read")
  return toMeetingView(await prisma.meeting.findUniqueOrThrow({ where: { id }, include: meetingInclude }))
}

export async function listMeetings(user: CurrentUser, opts: { from: string; to: string; hostId?: string }): Promise<MeetingView[]> {
  const own = scopeOf(user.role, "meeting:read") === "own"
  const rows = await prisma.meeting.findMany({
    where: { workspaceId: user.workspaceId, startsAt: { gte: new Date(opts.from), lt: new Date(opts.to) }, ...(own ? { hostId: user.id } : opts.hostId ? { hostId: opts.hostId } : {}) },
    include: meetingInclude,
    orderBy: { startsAt: "asc" },
    take: 500,
  })
  const now = new Date()
  return rows.map((m) => toMeetingView(m, now))
}

/** Meetings that are over and still open: the result is owed. Scoped like the agenda. */
export async function listToClose(user: CurrentUser, limit = 50): Promise<MeetingView[]> {
  const own = scopeOf(user.role, "meeting:read") === "own"
  const rows = await prisma.meeting.findMany({
    where: { workspaceId: user.workspaceId, status: { in: ACTIVE }, endsAt: { lt: new Date() }, ...(own ? { hostId: user.id } : {}) },
    include: meetingInclude,
    orderBy: { startsAt: "asc" },
    take: limit,
  })
  const now = new Date()
  return rows.map((m) => toMeetingView(m, now))
}

const conflict = (reason: string) => new LeadError("conflict", reason, 409)

/** Replaces a meeting by one at another time, keeping the old row as « Reporté » so the history and the report rate stay true. */
async function moveInTx(tx: Tx, ctx: Ctx, old: MeetingRow & { dealId: string | null; workspaceId: string; contactId: string | null; createdById: string | null; source: string; hostId: string }, start: Date, opts: { override: boolean; now: Date }) {
  const length = old.endsAt.getTime() - old.startsAt.getTime()
  if (start.getTime() <= opts.now.getTime()) throw new LeadError("invalid", "Choisissez un créneau à venir.")
  const cfg = await slotRequest(tx, old.hostId, { from: new Date(start.getTime() - 86_400_000), to: new Date(start.getTime() + 2 * 86_400_000) }, { ignoreMeetingId: old.id, durationMin: Math.round(length / 60_000) })
  const end = new Date(start.getTime() + length)
  await assertNoOverlap(tx, old.hostId, start, end, old.id)
  if (!opts.override && !isSlotOpen({ ...cfg.req, from: start, to: end, now: opts.now }, start)) throw new LeadError("conflict", "Ce créneau n’est pas disponible. Choisissez-en un autre.", 409, { code: "slot_closed" })
  const created = await tx.meeting.create({
    data: { workspaceId: old.workspaceId, hostId: old.hostId, leadId: old.leadId, contactId: old.contactId, dealId: old.dealId, startsAt: start, endsAt: end, timezone: old.timezone, type: old.type, videoUrl: old.videoUrl, notes: old.notes, source: old.source, createdById: old.createdById },
    include: meetingInclude,
  })
  await tx.meeting.update({ where: { id: old.id }, data: { status: "RESCHEDULED", rescheduledToId: created.id } })
  await logMeeting(tx, ctx, old.leadId, `Rendez-vous déplacé : ${whenLabel(old.startsAt, old.timezone)} → ${whenLabel(start, old.timezone)}`, { event: "rescheduled", from: old.id, to: created.id }, old.dealId)
  return created
}

export async function actOnMeeting(user: CurrentUser, id: string, input: MeetingActionInput, ip?: string | null): Promise<MeetingView> {
  await loadForUser(user, id, input.action === "complete" || input.action === "no_show" ? "meeting:outcome" : "meeting:book")
  const ctx: Ctx = { workspaceId: user.workspaceId, actorId: user.id }
  const now = new Date()
  const after: After[] = []

  const row = await prisma.$transaction(async (tx) => {
    await lockMeetings(tx, user.workspaceId)
    const m = await tx.meeting.findUniqueOrThrow({ where: { id }, include: meetingInclude })
    const problem = checkMeetingAction(m, input.action, now)
    if (problem) throw conflict(problem)
    const toHost = m.hostId !== user.id

    switch (input.action) {
      case "confirm": {
        const next = await tx.meeting.update({ where: { id }, data: { status: "CONFIRMED" }, include: meetingInclude })
        await logMeeting(tx, ctx, m.leadId, "Rendez-vous confirmé", { event: "confirmed", meetingId: id }, m.dealId)
        return next
      }
      case "cancel": {
        const next = await tx.meeting.update({ where: { id }, data: { status: "CANCELED", canceledAt: now, cancelReason: input.reason || null }, include: meetingInclude })
        await logMeeting(tx, ctx, m.leadId, `Rendez-vous annulé${input.reason ? ` : ${input.reason}` : ""}`, { event: "canceled", meetingId: id, reason: input.reason ?? null }, m.dealId)
        await syncDealOnFreed(tx, ctx, m.leadId, id, now)
        after.push(...pick(mailJobs(next, "canceled"), { guest: true, host: toHost }))
        return next
      }
      case "reschedule": {
        const override = !!input.override && mayOverrideHours(user, m.hostId)
        const created = await moveInTx(tx, ctx, m, new Date(input.startsAt), { override, now })
        after.push(...pick(mailJobs(created, "rescheduled"), { guest: true, host: toHost }))
        return created
      }
      case "no_show": {
        const next = await tx.meeting.update({ where: { id }, data: { status: "NO_SHOW" }, include: meetingInclude })
        await logMeeting(tx, ctx, m.leadId, "Le contact ne s’est pas présenté", { event: "no_show", meetingId: id }, m.dealId)
        if (m.leadId) await insertTask(tx, user, { leadId: m.leadId, title: "Relancer : absent au rendez-vous", dueDay: addDays(dayKey(now), 1), assigneeId: m.hostId })
        await syncDealOnFreed(tx, ctx, m.leadId, id, now)
        return next
      }
      case "complete": {
        if (input.outcome === "LOST" && !input.lostReason) throw new LeadError("invalid", "Indiquez pourquoi l’opportunité est perdue.")
        const label = { QUALIFIED: "qualifié, on avance", FOLLOW_UP: "à relancer", LOST: "perdu" }[input.outcome]
        const next = await tx.meeting.update({ where: { id }, data: { status: "COMPLETED", outcome: input.outcome, ...(input.notes ? { notes: [m.notes, input.notes].filter(Boolean).join("\n\n") } : {}) }, include: meetingInclude })
        await logMeeting(tx, ctx, m.leadId, `Rendez-vous terminé : ${label}${input.notes ? ` — ${input.notes}` : ""}`, { event: "completed", meetingId: id, outcome: input.outcome }, m.dealId)
        if (m.leadId) await applyOutcome(tx, ctx, user, m.leadId, m.hostId, input, now, id)
        return next
      }
    }
  })
  await audit({ action: `meeting.${input.action}`, actorId: user.id, workspaceId: user.workspaceId, entityType: "Meeting", entityId: row.id, ip })
  await runAfter(after)
  return toMeetingView(row)
}

/** What a result does to the opportunity and the follow-up, so the funnel stays true without a second manual step. */
async function applyOutcome(tx: Tx, ctx: Ctx, user: CurrentUser, leadId: string, hostId: string, input: Extract<MeetingActionInput, { action: "complete" }>, now: Date, meetingId: string) {
  await lockLead(tx, leadId)
  const deal = await tx.deal.findFirst({ where: { leadId, stage: { in: [...OPEN_STAGES] } }, orderBy: { createdAt: "desc" } })
  if (input.outcome === "QUALIFIED") {
    if (deal && (deal.stage === "QUALIFIED" || deal.stage === "MEETING_SET")) {
      await tx.deal.update({ where: { id: deal.id }, data: { stage: "PROPOSAL" } })
      await logDealMove(tx, ctx, leadId, deal.id, `Opportunité : ${deal.stage} → PROPOSAL (rendez-vous concluant)`, { from: deal.stage, to: "PROPOSAL", meeting: true })
    }
    await tx.lead.updateMany({ where: { id: leadId, status: { in: ["NEW", "CONTACTED", "REPLIED"] } }, data: { status: "QUALIFIED" } })
  } else if (input.outcome === "LOST") {
    const reason = input.lostReason === "Autre" && input.lostDetail ? `Autre : ${input.lostDetail}` : input.lostReason!
    if (deal) {
      await tx.deal.update({ where: { id: deal.id }, data: { stage: "LOST", lostReason: reason, lostAt: now } })
      await logDealMove(tx, ctx, leadId, deal.id, `Opportunité perdue : ${reason}`, { from: deal.stage, to: "LOST", meeting: true })
    }
  } else {
    await insertTask(tx, user, { leadId, title: "Relancer après le rendez-vous", dueDay: input.followUpDay ?? addDays(dayKey(now), 3), assigneeId: hostId })
    await syncDealOnFreed(tx, ctx, leadId, meetingId, now)
  }
}

// ── The prospect's own link ─────────────────────────────────────────────────────────────────────────────────────

export interface GuestMeetingView {
  token: string
  hostName: string
  startsAt: string
  endsAt: string
  timezone: string
  durationMin: number
  status: MeetingStatus
  videoUrl: string | null
  /** Why the meeting cannot be changed online (null = it can). */
  locked: string | null
}

async function resolveByToken(token: string) {
  const id = verifyMeetingToken(token)
  if (!id) throw new LeadError("not_found", "Ce lien n’est pas valide.", 404)
  let m = await prisma.meeting.findUnique({ where: { id }, include: meetingInclude })
  // A moved meeting points to its replacement: the old link keeps working for the person.
  for (let hops = 0; m?.rescheduledToId && hops < 10; hops++) m = await prisma.meeting.findUnique({ where: { id: m.rescheduledToId }, include: meetingInclude })
  if (!m) throw new LeadError("not_found", "Ce lien n’est pas valide.", 404)
  return m
}

function guestView(m: MeetingRow): GuestMeetingView {
  return {
    token: signMeetingToken(m.id),
    hostName: who(m.host),
    startsAt: m.startsAt.toISOString(),
    endsAt: m.endsAt.toISOString(),
    timezone: m.timezone,
    durationMin: Math.round((m.endsAt.getTime() - m.startsAt.getTime()) / 60_000),
    status: m.status,
    videoUrl: m.videoUrl,
    locked: guestMayChange(m, new Date()),
  }
}

export async function guestMeeting(token: string): Promise<GuestMeetingView> {
  return guestView(await resolveByToken(token))
}

export async function guestSlots(token: string, from: string, days: number, requester: string | null) {
  if (!(await rateLimit("rdv-slots", requester, 60, 60))) throw new LeadError("rate_limited", TOO_MANY, 429)
  const m = await resolveByToken(token)
  const { from: a, to: b } = parseRange(from, days)
  const cfg = await slotRequest(prisma, m.hostId, { from: a, to: b }, { ignoreMeetingId: m.id, durationMin: Math.round((m.endsAt.getTime() - m.startsAt.getTime()) / 60_000) })
  return { timezone: cfg.req.timezone, durationMin: cfg.req.durationMin, slots: computeSlots(withRange(cfg, a, b, new Date())).map((s) => s.start.toISOString()) }
}

export async function guestAct(token: string, input: { action: "cancel"; reason?: string } | { action: "reschedule"; startsAt: string }, requester: string | null): Promise<GuestMeetingView> {
  if (!(await rateLimit("rdv-manage", requester, 20, 3600))) throw new LeadError("rate_limited", "Trop de demandes. Réessayez plus tard.", 429)
  const found = await resolveByToken(token)
  const now = new Date()
  const ctx: Ctx = { workspaceId: found.workspaceId, actorId: null }
  const after: After[] = []
  const result = await prisma.$transaction(async (tx) => {
    await lockMeetings(tx, ctx.workspaceId)
    const m = await tx.meeting.findUniqueOrThrow({ where: { id: found.id }, include: meetingInclude })
    const locked = guestMayChange(m, now)
    if (locked) throw conflict(locked)
    if (input.action === "cancel") {
      const next = await tx.meeting.update({ where: { id: m.id }, data: { status: "CANCELED", canceledAt: now, cancelReason: input.reason || "Annulé par le contact" }, include: meetingInclude })
      await logMeeting(tx, ctx, m.leadId, `Rendez-vous annulé par le contact${input.reason ? ` : ${input.reason}` : ""}`, { event: "canceled", by: "guest", meetingId: m.id }, m.dealId)
      await syncDealOnFreed(tx, ctx, m.leadId, m.id, now)
      after.push(...pick(mailJobs(next, "canceled"), { guest: true, host: true }))
      return next
    }
    const created = await moveInTx(tx, ctx, m, new Date(input.startsAt), { override: false, now })
    after.push(...pick(mailJobs(created, "rescheduled"), { guest: true, host: true }))
    return created
  })
  await audit({ action: `meeting.guest_${input.action}`, workspaceId: ctx.workspaceId, entityType: "Meeting", entityId: result.id, actorKind: "SYSTEM" })
  await runAfter(after)
  return guestView(result)
}

// ── Availability and public page settings ───────────────────────────────────────────────────────────────────────

export const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)

function resolveHostId(user: CurrentUser, hostId?: string | null) {
  const target = hostId || user.id
  if (!canAccessRecord(user, "availability:manage", target)) throw new LeadError("forbidden", "Vous ne réglez que vos propres disponibilités.", 403)
  return target
}

export async function getAvailability(user: CurrentUser, hostId?: string | null) {
  const target = resolveHostId(user, hostId)
  const host = await assertHost(prisma, user.workspaceId, target)
  const [profile, rules, exceptions] = await Promise.all([
    prisma.bookingProfile.findUnique({ where: { hostId: target } }),
    prisma.availabilityRule.findMany({ where: { hostId: target, active: true }, orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] }),
    prisma.availabilityException.findMany({ where: { hostId: target, date: { gte: new Date(Date.now() - 86_400_000) } }, orderBy: { date: "asc" } }),
  ])
  return {
    hostId: target,
    hostName: who(host),
    windows: rules.map((r) => ({ weekday: r.weekday, startMinute: r.startMinute, endMinute: r.endMinute })),
    exceptions: exceptions.map((e) => ({ date: e.date.toISOString().slice(0, 10), available: e.available, startMinute: e.startMinute, endMinute: e.endMinute, reason: e.reason ?? "" })),
    profile: profile
      ? { slug: profile.slug, enabled: profile.enabled, timezone: profile.timezone, durationMin: profile.durationMin, bufferMin: profile.bufferMin, minNoticeMin: profile.minNoticeMin, horizonDays: profile.horizonDays, videoUrl: profile.videoUrl ?? "", intro: profile.intro ?? "" }
      : { slug: slugify(who(host)), enabled: false, ...DEFAULTS, videoUrl: "", intro: "" },
    saved: !!profile,
    publicUrl: profile ? bookingLink(profile.slug) : null,
  }
}

export async function saveAvailability(user: CurrentUser, input: AvailabilityInput, ip?: string | null) {
  const target = resolveHostId(user, input.hostId)
  await assertHost(prisma, user.workspaceId, target)
  const problem = validateWindows(input.windows)
  if (problem) throw new LeadError("invalid", problem)
  for (const e of input.exceptions) {
    const p = validateException(e)
    if (p) throw new LeadError("invalid", p)
  }
  const p = input.profile
  if (!isValidTimezone(p.timezone)) throw new LeadError("invalid", "Fuseau horaire inconnu.")
  if (p.enabled && input.windows.length === 0) throw new LeadError("invalid", "Ajoutez au moins une plage horaire avant d’ouvrir la page de réservation.")
  try {
    await prisma.$transaction(async (tx) => {
      await tx.availabilityRule.deleteMany({ where: { hostId: target } })
      if (input.windows.length) await tx.availabilityRule.createMany({ data: input.windows.map((w) => ({ workspaceId: user.workspaceId, hostId: target, timezone: p.timezone, ...w })) })
      await tx.availabilityException.deleteMany({ where: { hostId: target, date: { gte: new Date(Date.now() - 86_400_000) } } })
      if (input.exceptions.length) {
        await tx.availabilityException.createMany({
          data: input.exceptions.map((e) => ({ workspaceId: user.workspaceId, hostId: target, date: new Date(`${e.date}T00:00:00Z`), available: e.available, startMinute: e.available ? e.startMinute ?? null : null, endMinute: e.available ? e.endMinute ?? null : null, reason: e.reason || null })),
          skipDuplicates: true,
        })
      }
      const data = { slug: p.slug, enabled: p.enabled, timezone: p.timezone, durationMin: p.durationMin, bufferMin: p.bufferMin, minNoticeMin: p.minNoticeMin, horizonDays: p.horizonDays, videoUrl: p.videoUrl || null, intro: p.intro || null }
      await tx.bookingProfile.upsert({ where: { hostId: target }, create: { workspaceId: user.workspaceId, hostId: target, ...data }, update: data })
    })
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new LeadError("conflict", "Ce lien est déjà pris par quelqu’un d’autre : choisissez-en un autre.", 409)
    throw error
  }
  await audit({ action: "availability.updated", actorId: user.id, workspaceId: user.workspaceId, entityType: "User", entityId: target, metadata: { windows: input.windows.length, enabled: p.enabled }, ip })
  return getAvailability(user, target)
}

// ── Reminders ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Meetings starting within this window get their reminder; the job runs often and each meeting is reminded once. */
const REMINDER_WINDOW_H = 24
/** A meeting booked less than this long before it starts already got its confirmation: no reminder on top. */
const MIN_LEAD_FOR_REMINDER_H = 3

export async function sendMeetingReminders(now = new Date()): Promise<{ guests: number; hosts: number }> {
  const rows = await prisma.meeting.findMany({
    where: { status: { in: ACTIVE }, startsAt: { gt: now, lte: new Date(now.getTime() + REMINDER_WINDOW_H * 3600_000) }, OR: [{ reminderSentAt: null }, { hostReminderSentAt: null }] },
    include: meetingInclude,
    take: 200,
  })
  let guests = 0
  let hosts = 0
  for (const m of rows) {
    if (m.startsAt.getTime() - m.createdAt.getTime() < MIN_LEAD_FOR_REMINDER_H * 3600_000) {
      await prisma.meeting.update({ where: { id: m.id }, data: { reminderSentAt: m.reminderSentAt ?? now, hostReminderSentAt: m.hostReminderSentAt ?? now } })
      continue
    }
    const contact = m.contact ?? m.lead?.contact ?? null
    const base = { kind: "reminder" as const, meeting: { id: m.id, startsAt: m.startsAt, endsAt: m.endsAt, type: m.type, videoUrl: m.videoUrl }, hostName: who(m.host), guestName: contact?.name ?? m.lead?.company?.name ?? "Le contact", timezone: m.timezone }
    // Claim first (only one run wins), send after; a failed send gives the claim back so the next run retries.
    if (!m.reminderSentAt) {
      if (!contact?.email) await prisma.meeting.update({ where: { id: m.id }, data: { reminderSentAt: now } })
      else if ((await prisma.meeting.updateMany({ where: { id: m.id, reminderSentAt: null }, data: { reminderSentAt: now } })).count) {
        if (await sendMeetingMail({ ...base, to: contact.email, audience: "guest", manageUrl: manageLink(m.id) })) guests++
        else await prisma.meeting.update({ where: { id: m.id }, data: { reminderSentAt: null } })
      }
    }
    if (!m.hostReminderSentAt) {
      if (!m.host.email) await prisma.meeting.update({ where: { id: m.id }, data: { hostReminderSentAt: now } })
      else if ((await prisma.meeting.updateMany({ where: { id: m.id, hostReminderSentAt: null }, data: { hostReminderSentAt: now } })).count) {
        if (await sendMeetingMail({ ...base, to: m.host.email, audience: "host", leadUrl: m.leadId ? `${appBaseUrl()}/app/leads/${m.leadId}` : undefined })) hosts++
        else await prisma.meeting.update({ where: { id: m.id }, data: { hostReminderSentAt: null } })
      }
    }
  }
  return { guests, hosts }
}
