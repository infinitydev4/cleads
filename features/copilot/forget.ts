import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

/**
 * When the copilot's conversations go (E24): with any fiche they read, since the AI data of a fiche follows the fiche,
 * and 90 days after their last message. Kept apart from the service so the fiche's deletion and the worker's
 * maintenance import nothing else.
 */
export const KEEP_DAYS = 90

/** A fiche is erased: so are the conversations that read it (called inside the deletion's transaction). */
export async function forgetLead(tx: Prisma.TransactionClient | typeof prisma, workspaceId: string, leadId: string): Promise<number> {
  const { count } = await tx.aiConversation.deleteMany({ where: { workspaceId, leadIds: { has: leadId } } })
  return count
}

/** Worker maintenance: conversations without a message for KEEP_DAYS are deleted. */
export async function purgeConversations(now = new Date()): Promise<number> {
  const { count } = await prisma.aiConversation.deleteMany({ where: { lastMessageAt: { lt: new Date(now.getTime() - KEEP_DAYS * 86_400_000) } } })
  return count
}
