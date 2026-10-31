import type { Mailbox, MailboxStatus, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { mayUseAnyMailbox } from "./mailboxes"
import { HEALTH, mailboxHealth, type Health } from "./sequence-rules"

const DAY = 86_400_000

/**
 * Definitions (E10 asks every figure to be recomputable):
 * - envoyés = prospect messages that left the mailbox (status sent or bounced), tests excluded;
 * - rebonds = those that came back as a permanent failure;
 * - désinscriptions = unsubscribe-link clicks on its messages + replies filed "Ne plus écrire";
 * - réponses = replies from a person (out-of-office notices excluded).
 */
async function counts(mailboxId: string, since: Date, to?: Date) {
  const sentWhere: Prisma.EmailMessageWhereInput = { mailboxId, direction: "OUTBOUND", isTest: false, createdAt: { gte: since, ...(to ? { lt: to } : {}) } }
  const [sent, bounced, unsubscribed, stopReplies, replies] = await Promise.all([
    prisma.emailMessage.count({ where: { ...sentWhere, status: { in: ["SENT", "BOUNCED"] } } }),
    prisma.emailMessage.count({ where: { ...sentWhere, status: "BOUNCED" } }),
    prisma.emailMessage.count({ where: { ...sentWhere, unsubscribedAt: { not: null } } }),
    prisma.emailMessage.count({ where: { mailboxId, direction: "INBOUND", isTest: false, replyClass: "STOP", createdAt: { gte: since } } }),
    prisma.emailMessage.count({ where: { mailboxId, direction: "INBOUND", isTest: false, createdAt: { gte: since }, OR: [{ replyClass: null }, { replyClass: { not: "OUT_OF_OFFICE" } }] } }),
  ])
  return { sent, bounced, optOuts: unsubscribed + stopReplies, replies }
}

/** The health used for the automatic pause: the last 7 days, or since a person last resumed the mailbox. */
export async function healthOf(box: Pick<Mailbox, "id" | "healthResetAt">, now = new Date()): Promise<Health> {
  const since = new Date(Math.max(now.getTime() - HEALTH.windowDays * DAY, box.healthResetAt?.getTime() ?? 0))
  const c = await counts(box.id, since)
  return mailboxHealth(c)
}

/**
 * Pauses every active mailbox whose bounce or opt-out rate crossed the line. It stays paused (sequences wait,
 * one-to-one sends are refused) until a person resumes it, which also restarts the count.
 */
export async function pauseUnhealthyMailboxes(now = new Date()): Promise<{ id: string; address: string; reason: string }[]> {
  const boxes = await prisma.mailbox.findMany({ where: { status: "ACTIVE" }, select: { id: true, address: true, workspaceId: true, healthResetAt: true } })
  const paused: { id: string; address: string; reason: string }[] = []
  for (const box of boxes) {
    const h = await healthOf(box, now)
    if (h.level !== "pause" || !h.reason) continue
    const { count } = await prisma.mailbox.updateMany({ where: { id: box.id, status: "ACTIVE" }, data: { status: "PAUSED", statusReason: `Pause automatique : ${h.reason}` } })
    if (!count) continue
    paused.push({ id: box.id, address: box.address, reason: h.reason })
    await audit({ action: "mailbox.auto_paused", workspaceId: box.workspaceId, actorKind: "SYSTEM", entityType: "Mailbox", entityId: box.id, subject: box.address, metadata: { sent: h.sent, bounced: h.bounced, optOuts: h.optOuts, reason: h.reason } })
  }
  return paused
}

export interface DeliverabilityRow {
  id: string
  address: string
  status: MailboxStatus
  statusReason: string | null
  health: Health
  /** Last 30 days. */
  month: { sent: number; bounced: number; replies: number; optOuts: number }
}

export async function deliverability(user: CurrentUser, now = new Date()): Promise<DeliverabilityRow[]> {
  const boxes = await prisma.mailbox.findMany({ where: { workspaceId: user.workspaceId, ...(mayUseAnyMailbox(user) ? {} : { ownerId: user.id }) }, orderBy: { address: "asc" } })
  return Promise.all(
    boxes.map(async (b) => ({
      id: b.id,
      address: b.address,
      status: b.status,
      statusReason: b.statusReason,
      health: await healthOf(b, now),
      month: await counts(b.id, new Date(now.getTime() - 30 * DAY)),
    })),
  )
}
