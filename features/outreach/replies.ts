import type { Prisma, ReplyClass } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { LeadError } from "@/features/leads/errors"
import { mayUseAnyMailbox } from "./mailboxes"

export const REPLY_CLASSES = ["INTERESTED", "NOT_NOW", "NOT_INTERESTED", "OUT_OF_OFFICE", "WRONG_PERSON", "STOP", "OTHER"] as const satisfies readonly ReplyClass[]

export interface ReplyView {
  id: string
  fromEmail: string
  toEmail: string
  subject: string
  bodyText: string
  replyClass: ReplyClass | null
  read: boolean
  leadId: string | null
  leadName: string | null
  /** The message we sent that this answers. */
  sentSubject: string | null
  receivedAt: string
}

/** Owners and managers see the team's replies; everyone else those to the messages they sent. */
const visible = (user: CurrentUser): Prisma.EmailMessageWhereInput => ({
  workspaceId: user.workspaceId,
  direction: "INBOUND",
  isTest: false,
  ...(mayUseAnyMailbox(user) ? {} : { sentById: user.id }),
})

export async function listReplies(user: CurrentUser, opts: { before?: string; take?: number } = {}): Promise<{ items: ReplyView[]; hasMore: boolean; unread: number }> {
  const take = Math.min(Math.max(opts.take ?? 50, 1), 100)
  const before = opts.before ? new Date(opts.before) : null
  const where = visible(user)
  const [rows, unread] = await Promise.all([
    prisma.emailMessage.findMany({
      where: { ...where, ...(before && !Number.isNaN(before.getTime()) ? { createdAt: { lt: before } } : {}) },
      include: { lead: { select: { company: { select: { name: true } }, contact: { select: { name: true } } } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
    }),
    prisma.emailMessage.count({ where: { ...where, readAt: null } }),
  ])
  const sentIds = rows.map((r) => r.repliesToId).filter((x): x is string => !!x)
  const sent = sentIds.length ? await prisma.emailMessage.findMany({ where: { id: { in: sentIds } }, select: { id: true, subject: true } }) : []
  const subjectOf = new Map(sent.map((s) => [s.id, s.subject]))
  return {
    items: rows.slice(0, take).map((m) => ({
      id: m.id,
      fromEmail: m.fromEmail,
      toEmail: m.toEmail,
      subject: m.subject,
      bodyText: m.bodyText,
      replyClass: m.replyClass,
      read: !!m.readAt,
      leadId: m.leadId,
      leadName: m.lead?.company?.name ?? m.lead?.contact?.name ?? null,
      sentSubject: m.repliesToId ? subjectOf.get(m.repliesToId) ?? null : null,
      receivedAt: (m.sentAt ?? m.createdAt).toISOString(),
    })),
    hasMore: rows.length > take,
    unread,
  }
}

export const unreadReplies = (user: CurrentUser) => prisma.emailMessage.count({ where: { ...visible(user), readAt: null } })

/**
 * Files a reply and/or marks it read. `STOP` ("ne m'écrivez plus") also puts the sender on the exclusion list, like a
 * click on the unsubscribe link; the other classes are labels (the fiche's status is a deliberate step, not a side effect).
 */
export async function updateReply(user: CurrentUser, id: string, patch: { replyClass?: ReplyClass | null; read?: boolean }, ip?: string | null): Promise<void> {
  const m = await prisma.emailMessage.findFirst({ where: { id, ...visible(user) } })
  if (!m) throw new LeadError("not_found", "Réponse introuvable.", 404)
  const data: Prisma.EmailMessageUpdateInput = {}
  if (patch.replyClass !== undefined) {
    data.replyClass = patch.replyClass
    // Filing a reply means it has been read.
    if (!m.readAt) data.readAt = new Date()
  }
  if (patch.read !== undefined) data.readAt = patch.read ? (m.readAt ?? new Date()) : null
  await prisma.$transaction(async (tx) => {
    await tx.emailMessage.update({ where: { id }, data })
    if (patch.replyClass === "STOP" && m.replyClass !== "STOP") {
      // The address we wrote to is the one to protect; the reply may come from a colleague's.
      const emails = new Set([m.fromEmail])
      if (m.repliesToId) {
        const sent = await tx.emailMessage.findUnique({ where: { id: m.repliesToId }, select: { toEmail: true } })
        if (sent) emails.add(sent.toEmail)
      }
      for (const email of emails) {
        const existing = await tx.suppression.findUnique({ where: { workspaceId_email: { workspaceId: m.workspaceId, email } } })
        if (!existing) await tx.suppression.create({ data: { workspaceId: m.workspaceId, email, reason: "UNSUBSCRIBED", source: "réponse classée « ne plus écrire »" } })
        await tx.contact.updateMany({ where: { workspaceId: m.workspaceId, email, doNotContact: false }, data: { doNotContact: true, doNotContactReason: "A demandé de ne plus être contacté (réponse)" } })
      }
    }
    if (patch.replyClass !== undefined && m.leadId) {
      await tx.activity.create({ data: { workspaceId: m.workspaceId, leadId: m.leadId, actorId: user.id, actorKind: "USER", kind: "EMAIL", body: m.subject, data: { event: "reply_classified", emailId: m.id, replyClass: patch.replyClass } } })
    }
  })
  if (patch.replyClass !== undefined) await audit({ action: "email.reply_classified", actorId: user.id, workspaceId: user.workspaceId, entityType: "EmailMessage", entityId: id, metadata: { replyClass: patch.replyClass }, ip })
}
