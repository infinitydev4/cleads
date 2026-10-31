import { randomUUID } from "node:crypto"
import { after } from "next/server"
import type { EmailStatus, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { LeadError } from "@/features/leads/errors"
import { isSuppressed, scopeWhere } from "@/features/leads/service"
import { composeText, newMessageId, originText, outreachHeaders, unsubscribeLinks } from "./compose"
import { credentialsOf, mayUseAnyMailbox, sentToday, usableMailboxes, type MailboxView } from "./mailboxes"
import { BLOCKER_LABELS, DUPLICATE_WINDOW_MS, dailyAllowance, leadBlockers, mailboxBlocker, mayEmailLead, recipientOf, type Blocker, type Recipient } from "./rules"
import { hasPlaceholder, templateValues, type TemplateValues } from "./template"
import { listTemplates, type TemplateView } from "./templates"
import { transport, TransportError, type MailboxCredentials } from "./transport"
import type { SendInput } from "./schemas"

type Tx = Prisma.TransactionClient

const leadInclude = {
  company: { select: { name: true, email: true, city: true, sector: true, website: true } },
  contact: { select: { id: true, name: true, email: true, emailKind: true, doNotContact: true, doNotContactReason: true } },
  deals: { select: { ownerId: true, stage: true } },
} satisfies Prisma.LeadInclude
type LeadForMail = Prisma.LeadGetPayload<{ include: typeof leadInclude }>

async function loadLead(user: CurrentUser, leadId: string): Promise<LeadForMail> {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId: user.workspaceId, ...scopeWhere(user, "lead:read") }, include: leadInclude })
  if (!lead) throw new LeadError("not_found", "Fiche introuvable.", 404)
  return lead
}

async function checkLead(user: CurrentUser, lead: LeadForMail, db: Pick<Tx, "suppression"> = prisma) {
  const recipient = recipientOf(lead)
  const suppressed = recipient ? await isSuppressed(db, user.workspaceId, recipient.email) : false
  const blockers = leadBlockers({ status: lead.status, recipient, contactDoNotContact: !!lead.contact?.doNotContact, suppressed, mayWrite: mayEmailLead(user, lead) })
  return { recipient, blockers }
}

const labelled = (blockers: Blocker[]) => blockers.map((code) => ({ code, label: BLOCKER_LABELS[code] }))

// ── What the composer needs ─────────────────────────────────────────────────────────────────────────────────────

export interface ComposeMailbox extends Pick<MailboxView, "id" | "address" | "displayName" | "ownerId" | "ownerName" | "allowanceToday" | "sentToday" | "status" | "statusReason" | "signature"> {
  blocker: { code: Blocker; label: string } | null
}

export interface ComposeContext {
  recipient: Recipient | null
  blockers: { code: Blocker; label: string }[]
  mailboxes: ComposeMailbox[]
  templates: TemplateView[]
  /** Values of the fiche; `expediteur` and `expediteur_prenom` depend on the mailbox chosen. */
  values: TemplateValues
  /** Told to the prospect in the footer. */
  origin: string
  recent: EmailView[]
}

export async function composeContext(user: CurrentUser, leadId: string): Promise<ComposeContext> {
  const lead = await loadLead(user, leadId)
  const [{ recipient, blockers }, boxes, templates, recent] = await Promise.all([
    checkLead(user, lead),
    usableMailboxes(user),
    listTemplates(user),
    listEmails(user, { leadId, take: 5 }).then((r) => r.items),
  ])
  return {
    recipient,
    blockers: labelled(blockers),
    mailboxes: boxes.map((m) => {
      const b = mailboxBlocker(m, m.sentToday, m.allowanceToday)
      return { id: m.id, address: m.address, displayName: m.displayName, ownerId: m.ownerId, ownerName: m.ownerName, allowanceToday: m.allowanceToday, sentToday: m.sentToday, status: m.status, statusReason: m.statusReason, signature: m.signature, blocker: b && { code: b, label: BLOCKER_LABELS[b] } }
    }),
    templates,
    values: templateValues({ contactName: lead.contact?.name, companyName: lead.company?.name, city: lead.company?.city, sector: lead.company?.sector, website: lead.company?.website }),
    origin: originText(lead.source),
    recent,
  }
}

// ── Sending ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Work that may run after the answer has gone (filing the copy in "Sent"). Outside a request (scripts, tests) it simply runs. */
function later(task: () => Promise<unknown>) {
  try {
    after(task)
  } catch {
    void task()
  }
}

/** Who sends: a signed-in person, or the sequence worker (`id` null) acting for the person who enrolled the fiche. */
export interface Actor {
  id: string | null
  workspaceId: string
  /** May use any mailbox of the workspace (owners and managers, or the worker, whose mailbox was checked at enrollment). */
  anyMailbox: boolean
}

export const actorOf = (user: CurrentUser): Actor => ({ id: user.id, workspaceId: user.workspaceId, anyMailbox: mayUseAnyMailbox(user) })

export interface Reserved {
  id: string
  credentials: MailboxCredentials
  mailboxId: string
  to: string
  subject: string
  text: string
  messageId: string
  headers: Record<string, string>
}

/**
 * Takes one slot in the mailbox's allowance for today, under a row lock on the mailbox: two sends at the same
 * moment cannot both take the last slot. The network call happens after the lock is released.
 */
export async function reserve(
  tx: Tx,
  user: Actor,
  input: {
    mailboxId: string
    to: string
    subject: string
    body: string
    leadId: string | null
    contactId: string | null
    templateId: string | null
    origin: string
    isTest: boolean
    /** Sequence steps: which enrollment and step this is, and the earlier message ids it continues (same thread). */
    sequence?: { enrollmentId: string; stepNumber: number; thread: string[] } | null
  },
): Promise<Reserved> {
  await tx.$queryRaw`SELECT id FROM "Mailbox" WHERE id = ${input.mailboxId} FOR UPDATE`
  const box = await tx.mailbox.findFirst({ where: { id: input.mailboxId, workspaceId: user.workspaceId } })
  if (!box) throw new LeadError("not_found", "Boîte d’envoi introuvable.", 404)
  if (!user.anyMailbox && box.ownerId !== user.id) throw new LeadError("forbidden", "Cette boîte d’envoi ne vous est pas attribuée.", 403)
  const blocker = mailboxBlocker(box, await sentToday(tx, box.id), dailyAllowance(box))
  if (blocker) throw new LeadError("conflict", blocker === "mailbox_inactive" && box.statusReason ? `${BLOCKER_LABELS[blocker]} ${box.statusReason}` : BLOCKER_LABELS[blocker], 409, { blocker })

  if (!input.isTest) {
    const recent = await tx.emailMessage.findFirst({
      where: {
        workspaceId: user.workspaceId,
        toEmail: input.to,
        direction: "OUTBOUND",
        status: { in: ["SENDING", "SENT"] },
        createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
        // The steps of one sequence are spaced by the schedule, not by this guard; another stream to the same address still counts.
        ...(input.sequence ? { OR: [{ enrollmentId: null }, { enrollmentId: { not: input.sequence.enrollmentId } }] } : {}),
      },
      select: { id: true },
    })
    if (recent) throw new LeadError("conflict", BLOCKER_LABELS.just_sent, 409, { blocker: "just_sent" })
  }

  const id = randomUUID()
  const links = unsubscribeLinks(id)
  const messageId = newMessageId(box.address)
  const text = composeText({ body: input.body, signature: box.signature, senderName: box.displayName, origin: input.origin, unsubscribeUrl: links.page })
  await tx.emailMessage.create({
    data: {
      id,
      workspaceId: user.workspaceId,
      mailboxId: box.id,
      leadId: input.leadId,
      contactId: input.contactId,
      sentById: user.id,
      templateId: input.templateId,
      enrollmentId: input.sequence?.enrollmentId ?? null,
      stepNumber: input.sequence?.stepNumber ?? null,
      inReplyTo: input.sequence?.thread.at(-1) ?? null,
      status: "SENDING",
      fromEmail: box.address,
      toEmail: input.to,
      subject: input.subject,
      bodyText: text,
      messageId,
      isTest: input.isTest,
    },
  })
  return { id, credentials: credentialsOf(box), mailboxId: box.id, to: input.to, subject: input.subject, text, messageId, headers: { ...outreachHeaders(links.oneClick), ...(input.sequence?.thread.length ? { "In-Reply-To": input.sequence.thread.at(-1)!, References: input.sequence.thread.join(" ") } : {}) } }
}

/** Hands the reserved message to the mailbox's server and records what happened. Throws LeadError on failure. */
export async function deliver(user: Actor, r: Reserved): Promise<void> {
  try {
    const { raw } = await transport.send(r.credentials, { to: r.to, subject: r.subject, text: r.text, messageId: r.messageId, headers: r.headers })
    await prisma.emailMessage.update({ where: { id: r.id }, data: { status: "SENT", sentAt: new Date() } })
    later(() => transport.saveToSent(r.credentials, raw))
  } catch (error) {
    const e = error instanceof TransportError ? error : new TransportError("other", error instanceof Error ? error.message : "Échec de l’envoi")
    await prisma.emailMessage.update({ where: { id: r.id }, data: { status: "FAILED", error: (e.detail ?? e.message).slice(0, 500) } })
    // Refused credentials will fail every send: the mailbox stops until someone fixes it and tests again.
    if (e.kind === "auth") await prisma.mailbox.update({ where: { id: r.mailboxId }, data: { status: "ERROR", statusReason: e.message } })
    await audit({ action: "email.failed", actorId: user.id, workspaceId: user.workspaceId, entityType: "EmailMessage", entityId: r.id, metadata: { kind: e.kind, detail: e.detail ?? null } })
    throw new LeadError("conflict", `L’email n’est pas parti. ${e.message}`, 409, { emailId: r.id, failure: e.kind })
  }
}

/** The fiche's history and status after a send: an email sent is a contact. */
export async function recordSent(actor: Actor, leadId: string, r: Reserved, extra: Record<string, unknown> = {}): Promise<void> {
  const by = { actorId: actor.id, actorKind: actor.id ? ("USER" as const) : ("SYSTEM" as const) }
  await prisma.$transaction(async (tx) => {
    await tx.activity.create({
      data: { workspaceId: actor.workspaceId, leadId, ...by, kind: "EMAIL", body: r.subject, data: { event: "sent", emailId: r.id, to: r.to, from: r.credentials.address, ...extra } as Prisma.InputJsonValue },
    })
    const current = await tx.lead.findUniqueOrThrow({ where: { id: leadId }, select: { status: true } })
    await tx.lead.update({ where: { id: leadId }, data: { lastContactedAt: new Date(), ...(current.status === "NEW" ? { status: "CONTACTED" } : {}) } })
    if (current.status === "NEW") {
      await tx.activity.create({ data: { workspaceId: actor.workspaceId, leadId, ...by, kind: "STATUS_CHANGE", data: { from: "NEW", to: "CONTACTED", reason: "email" } } })
    }
  })
}

export async function sendToLead(user: CurrentUser, leadId: string, input: SendInput, ip?: string | null): Promise<{ emailId: string }> {
  const lead = await loadLead(user, leadId)
  const { recipient, blockers } = await checkLead(user, lead)
  if (blockers.length) {
    const first = blockers[0]
    throw new LeadError(first === "not_yours" ? "forbidden" : "conflict", BLOCKER_LABELS[first], first === "not_yours" ? 403 : 409, { blocker: first })
  }
  if (recipient!.kind === "GENERIC" && !input.confirmGeneric) {
    throw new LeadError("conflict", "Cette adresse est générique (contact@, info@…) : confirmez que vous voulez y écrire.", 409, { blocker: "generic_address" })
  }
  if (hasPlaceholder(input.subject) || hasPlaceholder(input.body)) throw new LeadError("invalid", "Une variable n’a pas été remplie ({{…}}) : complétez le message avant de l’envoyer.")
  if (input.templateId && !(await prisma.emailTemplate.findFirst({ where: { id: input.templateId, workspaceId: user.workspaceId }, select: { id: true } }))) {
    throw new LeadError("invalid", "Modèle introuvable.")
  }

  const reserved = await prisma.$transaction(async (tx) => {
    // Checked again under the lock: an unsubscribe may have landed since the composer opened.
    if (await isSuppressed(tx, user.workspaceId, recipient!.email)) throw new LeadError("conflict", BLOCKER_LABELS.suppressed, 409, { blocker: "suppressed" })
    return reserve(tx, actorOf(user), { mailboxId: input.mailboxId, to: recipient!.email, subject: input.subject, body: input.body, leadId: lead.id, contactId: recipient!.contactId, templateId: input.templateId ?? null, origin: originText(lead.source), isTest: false })
  })
  await deliver(actorOf(user), reserved)

  await recordSent(actorOf(user), lead.id, reserved)
  await audit({ action: "email.sent", actorId: user.id, workspaceId: user.workspaceId, entityType: "EmailMessage", entityId: reserved.id, subject: reserved.to, metadata: { leadId: lead.id, mailboxId: reserved.mailboxId, templateId: input.templateId ?? null }, ip })
  return { emailId: reserved.id }
}

/** A test from a mailbox to the signed-in person's own address, with the real footer and headers. It uses one slot of the day. */
export async function sendTestEmail(user: CurrentUser, mailboxId: string): Promise<{ emailId: string; to: string }> {
  if (!user.email) throw new LeadError("invalid", "Votre compte n’a pas d’adresse email.")
  const reserved = await prisma.$transaction((tx) =>
    reserve(tx, actorOf(user), {
      mailboxId,
      to: user.email.toLowerCase(),
      subject: "Test d’envoi Cleads",
      body: `Bonjour,\n\nCe message de test part de la boîte de prospection. Vérifiez qu’il arrive en boîte de réception (pas en spam) et que le lien de désinscription ci-dessous s’affiche.\n\nVous n’avez rien à faire.`,
      leadId: null,
      contactId: null,
      templateId: null,
      origin: "l’annuaire de votre équipe",
      isTest: true,
    }),
  )
  await deliver(actorOf(user), reserved)
  await audit({ action: "email.test_sent", actorId: user.id, workspaceId: user.workspaceId, entityType: "Mailbox", entityId: mailboxId })
  return { emailId: reserved.id, to: reserved.to }
}

// ── The log ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface EmailView {
  id: string
  status: EmailStatus
  fromEmail: string
  toEmail: string
  subject: string
  bodyText: string
  error: string | null
  isTest: boolean
  direction: "OUTBOUND" | "INBOUND"
  leadId: string | null
  leadName: string | null
  sentByName: string | null
  templateName: string | null
  /** Set when a sequence sent it: its name and the step. */
  sequenceName: string | null
  stepNumber: number | null
  createdAt: string
  sentAt: string | null
}

/** Sent emails, newest first. Owners and managers see the team's; everyone else their own. */
export async function listEmails(user: CurrentUser, opts: { leadId?: string; mailboxId?: string; before?: string; take?: number; direction?: "OUTBOUND" | "INBOUND" } = {}): Promise<{ items: EmailView[]; hasMore: boolean }> {
  const take = Math.min(Math.max(opts.take ?? 50, 1), 100)
  const before = opts.before ? new Date(opts.before) : null
  const rows = await prisma.emailMessage.findMany({
    where: {
      workspaceId: user.workspaceId,
      ...(mayUseAnyMailbox(user) ? {} : { sentById: user.id }),
      ...(opts.direction ? { direction: opts.direction } : {}),
      ...(opts.leadId ? { leadId: opts.leadId } : {}),
      ...(opts.mailboxId ? { mailboxId: opts.mailboxId } : {}),
      ...(before && !Number.isNaN(before.getTime()) ? { createdAt: { lt: before } } : {}),
    },
    include: { lead: { select: { company: { select: { name: true } }, contact: { select: { name: true } } } }, sentBy: { select: { name: true, email: true } }, template: { select: { name: true } }, enrollment: { select: { sequence: { select: { name: true } } } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
  })
  return {
    items: rows.slice(0, take).map((m) => ({
      id: m.id,
      status: m.status,
      fromEmail: m.fromEmail,
      toEmail: m.toEmail,
      subject: m.subject,
      bodyText: m.bodyText,
      error: m.error,
      isTest: m.isTest,
      direction: m.direction,
      leadId: m.leadId,
      leadName: m.lead?.company?.name ?? m.lead?.contact?.name ?? null,
      sentByName: m.sentBy?.name ?? m.sentBy?.email ?? null,
      templateName: m.template?.name ?? null,
      sequenceName: m.enrollment?.sequence.name ?? null,
      stepNumber: m.stepNumber,
      createdAt: m.createdAt.toISOString(),
      sentAt: m.sentAt?.toISOString() ?? null,
    })),
    hasMore: rows.length > take,
  }
}
