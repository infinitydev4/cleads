import { Prisma, type EnrollmentStatus, type EnrollmentStopReason, type SequenceStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { LeadError } from "@/features/leads/errors"
import { isSuppressed, scopeWhere } from "@/features/leads/service"
import { mayUseAnyMailbox } from "./mailboxes"
import { BLOCKER_LABELS, leadBlockers, mayEmailLead, recipientOf } from "./rules"
import { scheduleAt } from "./sequence-rules"
import { stopEnrollments } from "./stops"
import { renderTemplate, templateErrors, templateValues } from "./template"
import type { EnrollInput, SequenceInput } from "./schemas"

const duplicate = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"

// ── Rendering a step for a fiche ────────────────────────────────────────────────────────────────────────────────

export interface StepText {
  delayDays: number
  subject: string
  body: string
}

interface FicheValues {
  contact: { name: string | null } | null
  company: { name: string | null; city: string | null; sector: string | null; website: string | null } | null
}

const rePrefix = (subject: string) => (/^(re|ré)\s*:/i.test(subject) ? subject : `Re: ${subject}`)

/**
 * The text of step `position` for one fiche and mailbox. Steps 2+ without a subject continue the first message's
 * thread. `missing` lists variables the fiche cannot fill: such a step must not be sent.
 */
export function renderStep(steps: StepText[], position: number, fiche: FicheValues, senderName: string, firstSubject?: string): { subject: string; body: string; missing: string[] } {
  const values = templateValues({ contactName: fiche.contact?.name, companyName: fiche.company?.name, city: fiche.company?.city, sector: fiche.company?.sector, website: fiche.company?.website, senderName })
  const step = steps[position - 1]
  const body = renderTemplate(step.body, values)
  if (position === 1) {
    const subject = renderTemplate(step.subject, values)
    return { subject: subject.text, body: body.text, missing: [...new Set([...subject.missing, ...body.missing])] }
  }
  const own = step.subject.trim() ? renderTemplate(step.subject, values) : null
  const first = firstSubject ?? renderTemplate(steps[0].subject, values).text
  return { subject: own ? own.text : rePrefix(first), body: body.text, missing: [...new Set([...(own?.missing ?? []), ...body.missing])] }
}

// ── Sequences ───────────────────────────────────────────────────────────────────────────────────────────────────

export interface SequenceStats {
  active: number
  completed: number
  replied: number
  stopped: number
  /** Messages sent by this sequence. */
  sent: number
}

export interface SequenceView {
  id: string
  name: string
  status: SequenceStatus
  steps: StepText[]
  stats: SequenceStats
  updatedAt: string
}

function checkSteps(input: SequenceInput) {
  for (const st of input.steps) {
    const errors = [...templateErrors(st.subject), ...templateErrors(st.body)]
    if (errors.length) throw new LeadError("invalid", errors[0])
  }
}

export async function listSequences(user: CurrentUser): Promise<SequenceView[]> {
  const rows = await prisma.sequence.findMany({ where: { workspaceId: user.workspaceId, archivedAt: null }, include: { steps: { orderBy: { position: "asc" } } }, orderBy: { name: "asc" } })
  if (!rows.length) return []
  const ids = rows.map((r) => r.id)
  const [grouped, sent] = await Promise.all([
    prisma.sequenceEnrollment.groupBy({ by: ["sequenceId", "status", "stoppedReason"], where: { sequenceId: { in: ids } }, _count: true }),
    prisma.emailMessage.groupBy({ by: ["enrollmentId"], where: { enrollment: { sequenceId: { in: ids } }, direction: "OUTBOUND", status: { in: ["SENT", "BOUNCED"] } }, _count: true }),
  ])
  const owner = new Map((await prisma.sequenceEnrollment.findMany({ where: { sequenceId: { in: ids }, id: { in: sent.map((s) => s.enrollmentId!).filter(Boolean) } }, select: { id: true, sequenceId: true } })).map((e) => [e.id, e.sequenceId]))
  return rows.map((r) => {
    const stats: SequenceStats = { active: 0, completed: 0, replied: 0, stopped: 0, sent: 0 }
    for (const g of grouped.filter((x) => x.sequenceId === r.id)) {
      if (g.status === "ACTIVE") stats.active += g._count
      else if (g.status === "COMPLETED") stats.completed += g._count
      else if (g.stoppedReason === "REPLIED") stats.replied += g._count
      else stats.stopped += g._count
    }
    for (const s of sent) if (s.enrollmentId && owner.get(s.enrollmentId) === r.id) stats.sent += s._count
    return { id: r.id, name: r.name, status: r.status, steps: r.steps.map((st) => ({ delayDays: st.delayDays, subject: st.subject, body: st.body })), stats, updatedAt: r.updatedAt.toISOString() }
  })
}

export async function createSequence(user: CurrentUser, input: SequenceInput): Promise<{ id: string }> {
  checkSteps(input)
  try {
    const s = await prisma.sequence.create({
      data: { workspaceId: user.workspaceId, name: input.name, createdById: user.id, steps: { create: input.steps.map((st, i) => ({ position: i + 1, delayDays: i === 0 ? 0 : st.delayDays, subject: st.subject, body: st.body })) } },
    })
    await audit({ action: "sequence.created", actorId: user.id, workspaceId: user.workspaceId, entityType: "Sequence", entityId: s.id, metadata: { name: input.name, steps: input.steps.length } })
    return { id: s.id }
  } catch (error) {
    if (duplicate(error)) throw new LeadError("duplicate", "Une séquence porte déjà ce nom.", 409)
    throw error
  }
}

async function findSequence(user: CurrentUser, id: string) {
  const s = await prisma.sequence.findFirst({ where: { id, workspaceId: user.workspaceId, archivedAt: null } })
  if (!s) throw new LeadError("not_found", "Séquence introuvable.", 404)
  return s
}

/** Messages already sent keep their own text; fiches in the middle of the sequence follow the new steps from their next one. */
export async function updateSequence(user: CurrentUser, id: string, input: SequenceInput): Promise<void> {
  checkSteps(input)
  await findSequence(user, id)
  try {
    await prisma.$transaction(async (tx) => {
      await tx.sequence.update({ where: { id }, data: { name: input.name } })
      await tx.sequenceStep.deleteMany({ where: { sequenceId: id } })
      await tx.sequenceStep.createMany({ data: input.steps.map((st, i) => ({ sequenceId: id, position: i + 1, delayDays: i === 0 ? 0 : st.delayDays, subject: st.subject, body: st.body })) })
    })
  } catch (error) {
    if (duplicate(error)) throw new LeadError("duplicate", "Une séquence porte déjà ce nom.", 409)
    throw error
  }
  await audit({ action: "sequence.updated", actorId: user.id, workspaceId: user.workspaceId, entityType: "Sequence", entityId: id, metadata: { name: input.name, steps: input.steps.length } })
}

export async function setSequenceStatus(user: CurrentUser, id: string, status: SequenceStatus): Promise<void> {
  await findSequence(user, id)
  await prisma.sequence.update({ where: { id }, data: { status } })
  await audit({ action: status === "PAUSED" ? "sequence.paused" : "sequence.resumed", actorId: user.id, workspaceId: user.workspaceId, entityType: "Sequence", entityId: id })
}

/** Stops everything it was doing and frees the name; the history stays. */
export async function archiveSequence(user: CurrentUser, id: string): Promise<{ stopped: number }> {
  const s = await findSequence(user, id)
  const stopped = await prisma.$transaction(async (tx) => {
    const n = await stopEnrollments(tx, { sequenceId: id }, "MANUAL", user.id)
    await tx.sequence.update({ where: { id }, data: { archivedAt: new Date(), name: `${s.name} (archivée ${s.id.slice(-6)})` } })
    return n
  })
  await audit({ action: "sequence.archived", actorId: user.id, workspaceId: user.workspaceId, entityType: "Sequence", entityId: id, metadata: { name: s.name, stopped } })
  return { stopped }
}

// ── Enrollments ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface EnrollmentView {
  id: string
  leadId: string
  leadName: string | null
  email: string | null
  mailbox: string
  status: EnrollmentStatus
  stoppedReason: EnrollmentStopReason | null
  currentStep: number
  totalSteps: number
  nextAt: string | null
  lastSentAt: string | null
  enrolledByName: string | null
}

const visible = (user: CurrentUser): Prisma.SequenceEnrollmentWhereInput => ({ workspaceId: user.workspaceId, ...(mayUseAnyMailbox(user) ? {} : { enrolledById: user.id }) })

const enrollmentInclude = {
  lead: { select: { company: { select: { name: true } }, contact: { select: { name: true, email: true } } } },
  mailbox: { select: { address: true } },
  enrolledBy: { select: { name: true, email: true } },
  sequence: { select: { _count: { select: { steps: true } } } },
} satisfies Prisma.SequenceEnrollmentInclude

type EnrollmentRow = Prisma.SequenceEnrollmentGetPayload<{ include: typeof enrollmentInclude }>

const toEnrollmentView = (e: EnrollmentRow): EnrollmentView => ({
  id: e.id,
  leadId: e.leadId,
  leadName: e.lead.company?.name ?? e.lead.contact?.name ?? null,
  email: e.lead.contact?.email ?? null,
  mailbox: e.mailbox.address,
  status: e.status,
  stoppedReason: e.stoppedReason,
  currentStep: e.currentStep,
  totalSteps: e.sequence._count.steps,
  nextAt: e.nextAt?.toISOString() ?? null,
  lastSentAt: e.lastSentAt?.toISOString() ?? null,
  enrolledByName: e.enrolledBy?.name ?? e.enrolledBy?.email ?? null,
})

export async function listEnrollments(user: CurrentUser, opts: { sequenceId?: string; leadId?: string; take?: number } = {}): Promise<EnrollmentView[]> {
  const rows = await prisma.sequenceEnrollment.findMany({
    where: { ...visible(user), ...(opts.sequenceId ? { sequenceId: opts.sequenceId } : {}), ...(opts.leadId ? { leadId: opts.leadId } : {}) },
    include: enrollmentInclude,
    orderBy: [{ status: "asc" }, { nextAt: "asc" }, { createdAt: "desc" }],
    take: Math.min(opts.take ?? 100, 200),
  })
  return rows.map(toEnrollmentView)
}

export interface EnrollResult {
  enrolled: number
  skipped: { leadId: string; name: string | null; reason: string }[]
}

const fiche = {
  company: { select: { name: true, email: true, city: true, sector: true, website: true } },
  contact: { select: { id: true, name: true, email: true, emailKind: true, doNotContact: true, doNotContactReason: true } },
  deals: { select: { ownerId: true, stage: true } },
} satisfies Prisma.LeadInclude

/**
 * Puts fiches into a sequence. Every fiche is checked on the server with the same rules as a one-to-one email, plus
 * the ones an automatic stream needs: still a prospect (new or contacted), nobody else's stream already running, and
 * every step fillable from the fiche. A refusal skips that fiche and says why; the others still go ahead.
 */
export async function enrollLeads(user: CurrentUser, sequenceId: string, input: EnrollInput, ip?: string | null): Promise<EnrollResult> {
  const seq = await prisma.sequence.findFirst({ where: { id: sequenceId, workspaceId: user.workspaceId, archivedAt: null }, include: { steps: { orderBy: { position: "asc" } } } })
  if (!seq) throw new LeadError("not_found", "Séquence introuvable.", 404)
  if (seq.status !== "ACTIVE") throw new LeadError("conflict", "Cette séquence est en pause : reprenez-la avant d’y inscrire des fiches.", 409)
  const box = await prisma.mailbox.findFirst({ where: { id: input.mailboxId, workspaceId: user.workspaceId } })
  if (!box) throw new LeadError("not_found", "Boîte d’envoi introuvable.", 404)
  if (!mayUseAnyMailbox(user) && box.ownerId !== user.id) throw new LeadError("forbidden", "Cette boîte d’envoi ne vous est pas attribuée.", 403)
  if (box.status !== "ACTIVE") throw new LeadError("conflict", BLOCKER_LABELS.mailbox_inactive, 409, { blocker: "mailbox_inactive" })

  const steps: StepText[] = seq.steps.map((s) => ({ delayDays: s.delayDays, subject: s.subject, body: s.body }))
  const result: EnrollResult = { enrolled: 0, skipped: [] }
  const leads = await prisma.lead.findMany({ where: { id: { in: [...new Set(input.leadIds)] }, workspaceId: user.workspaceId, ...scopeWhere(user, "lead:read") }, include: fiche })
  const found = new Set(leads.map((l) => l.id))
  for (const id of input.leadIds) if (!found.has(id)) result.skipped.push({ leadId: id, name: null, reason: "Fiche introuvable." })

  for (const lead of leads) {
    const name = lead.company?.name ?? lead.contact?.name ?? null
    const skip = (reason: string) => result.skipped.push({ leadId: lead.id, name, reason })
    const recipient = recipientOf(lead)
    const suppressed = recipient ? await isSuppressed(prisma, user.workspaceId, recipient.email) : false
    const [blocker] = leadBlockers({ status: lead.status, recipient, contactDoNotContact: !!lead.contact?.doNotContact, suppressed, mayWrite: mayEmailLead(user, lead) })
    if (blocker) { skip(BLOCKER_LABELS[blocker]); continue }
    if (lead.status !== "NEW" && lead.status !== "CONTACTED") { skip("Seuls les prospects « Nouveau » ou « Contacté » entrent dans une séquence."); continue }
    if (recipient!.kind === "GENERIC" && !input.confirmGeneric) { skip("Adresse générique (contact@, info@…) : confirmez pour l’inclure."); continue }
    const missing = steps.flatMap((_, i) => renderStep(steps, i + 1, lead, box.displayName).missing)
    if (missing.length) { skip(`Information manquante sur la fiche : ${[...new Set(missing)].map((m) => `{{${m}}}`).join(", ")}.`); continue }
    try {
      const e = await prisma.sequenceEnrollment.create({
        data: { workspaceId: user.workspaceId, sequenceId, leadId: lead.id, mailboxId: box.id, enrolledById: user.id, nextAt: scheduleAt(new Date(), 0) },
      })
      await prisma.activity.create({ data: { workspaceId: user.workspaceId, leadId: lead.id, actorId: user.id, actorKind: "USER", kind: "EMAIL", body: `Inscrit dans la séquence « ${seq.name} »`, data: { event: "sequence_enrolled", enrollmentId: e.id, sequenceId } } })
      result.enrolled++
    } catch (error) {
      if (duplicate(error)) skip("Cette fiche est déjà dans une séquence en cours.")
      else throw error
    }
  }
  await audit({ action: "sequence.enrolled", actorId: user.id, workspaceId: user.workspaceId, entityType: "Sequence", entityId: sequenceId, metadata: { enrolled: result.enrolled, skipped: result.skipped.length, mailboxId: box.id }, ip })
  return result
}

/** Stops one enrollment by hand. Whoever may see it may stop it. */
export async function stopEnrollment(user: CurrentUser, id: string): Promise<void> {
  const e = await prisma.sequenceEnrollment.findFirst({ where: { id, ...visible(user) }, select: { id: true, status: true } })
  if (!e) throw new LeadError("not_found", "Inscription introuvable.", 404)
  const n = await stopEnrollments(prisma, { id }, "MANUAL", user.id)
  if (n) await audit({ action: "sequence.enrollment_stopped", actorId: user.id, workspaceId: user.workspaceId, entityType: "SequenceEnrollment", entityId: id })
}
