import { Prisma, type Mailbox } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import { applySuppressions } from "@/lib/mail/events"
import { credentialsOf } from "./mailboxes"
import { analyze, type Inbound } from "./inbound"
import { transport, TransportError } from "./transport"

const CLAIM_TTL_MS = 5 * 60_000
/** A message still `SENDING` after this long never got its answer from the server (the process died in between). */
const STALE_SENDING_MS = 15 * 60_000

export interface PollSummary {
  mailboxes: number
  replies: number
  bounces: number
  automatic: number
  errors: number
  staleFixed: number
}

const empty = (): PollSummary => ({ mailboxes: 0, replies: 0, bounces: 0, automatic: 0, errors: 0, staleFixed: 0 })

/** Frees the slot of sends that never finished; the log says what happened so a person can check "Sent". */
export async function failStaleSends(now = new Date()): Promise<number> {
  const { count } = await prisma.emailMessage.updateMany({
    where: { direction: "OUTBOUND", status: "SENDING", createdAt: { lt: new Date(now.getTime() - STALE_SENDING_MS) } },
    data: { status: "FAILED", error: "Envoi interrompu avant la réponse du serveur : vérifiez le dossier Envoyés de la boîte." },
  })
  return count
}

/** The message we sent that `ids` (In-Reply-To / References) refer to, in this mailbox. */
function findSent(mailboxId: string, ids: string[]) {
  if (!ids.length) return Promise.resolve(null)
  return prisma.emailMessage.findFirst({ where: { mailboxId, direction: "OUTBOUND", messageId: { in: ids } } })
}

async function handleBounce(box: Mailbox, b: Extract<Inbound, { kind: "bounce" }>): Promise<boolean> {
  const sent = b.originalMessageId ? await findSent(box.id, [b.originalMessageId]) : null
  if (!sent) return false
  if (!b.hard) {
    // Mailbox full, server busy: the address may work later. Noted on the fiche, nothing is suppressed.
    if (sent.leadId) await prisma.activity.create({ data: { workspaceId: sent.workspaceId, leadId: sent.leadId, actorKind: "SYSTEM", kind: "EMAIL", body: sent.subject, data: { event: "bounce_soft", emailId: sent.id, to: sent.toEmail, detail: b.diagnostic } } })
    return true
  }
  if (sent.status === "BOUNCED") return true
  await prisma.emailMessage.update({ where: { id: sent.id }, data: { status: "BOUNCED", error: b.diagnostic || "Rebond définitif" } })
  // A test sent to a member's own address says nothing about a prospect.
  if (!sent.isTest) {
    await applySuppressions(sent.workspaceId, [{ email: sent.toEmail, reason: "BOUNCED", detail: b.diagnostic }], "rebond lu dans la boîte")
    if (sent.leadId) await prisma.activity.create({ data: { workspaceId: sent.workspaceId, leadId: sent.leadId, actorKind: "SYSTEM", kind: "EMAIL", body: sent.subject, data: { event: "bounced", emailId: sent.id, to: sent.toEmail, detail: b.diagnostic } } })
  }
  return true
}

async function handleReply(box: Mailbox, r: Extract<Inbound, { kind: "reply" }>, uid: number): Promise<"reply" | "automatic" | null> {
  const sent = await findSent(box.id, r.inReplyTo)
  if (!sent) return null
  // Some clients drop the Message-ID: a stable stand-in keeps a re-read from storing the message twice.
  const messageId = r.messageId || `<imap-${box.id}-${uid}@local>`
  const created = await prisma
    .$transaction(async (tx) => {
      await tx.emailMessage.create({
        data: {
          workspaceId: sent.workspaceId,
          mailboxId: box.id,
          leadId: sent.leadId,
          contactId: sent.contactId,
          sentById: sent.sentById,
          direction: "INBOUND",
          status: "RECEIVED",
          fromEmail: r.fromEmail,
          toEmail: box.address,
          subject: r.subject,
          bodyText: r.text,
          messageId,
          inReplyTo: sent.messageId,
          repliesToId: sent.id,
          isTest: sent.isTest,
          replyClass: r.automatic ? "OUT_OF_OFFICE" : null,
          // Out-of-office notices are filed without waiting for a person to open them.
          readAt: r.automatic ? new Date() : null,
          sentAt: r.date,
        },
      })
      if (sent.leadId && !sent.isTest) {
        await tx.activity.create({ data: { workspaceId: sent.workspaceId, leadId: sent.leadId, actorKind: "SYSTEM", kind: "EMAIL", body: r.subject, data: { event: r.automatic ? "auto_reply" : "replied", emailId: sent.id, from: r.fromEmail } } })
        if (!r.automatic) {
          const lead = await tx.lead.findUnique({ where: { id: sent.leadId }, select: { status: true } })
          if (lead && (lead.status === "NEW" || lead.status === "CONTACTED")) {
            await tx.lead.update({ where: { id: sent.leadId }, data: { status: "REPLIED", lastContactedAt: new Date() } })
            await tx.activity.create({ data: { workspaceId: sent.workspaceId, leadId: sent.leadId, actorKind: "SYSTEM", kind: "STATUS_CHANGE", data: { from: lead.status, to: "REPLIED", reason: "reply" } } })
          }
        }
      }
      return true
    })
    // Read twice (an overlapping run, a rewound cursor): the message is already filed.
    .catch((error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false
      throw error
    })
  return created ? (r.automatic ? "automatic" : "reply") : null
}

/** Reads the mailbox's new mail once and files replies and bounces. Never throws: a failure is recorded on the mailbox. */
export async function pollMailbox(boxId: string, now = new Date()): Promise<PollSummary> {
  const sum = empty()
  // Claim: only one reader per mailbox at a time.
  const claimed = await prisma.mailbox.updateMany({
    where: { id: boxId, status: "ACTIVE", imapHost: { not: null }, OR: [{ pollClaimedAt: null }, { pollClaimedAt: { lt: new Date(now.getTime() - CLAIM_TTL_MS) } }] },
    data: { pollClaimedAt: now },
  })
  if (!claimed.count) return sum
  sum.mailboxes = 1
  const box = await prisma.mailbox.findUniqueOrThrow({ where: { id: boxId } })
  try {
    const result = await transport.fetchNew(credentialsOf(box), { lastUid: box.imapLastUid, uidValidity: box.imapUidValidity })
    for (const m of result.messages) {
      try {
        const found = await analyze(m.source, box.address)
        if (found.kind === "bounce") {
          if (await handleBounce(box, found)) sum.bounces++
        } else if (found.kind === "reply") {
          const outcome = await handleReply(box, found, m.uid)
          if (outcome === "reply") sum.replies++
          if (outcome === "automatic") sum.automatic++
        }
      } catch (error) {
        // One unreadable message must not stop the others, nor make the cursor stick on it.
        sum.errors++
        console.error("[MAILBOX_POLL_MESSAGE]", box.address, m.uid, error)
      }
    }
    await prisma.mailbox.update({ where: { id: box.id }, data: { imapLastUid: result.lastUid, imapUidValidity: result.uidValidity, lastPolledAt: now, lastPollError: null } })
  } catch (error) {
    sum.errors++
    const e = error instanceof TransportError ? error : new TransportError("other", error instanceof Error ? error.message : "Lecture impossible")
    console.error("[MAILBOX_POLL]", box.address, e.kind, e.detail ?? e.message)
    // Refused credentials stop the mailbox (sending included, like a refused send); a network fault is retried next time.
    await prisma.mailbox.update({ where: { id: box.id }, data: { lastPolledAt: now, lastPollError: e.message, ...(e.kind === "auth" ? { status: "ERROR", statusReason: e.message } : {}) } })
  } finally {
    await prisma.mailbox.update({ where: { id: box.id }, data: { pollClaimedAt: null } })
  }
  if (sum.replies || sum.bounces) await audit({ action: "mailbox.polled", workspaceId: box.workspaceId, actorKind: "SYSTEM", entityType: "Mailbox", entityId: box.id, subject: box.address, metadata: { replies: sum.replies, bounces: sum.bounces, automatic: sum.automatic } })
  return sum
}

/** The scheduled task: every active mailbox with an IMAP server, plus the cleanup of stale sends. */
export async function pollAll(now = new Date()): Promise<PollSummary> {
  const total = empty()
  total.staleFixed = await failStaleSends(now)
  const boxes = await prisma.mailbox.findMany({ where: { status: "ACTIVE", imapHost: { not: null } }, select: { id: true }, orderBy: { lastPolledAt: { sort: "asc", nulls: "first" } } })
  for (const { id } of boxes) {
    const s = await pollMailbox(id, now)
    total.mailboxes += s.mailboxes
    total.replies += s.replies
    total.bounces += s.bounces
    total.automatic += s.automatic
    total.errors += s.errors
  }
  return total
}
