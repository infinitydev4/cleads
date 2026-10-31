import type { Mailbox, MailboxStatus, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { dayBounds } from "@/lib/crm/day"
import { emailDomain } from "@/lib/crm/normalize"
import { open, seal, secretBoxConfigured } from "@/lib/crypto/secret-box"
import { LeadError } from "@/features/leads/errors"
import { dailyAllowance, warmedUpStart, warmupDay } from "./rules"
import { transport, TransportError, type MailboxCredentials } from "./transport"
import type { CreateMailboxInput, UpdateMailboxInput } from "./schemas"

type Db = Prisma.TransactionClient | typeof prisma
const who = (u: { name: string | null; email: string | null } | null) => u?.name || u?.email || null

/**
 * Domains that carry the company's own and transactional mail. Prospecting from them would put their reputation at
 * risk (docs/crm-v1/PLAN.md decision D9), so a mailbox on one of them is refused.
 */
export const protectedDomains = () =>
  (process.env.OUTREACH_PROTECTED_DOMAINS || "cleads.fr").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean)

export function isProtectedAddress(address: string) {
  const domain = emailDomain(address.toLowerCase())
  return protectedDomains().some((d) => domain === d || domain.endsWith(`.${d}`))
}

// ── Reading ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Messages that count against today's allowance: those on their way or gone, not those that failed. */
export async function sentToday(db: Db, mailboxId: string, now = new Date()): Promise<number> {
  return db.emailMessage.count({ where: { mailboxId, direction: "OUTBOUND", status: { in: ["SENDING", "SENT", "BOUNCED"] }, createdAt: { gte: dayBounds(now).start } } })
}

export interface MailboxView {
  id: string
  address: string
  displayName: string
  ownerId: string | null
  ownerName: string | null
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  username: string
  imapHost: string | null
  imapPort: number | null
  imapSecure: boolean
  sentFolder: string | null
  signature: string | null
  dailyCap: number
  warmupStartedAt: string
  /** Day of the warm-up (0 = first day). */
  warmupDay: number
  allowanceToday: number
  sentToday: number
  status: MailboxStatus
  statusReason: string | null
  lastTestedAt: string | null
  /** E9b: when replies were last read, and why the last read failed (null when it worked). */
  lastPolledAt: string | null
  lastPollError: string | null
}

type MailboxRow = Mailbox & { owner: { name: string | null; email: string | null } | null }

async function toView(m: MailboxRow, now = new Date()): Promise<MailboxView> {
  return {
    id: m.id,
    address: m.address,
    displayName: m.displayName,
    ownerId: m.ownerId,
    ownerName: who(m.owner),
    smtpHost: m.smtpHost,
    smtpPort: m.smtpPort,
    smtpSecure: m.smtpSecure,
    username: m.username,
    imapHost: m.imapHost,
    imapPort: m.imapPort,
    imapSecure: m.imapSecure,
    sentFolder: m.sentFolder,
    signature: m.signature,
    dailyCap: m.dailyCap,
    warmupStartedAt: m.warmupStartedAt.toISOString(),
    warmupDay: Math.max(0, warmupDay(m.warmupStartedAt, now)),
    allowanceToday: dailyAllowance(m, now),
    sentToday: await sentToday(prisma, m.id, now),
    status: m.status,
    statusReason: m.statusReason,
    lastTestedAt: m.lastTestedAt?.toISOString() ?? null,
    lastPolledAt: m.lastPolledAt?.toISOString() ?? null,
    lastPollError: m.lastPollError,
  }
}

const withOwner = { owner: { select: { name: true, email: true } } } satisfies Prisma.MailboxInclude

export async function listMailboxes(user: CurrentUser): Promise<MailboxView[]> {
  const rows = await prisma.mailbox.findMany({ where: { workspaceId: user.workspaceId }, include: withOwner, orderBy: { address: "asc" } })
  return Promise.all(rows.map((m) => toView(m)))
}

/** Owners and managers may write from any mailbox (to cover for someone); everyone else from their own. */
export const mayUseAnyMailbox = (user: CurrentUser) => user.role === "OWNER" || user.role === "MANAGER"

export async function usableMailboxes(user: CurrentUser): Promise<MailboxView[]> {
  const rows = await prisma.mailbox.findMany({
    where: { workspaceId: user.workspaceId, ...(mayUseAnyMailbox(user) ? {} : { ownerId: user.id }) },
    include: withOwner,
    orderBy: [{ address: "asc" }],
  })
  const views = await Promise.all(rows.map((m) => toView(m)))
  // One's own mailboxes first.
  return views.sort((a, b) => Number(b.ownerId === user.id) - Number(a.ownerId === user.id))
}

/** The decrypted connection settings. Server side only. */
export function credentialsOf(m: Mailbox): MailboxCredentials {
  return {
    address: m.address,
    displayName: m.displayName,
    smtpHost: m.smtpHost,
    smtpPort: m.smtpPort,
    smtpSecure: m.smtpSecure,
    username: m.username,
    password: open(m.secret),
    imapHost: m.imapHost,
    imapPort: m.imapPort,
    imapSecure: m.imapSecure,
    sentFolder: m.sentFolder,
  }
}

// ── Writing (owner only: mailbox:manage) ────────────────────────────────────────────────────────────────────────

async function assertOwner(workspaceId: string, ownerId: string | null) {
  if (!ownerId) return
  const owner = await prisma.user.findFirst({ where: { id: ownerId, workspaceId, active: true }, select: { role: true } })
  const role = owner?.role as CurrentUser["role"] | undefined
  if (!role || !can(role, "email:send")) throw new LeadError("invalid", "Cette personne ne peut pas envoyer d’emails (SDR, closer, manager ou propriétaire actif).")
}

function assertSecretBox() {
  if (!secretBoxConfigured()) throw new LeadError("invalid", "Le serveur n’a pas de clé de chiffrement (MAILBOX_SECRET_KEY) : impossible d’enregistrer un mot de passe de boîte.")
}

export interface TestResult {
  ok: boolean
  error: string | null
  imap: boolean
  sentFolder: string | null
}

/**
 * Connects with the stored settings and records the outcome: a mailbox that fails goes to ERROR and cannot send.
 * Success reactivates a mailbox in error, or a paused one when `activate` (a person resumed it); a pause otherwise stays.
 */
async function runTest(m: Mailbox, opts: { activate?: boolean } = {}): Promise<TestResult> {
  try {
    const r = await transport.verify(credentialsOf(m))
    const reactivate = m.status === "ERROR" || (opts.activate && m.status === "PAUSED")
    await prisma.mailbox.update({
      where: { id: m.id },
      data: { lastTestedAt: new Date(), sentFolder: m.sentFolder ?? r.sentFolder, ...(reactivate ? { status: "ACTIVE", statusReason: null } : {}) },
    })
    return { ok: true, error: null, imap: r.imap, sentFolder: m.sentFolder ?? r.sentFolder }
  } catch (error) {
    const message = error instanceof TransportError ? error.message : error instanceof Error ? error.message : "Échec du test"
    // The page shows a short sentence; the server's own words go to the log so a refused login can be told from a network fault.
    console.error("[MAILBOX_TEST]", m.address, error instanceof TransportError ? `${error.kind}: ${error.detail ?? ""}` : error)
    await prisma.mailbox.update({ where: { id: m.id }, data: { lastTestedAt: new Date(), status: "ERROR", statusReason: message } })
    return { ok: false, error: message, imap: false, sentFolder: null }
  }
}

export async function createMailbox(user: CurrentUser, input: CreateMailboxInput, ip?: string | null): Promise<{ mailbox: MailboxView; test: TestResult }> {
  assertSecretBox()
  if (isProtectedAddress(input.address)) {
    throw new LeadError("invalid", `On ne prospecte jamais depuis ${emailDomain(input.address)} : utilisez une boîte d’un domaine secondaire (par exemple trycleads.com).`)
  }
  await assertOwner(user.workspaceId, input.ownerId)
  const exists = await prisma.mailbox.findUnique({ where: { workspaceId_address: { workspaceId: user.workspaceId, address: input.address } }, select: { id: true } })
  if (exists) throw new LeadError("duplicate", "Cette boîte est déjà enregistrée.", 409)
  const created = await prisma.mailbox.create({
    data: {
      workspaceId: user.workspaceId,
      ownerId: input.ownerId,
      address: input.address,
      displayName: input.displayName,
      smtpHost: input.smtpHost,
      smtpPort: input.smtpPort,
      smtpSecure: input.smtpSecure,
      username: input.username,
      secret: seal(input.password),
      imapHost: input.imapHost ?? null,
      imapPort: input.imapHost ? (input.imapPort ?? (input.imapSecure ? 993 : 143)) : null,
      imapSecure: input.imapSecure,
      sentFolder: input.sentFolder,
      dailyCap: input.dailyCap,
      signature: input.signature,
      warmupStartedAt: input.alreadyWarm ? warmedUpStart() : new Date(),
    },
  })
  const test = await runTest(created)
  await audit({ action: "mailbox.created", actorId: user.id, workspaceId: user.workspaceId, entityType: "Mailbox", entityId: created.id, subject: created.address, metadata: { ownerId: input.ownerId, dailyCap: input.dailyCap, alreadyWarm: input.alreadyWarm, testOk: test.ok }, ip })
  return { mailbox: await getMailbox(user, created.id), test }
}

export async function getMailbox(user: CurrentUser, id: string): Promise<MailboxView> {
  const m = await prisma.mailbox.findFirst({ where: { id, workspaceId: user.workspaceId }, include: withOwner })
  if (!m) throw new LeadError("not_found", "Boîte introuvable.", 404)
  return toView(m)
}

const CONNECTION_FIELDS = ["smtpHost", "smtpPort", "smtpSecure", "username", "password", "imapHost", "imapPort", "imapSecure", "sentFolder"] as const

export async function updateMailbox(user: CurrentUser, id: string, patch: UpdateMailboxInput, ip?: string | null): Promise<{ mailbox: MailboxView; test: TestResult | null }> {
  const m = await prisma.mailbox.findFirst({ where: { id, workspaceId: user.workspaceId } })
  if (!m) throw new LeadError("not_found", "Boîte introuvable.", 404)
  if (patch.address && patch.address !== m.address) throw new LeadError("invalid", "L’adresse d’une boîte ne change pas : ajoutez une nouvelle boîte.")
  if (patch.ownerId !== undefined) await assertOwner(user.workspaceId, patch.ownerId)
  if (patch.password) assertSecretBox()

  const data: Prisma.MailboxUpdateInput = {}
  if (patch.displayName !== undefined) data.displayName = patch.displayName
  if (patch.ownerId !== undefined) data.owner = patch.ownerId ? { connect: { id: patch.ownerId } } : { disconnect: true }
  if (patch.smtpHost !== undefined) data.smtpHost = patch.smtpHost
  if (patch.smtpPort !== undefined) data.smtpPort = patch.smtpPort
  if (patch.smtpSecure !== undefined) data.smtpSecure = patch.smtpSecure
  if (patch.username !== undefined) data.username = patch.username
  if (patch.password) data.secret = seal(patch.password)
  if (patch.imapHost !== undefined) {
    data.imapHost = patch.imapHost ?? null
    if (!patch.imapHost) data.imapPort = null
  }
  if (patch.imapPort !== undefined && patch.imapHost !== null) data.imapPort = patch.imapPort
  if (patch.imapSecure !== undefined) data.imapSecure = patch.imapSecure
  if (patch.sentFolder !== undefined) data.sentFolder = patch.sentFolder
  if (patch.dailyCap !== undefined) data.dailyCap = patch.dailyCap
  if (patch.signature !== undefined) data.signature = patch.signature
  if (patch.restartWarmup) data.warmupStartedAt = new Date()
  if (patch.status === "PAUSED") Object.assign(data, { status: "PAUSED", statusReason: `Mise en pause par ${user.name || user.email}` })

  const connectionChanged = CONNECTION_FIELDS.some((f) => patch[f] !== undefined && (f !== "password" || !!patch.password))
  // A mailbox that resumes, or whose connection changed, sends again only once a fresh test passes.
  const resuming = patch.status === "ACTIVE" && m.status !== "ACTIVE"
  const updated = await prisma.mailbox.update({ where: { id }, data })
  const test = connectionChanged || resuming ? await runTest(updated, { activate: resuming }) : null

  await audit({
    action: "mailbox.updated",
    actorId: user.id,
    workspaceId: user.workspaceId,
    entityType: "Mailbox",
    entityId: id,
    subject: m.address,
    // Never the password, only that it changed.
    metadata: { fields: Object.keys(patch).filter((k) => k !== "password" || patch.password), testOk: test?.ok ?? null },
    ip,
  })
  return { mailbox: await getMailbox(user, id), test }
}

export async function testMailbox(user: CurrentUser, id: string): Promise<{ mailbox: MailboxView; test: TestResult }> {
  const m = await prisma.mailbox.findFirst({ where: { id, workspaceId: user.workspaceId } })
  if (!m) throw new LeadError("not_found", "Boîte introuvable.", 404)
  const test = await runTest(m)
  await audit({ action: "mailbox.tested", actorId: user.id, workspaceId: user.workspaceId, entityType: "Mailbox", entityId: id, subject: m.address, metadata: { ok: test.ok } })
  return { mailbox: await getMailbox(user, id), test }
}

/** A mailbox that has sent anything stays: its messages count in the history and the quotas. Pause it instead. */
export async function deleteMailbox(user: CurrentUser, id: string, ip?: string | null): Promise<void> {
  const m = await prisma.mailbox.findFirst({ where: { id, workspaceId: user.workspaceId }, include: { _count: { select: { messages: true } } } })
  if (!m) throw new LeadError("not_found", "Boîte introuvable.", 404)
  if (m._count.messages > 0) throw new LeadError("conflict", "Cette boîte a déjà envoyé des emails : mettez-la en pause plutôt que de la supprimer.", 409)
  await prisma.mailbox.delete({ where: { id } })
  await audit({ action: "mailbox.deleted", actorId: user.id, workspaceId: user.workspaceId, entityType: "Mailbox", entityId: id, subject: m.address, ip })
}
