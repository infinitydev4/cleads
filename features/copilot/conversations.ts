import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { utc } from "@/lib/ai/sql"
import { microsToEur } from "@/lib/ai/budget"
import { LeadError } from "@/features/leads/errors"
import { titleOf, type CopilotMessage, type CopilotMetadata, type QuestionContext } from "./messages"

/**
 * The copilot's conversations (E24, docs/crm-v1/AGENTS-IA.md §17). A conversation belongs to its person alone: nobody
 * else lists or reads it, managers included. It is deleted when they ask, with any fiche it read (the AI data of a
 * fiche follows the fiche), and 90 days after its last message.
 */
export { KEEP_DAYS } from "./forget"
/** A turn holds the conversation at most this long: past it, a request that died without saying so frees it. */
export const TURN_LOCK_MS = 3 * 60_000

type Db = Prisma.TransactionClient | typeof prisma

export interface ConversationSummary {
  id: string
  title: string
  /** Where it was started. */
  label: string | null
  lastMessageAt: string
  messages: number
  costEur: number
}

export interface ConversationView extends ConversationSummary {
  history: CopilotMessage[]
  /** A turn is in progress (in another tab, or one that has not ended yet). */
  busy: boolean
}

function assertUse(user: CurrentUser) {
  if (!can(user.role, "ai:use")) throw new LeadError("forbidden", "Votre rôle ne permet pas d'utiliser le copilote.", 403)
}

const labelOf = (context: unknown) => (context && typeof context === "object" && typeof (context as { label?: unknown }).label === "string" ? (context as { label: string }).label : null)

function summary(c: { id: string; title: string; context: unknown; lastMessageAt: Date; messageCount: number; costMicros: number }): ConversationSummary {
  return { id: c.id, title: c.title, label: labelOf(c.context), lastMessageAt: c.lastMessageAt.toISOString(), messages: c.messageCount, costEur: microsToEur(c.costMicros) }
}

/** The person's conversations, latest first. */
export async function listConversations(user: CurrentUser, opts: { limit?: number } = {}): Promise<ConversationSummary[]> {
  assertUse(user)
  const rows = await prisma.aiConversation.findMany({
    where: { workspaceId: user.workspaceId, userId: user.id },
    orderBy: { lastMessageAt: "desc" },
    take: Math.min(opts.limit ?? 30, 100),
    select: { id: true, title: true, context: true, lastMessageAt: true, messageCount: true, costMicros: true },
  })
  return rows.map(summary)
}

async function own(user: CurrentUser, id: string) {
  const c = await prisma.aiConversation.findFirst({ where: { id, workspaceId: user.workspaceId, userId: user.id } })
  if (!c) throw new LeadError("not_found", "Conversation introuvable.", 404)
  return c
}

const toMessage = (m: { uiId: string; role: "USER" | "ASSISTANT"; parts: unknown; metadata: unknown }): CopilotMessage => ({
  id: m.uiId,
  role: m.role === "USER" ? "user" : "assistant",
  parts: (Array.isArray(m.parts) ? m.parts : []) as CopilotMessage["parts"],
  ...(m.metadata && typeof m.metadata === "object" ? { metadata: m.metadata as CopilotMetadata } : {}),
})

/** The messages of a conversation, in order. */
export async function loadMessages(conversationId: string, db: Db = prisma): Promise<CopilotMessage[]> {
  const rows = await db.aiMessage.findMany({ where: { conversationId }, orderBy: { seq: "asc" }, select: { uiId: true, role: true, parts: true, metadata: true } })
  return rows.map(toMessage)
}

const busySince = (startedAt: Date | null, now = new Date()) => !!startedAt && now.getTime() - startedAt.getTime() < TURN_LOCK_MS

export async function getConversation(user: CurrentUser, id: string): Promise<ConversationView> {
  assertUse(user)
  const c = await own(user, id)
  return { ...summary(c), history: await loadMessages(c.id), busy: busySince(c.turnStartedAt) }
}

export async function deleteConversation(user: CurrentUser, id: string): Promise<void> {
  assertUse(user)
  await own(user, id)
  await prisma.aiConversation.delete({ where: { id } })
  await audit({ action: "ai.conversation_deleted", actorId: user.id, workspaceId: user.workspaceId, entityType: "AiConversation", entityId: id })
}

/** « Tout effacer » : every conversation of the person. */
export async function deleteAllConversations(user: CurrentUser): Promise<number> {
  assertUse(user)
  const { count } = await prisma.aiConversation.deleteMany({ where: { workspaceId: user.workspaceId, userId: user.id } })
  if (count) await audit({ action: "ai.conversations_deleted", actorId: user.id, workspaceId: user.workspaceId, entityType: "AiConversation", metadata: { count } })
  return count
}

/** A new conversation, started by its first question. */
export async function createConversation(user: CurrentUser, firstQuestion: string, context: QuestionContext | null): Promise<string> {
  const c = await prisma.aiConversation.create({
    data: {
      workspaceId: user.workspaceId,
      userId: user.id,
      title: titleOf(firstQuestion),
      context: context ? { path: context.path, label: context.label } : undefined,
      leadIds: context?.leadId ? [context.leadId] : [],
    },
    select: { id: true },
  })
  return c.id
}

/** The person's conversation, for a new turn. */
export async function conversationFor(user: CurrentUser, id: string) {
  return own(user, id)
}

/**
 * Takes the conversation for one turn: false when another turn holds it. A turn that died without releasing it (a
 * request cut by the platform) stops holding it after TURN_LOCK_MS.
 */
export async function takeTurn(conversationId: string, now = new Date()): Promise<boolean> {
  const stale = new Date(now.getTime() - TURN_LOCK_MS)
  const taken = await prisma.$executeRaw`
    UPDATE "AiConversation" SET "turnStartedAt" = ${utc(now)}, "updatedAt" = ${utc(now)}
     WHERE "id" = ${conversationId} AND ("turnStartedAt" IS NULL OR "turnStartedAt" < ${utc(stale)})`
  return taken === 1
}

export async function releaseTurn(conversationId: string): Promise<void> {
  await prisma.aiConversation.updateMany({ where: { id: conversationId }, data: { turnStartedAt: null } })
}

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue

/**
 * Writes a message: replaces it when it exists (an answer continued after an approval), or adds it at the end. The
 * order comes from the conversation's counter, taken in the same statement, so two writes never share a place.
 */
export async function saveMessage(conversationId: string, message: CopilotMessage, opts: { runId?: string | null } = {}): Promise<void> {
  const role = message.role === "user" ? "USER" : "ASSISTANT"
  const data = { parts: json(message.parts), metadata: message.metadata ? json(message.metadata) : undefined, ...(opts.runId !== undefined ? { runId: opts.runId } : {}) }
  await prisma.$transaction(async (tx) => {
    const existing = await tx.aiMessage.findUnique({ where: { conversationId_uiId: { conversationId, uiId: message.id } }, select: { id: true, role: true } })
    if (existing) {
      if (existing.role !== role) throw new LeadError("conflict", "Message incohérent avec la conversation.", 409)
      await tx.aiMessage.update({ where: { id: existing.id }, data })
      return
    }
    const now = utc(new Date())
    const [row] = await tx.$queryRaw<{ messageCount: number }[]>`
      UPDATE "AiConversation" SET "messageCount" = "messageCount" + 1, "lastMessageAt" = ${now}, "updatedAt" = ${now}
       WHERE "id" = ${conversationId}
   RETURNING "messageCount"`
    if (!row) throw new LeadError("not_found", "Conversation introuvable.", 404)
    await tx.aiMessage.create({ data: { conversationId, uiId: message.id, seq: row.messageCount, role, ...data } })
  })
}

const LEAD_ID = /^[a-z0-9]{8,40}$/i

/** The conversation now follows these fiches: it is erased with any of them. None is ever dropped from the list. */
export async function followLeads(conversationId: string, leadIds: readonly string[]): Promise<void> {
  const ids = [...new Set(leadIds)].filter((id) => LEAD_ID.test(id))
  if (!ids.length) return
  await prisma.$executeRaw`
    UPDATE "AiConversation"
       SET "leadIds" = (SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::text[]) FROM unnest(COALESCE("leadIds", ARRAY[]::text[]) || ${ids}::text[]) AS x)
     WHERE "id" = ${conversationId}`
}

/** After a turn: what it cost, and the fiches it read or acted on. Frees the conversation for the next turn. */
export async function closeTurn(conversationId: string, input: { costMicros: number; leadIds: readonly string[] }): Promise<void> {
  await followLeads(conversationId, input.leadIds)
  const now = utc(new Date())
  await prisma.$executeRaw`
    UPDATE "AiConversation"
       SET "costMicros" = "costMicros" + ${Math.max(Math.round(input.costMicros), 0)}, "turnStartedAt" = NULL, "lastMessageAt" = ${now}, "updatedAt" = ${now}
     WHERE "id" = ${conversationId}`
}
