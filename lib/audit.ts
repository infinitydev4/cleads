import type { AuditActorKind, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export interface AuditEntry {
  /** `domain.verb`, e.g. `auth.login_failed`, `team.role_changed`. */
  action: string
  actorId?: string | null
  actorKind?: AuditActorKind
  workspaceId?: string | null
  entityType?: string
  entityId?: string
  /** Email or identifier the action is about when there is no entity. */
  subject?: string
  metadata?: Prisma.InputJsonValue
  ip?: string | null
}

/**
 * Appends to the audit log. A failure to write it is logged and never breaks the action itself,
 * except where the caller awaits and checks (sign-in lockout reads the log, it does not depend on this return).
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        actorId: entry.actorId ?? null,
        actorKind: entry.actorKind ?? (entry.actorId ? "USER" : "SYSTEM"),
        workspaceId: entry.workspaceId ?? null,
        entityType: entry.entityType,
        entityId: entry.entityId,
        subject: entry.subject?.toLowerCase(),
        metadata: entry.metadata,
        ip: entry.ip ?? null,
      },
    })
  } catch (error) {
    console.error("[AUDIT_WRITE_FAILED]", entry.action, error)
  }
}
