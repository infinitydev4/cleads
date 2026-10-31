import type { EnrollmentStopReason, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import { LeadError } from "@/features/leads/errors"
import { isSuppressed } from "@/features/leads/service"
import { originText } from "./compose"
import { pauseUnhealthyMailboxes } from "./deliverability"
import { BLOCKER_LABELS, recipientOf } from "./rules"
import { inSendWindow, scheduleAt } from "./sequence-rules"
import { renderStep } from "./sequences"
import { deliver, recordSent, reserve, type Actor } from "./service"
import { stopEnrollments } from "./stops"

/** Another run may pick an enrollment up again after this: it covers a run that died between claiming and sending. */
const LEASE_MS = 10 * 60_000
/** Two sends per mailbox per run (every 5 minutes) keeps a mailbox far from a burst, whatever the day's allowance. */
const PER_MAILBOX_PER_RUN = 2
const MAX_ATTEMPTS = 3
const BATCH = 200

export interface RunSummary {
  /** The window was closed: nothing is due to leave. */
  closed: boolean
  sent: number
  stopped: number
  waiting: number
  failed: number
  completed: number
  autoPaused: number
}

const empty = (): RunSummary => ({ closed: false, sent: 0, stopped: 0, waiting: 0, failed: 0, completed: 0, autoPaused: 0 })

const ficheInclude = {
  company: { select: { name: true, email: true, city: true, sector: true, website: true } },
  contact: { select: { id: true, name: true, email: true, emailKind: true, doNotContact: true, doNotContactReason: true } },
} satisfies Prisma.LeadInclude

const enrollmentInclude = {
  lead: { include: ficheInclude },
  mailbox: { select: { id: true, status: true, displayName: true } },
  sequence: { include: { steps: { orderBy: { position: "asc" } } } },
} satisfies Prisma.SequenceEnrollmentInclude

type Enrollment = Prisma.SequenceEnrollmentGetPayload<{ include: typeof enrollmentInclude }>

type Outcome = "sent" | "stopped" | "waiting" | "failed" | "completed" | "done"

const closedStatus = { REPLIED: "REPLIED", QUALIFIED: "LEAD_CLOSED", DISQUALIFIED: "LEAD_CLOSED", DO_NOT_CONTACT: "DO_NOT_CONTACT" } as const satisfies Record<string, EnrollmentStopReason>

const suppressionReason = { UNSUBSCRIBED: "UNSUBSCRIBED", BOUNCED: "BOUNCED", COMPLAINED: "COMPLAINED", MANUAL: "SUPPRESSED" } as const satisfies Record<string, EnrollmentStopReason>

const postpone = (id: string, nextAt: Date, extra: Prisma.SequenceEnrollmentUpdateInput = {}) => prisma.sequenceEnrollment.update({ where: { id }, data: { nextAt, ...extra } })

/** Everything that must still be true at the moment of sending, checked again: the world changes between steps. */
async function stopReason(e: Enrollment): Promise<EnrollmentStopReason | null> {
  const status = e.lead.status
  if (status in closedStatus) return closedStatus[status as keyof typeof closedStatus]
  const recipient = recipientOf(e.lead)
  if (!recipient) return "MISSING_DATA"
  if (e.lead.contact?.doNotContact) return "DO_NOT_CONTACT"
  if (await isSuppressed(prisma, e.workspaceId, recipient.email)) {
    const row = await prisma.suppression.findFirst({ where: { workspaceId: e.workspaceId, email: recipient.email }, select: { reason: true } })
    return row ? suppressionReason[row.reason] : "SUPPRESSED"
  }
  // A person answered by any path since enrollment (the reader may not have run yet, or a hook was missed).
  const answered = await prisma.emailMessage.findFirst({
    where: { leadId: e.leadId, direction: "INBOUND", isTest: false, createdAt: { gte: e.createdAt }, OR: [{ replyClass: null }, { replyClass: { not: "OUT_OF_OFFICE" } }] },
    select: { id: true },
  })
  return answered ? "REPLIED" : null
}

async function processOne(e: Enrollment, now: Date): Promise<Outcome> {
  const steps = e.sequence.steps
  const position = e.currentStep + 1
  const step = steps.find((s) => s.position === position)
  // The sequence was shortened below this fiche's progress.
  if (!step) {
    await prisma.sequenceEnrollment.update({ where: { id: e.id }, data: { status: "COMPLETED", nextAt: null } })
    return "done"
  }

  const reason = await stopReason(e)
  if (reason) {
    await stopEnrollments(prisma, { id: e.id }, reason)
    return "stopped"
  }
  if (e.mailbox.status !== "ACTIVE") {
    // Paused (by a person or by the health check) or in error: the fiche waits, nothing is lost.
    await postpone(e.id, new Date(now.getTime() + 60 * 60_000))
    return "waiting"
  }

  const recipient = recipientOf(e.lead)!
  const sentSoFar = await prisma.emailMessage.findMany({ where: { enrollmentId: e.id, direction: "OUTBOUND", status: "SENT" }, orderBy: { createdAt: "asc" }, select: { messageId: true, subject: true, stepNumber: true } })
  const stepTexts = steps.map((s) => ({ delayDays: s.delayDays, subject: s.subject, body: s.body }))
  const text = renderStep(stepTexts, position, e.lead, e.mailbox.displayName, sentSoFar.find((m) => m.stepNumber === 1)?.subject)
  if (text.missing.length) {
    await stopEnrollments(prisma, { id: e.id }, "MISSING_DATA")
    return "stopped"
  }

  const actor: Actor = { id: e.enrolledById, workspaceId: e.workspaceId, anyMailbox: true }
  let reserved
  try {
    reserved = await prisma.$transaction(async (tx) => {
      // The exclusion list is read once more under the mailbox lock: an unsubscribe may have landed a second ago.
      if (await isSuppressed(tx, e.workspaceId, recipient.email)) throw new LeadError("conflict", BLOCKER_LABELS.suppressed, 409, { blocker: "suppressed" })
      return reserve(tx, actor, {
        mailboxId: e.mailboxId,
        to: recipient.email,
        subject: text.subject,
        body: text.body,
        leadId: e.leadId,
        contactId: recipient.contactId,
        templateId: null,
        origin: originText(e.lead.source),
        isTest: false,
        sequence: { enrollmentId: e.id, stepNumber: position, thread: sentSoFar.map((m) => m.messageId) },
      })
    })
  } catch (error) {
    const blocker = error instanceof LeadError ? (error.extra?.blocker as string | undefined) : undefined
    if (blocker === "suppressed") {
      await stopEnrollments(prisma, { id: e.id }, "SUPPRESSED")
      return "stopped"
    }
    if (blocker === "quota_reached") await postpone(e.id, scheduleAt(now, 1))
    else if (blocker === "just_sent") await postpone(e.id, new Date(now.getTime() + 30 * 60_000))
    else if (blocker === "mailbox_inactive") await postpone(e.id, new Date(now.getTime() + 60 * 60_000))
    else throw error
    return "waiting"
  }

  try {
    await deliver(actor, reserved)
  } catch (error) {
    const failure = error instanceof LeadError ? (error.extra?.failure as string | undefined) : undefined
    if (failure === "recipient") {
      await stopEnrollments(prisma, { id: e.id }, "SEND_FAILED")
      return "stopped"
    }
    // A refused login already put the mailbox in error: wait for a person without burning attempts.
    if (failure === "auth") {
      await postpone(e.id, new Date(now.getTime() + 60 * 60_000))
      return "failed"
    }
    const failures = e.failures + 1
    if (failures >= MAX_ATTEMPTS) {
      await prisma.sequenceEnrollment.update({ where: { id: e.id }, data: { failures } })
      await stopEnrollments(prisma, { id: e.id }, "SEND_FAILED")
      return "stopped"
    }
    await postpone(e.id, new Date(now.getTime() + failures * 60 * 60_000), { failures })
    return "failed"
  }

  await recordSent(actor, e.leadId, reserved, { sequenceId: e.sequenceId, step: position })
  const next = steps.find((s) => s.position === position + 1)
  await prisma.sequenceEnrollment.update({
    where: { id: e.id },
    data: next ? { currentStep: position, lastSentAt: new Date(), failures: 0, nextAt: scheduleAt(new Date(), next.delayDays) } : { currentStep: position, lastSentAt: new Date(), failures: 0, status: "COMPLETED", nextAt: null },
  })
  await audit({ action: "email.sent", actorId: e.enrolledById, workspaceId: e.workspaceId, entityType: "EmailMessage", entityId: reserved.id, subject: reserved.to, metadata: { leadId: e.leadId, mailboxId: e.mailboxId, sequenceId: e.sequenceId, step: position } })
  return next ? "sent" : "completed"
}

/**
 * The scheduled task for sequences: sends the steps that are due, inside the send window, a couple per mailbox at a
 * time. Safe to run twice at once: an enrollment is claimed with a short lease before anything is sent.
 */
export async function runSequences(now = new Date()): Promise<RunSummary> {
  const sum = empty()
  sum.autoPaused = (await pauseUnhealthyMailboxes(now)).length
  if (!inSendWindow(now)) {
    sum.closed = true
    return sum
  }
  const due = await prisma.sequenceEnrollment.findMany({
    where: { status: "ACTIVE", nextAt: { lte: now }, sequence: { status: "ACTIVE", archivedAt: null } },
    select: { id: true, mailboxId: true },
    orderBy: { nextAt: "asc" },
    take: BATCH,
  })
  const perMailbox = new Map<string, number>()
  for (const d of due) {
    if ((perMailbox.get(d.mailboxId) ?? 0) >= PER_MAILBOX_PER_RUN) continue
    const claim = await prisma.sequenceEnrollment.updateMany({ where: { id: d.id, status: "ACTIVE", nextAt: { lte: now } }, data: { nextAt: new Date(now.getTime() + LEASE_MS) } })
    if (!claim.count) continue
    perMailbox.set(d.mailboxId, (perMailbox.get(d.mailboxId) ?? 0) + 1)
    try {
      const e = await prisma.sequenceEnrollment.findUniqueOrThrow({ where: { id: d.id }, include: enrollmentInclude })
      const outcome = await processOne(e, now)
      // "completed" = the last step just left; "done" = nothing left to send.
      if (outcome === "completed") sum.sent++
      sum[outcome === "done" ? "completed" : outcome]++
    } catch (error) {
      // One broken enrollment must not stop the others; the lease expires and it is tried again.
      sum.failed++
      console.error("[SEQUENCE_RUN]", d.id, error)
    }
  }
  return sum
}
