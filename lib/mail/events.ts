import type { SuppressionReason } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import { normalizeEmail } from "@/lib/crm/normalize"

export interface SuppressionTarget {
  email: string
  reason: SuppressionReason
  detail: string
}

interface SesEvent {
  eventType?: string
  notificationType?: string
  bounce?: { bounceType?: string; bounceSubType?: string; bouncedRecipients?: { emailAddress?: string; diagnosticCode?: string }[] }
  complaint?: { complaintFeedbackType?: string; complainedRecipients?: { emailAddress?: string }[] }
}

/**
 * What an SES event asks us to stop sending to. A permanent bounce means the address does not exist or refuses mail for
 * good; a complaint means the person marked a message as spam. Temporary trouble (full mailbox, server down) does not
 * suppress anything: the address may work tomorrow.
 */
export function suppressionTargets(raw: unknown): SuppressionTarget[] {
  const e = (raw ?? {}) as SesEvent
  const kind = e.eventType ?? e.notificationType
  const out: SuppressionTarget[] = []
  if (kind === "Bounce" && e.bounce?.bounceType === "Permanent") {
    for (const r of e.bounce.bouncedRecipients ?? []) {
      const email = normalizeEmail(r.emailAddress)
      if (email) out.push({ email, reason: "BOUNCED", detail: [e.bounce.bounceSubType, r.diagnosticCode].filter(Boolean).join(" · ").slice(0, 300) })
    }
  } else if (kind === "Complaint") {
    for (const r of e.complaint?.complainedRecipients ?? []) {
      const email = normalizeEmail(r.emailAddress)
      if (email) out.push({ email, reason: "COMPLAINED", detail: e.complaint?.complaintFeedbackType ?? "plainte" })
    }
  }
  return out
}

/** Records the suppressions and stops contacting those people everywhere in the CRM. Replays change nothing. */
export async function applySuppressions(workspaceId: string, targets: SuppressionTarget[]): Promise<number> {
  let added = 0
  for (const t of targets) {
    const existing = await prisma.suppression.findUnique({ where: { workspaceId_email: { workspaceId, email: t.email } } })
    if (!existing) {
      await prisma.suppression.create({ data: { workspaceId, email: t.email, reason: t.reason, source: "ses" } })
      added++
    } else if (existing.reason === "MANUAL" || existing.reason === "UNSUBSCRIBED") {
      // A complaint outranks an earlier unsubscribe or a manual entry: keep the strongest reason.
      if (t.reason === "COMPLAINED") await prisma.suppression.update({ where: { id: existing.id }, data: { reason: t.reason, source: "ses" } })
    }
    await prisma.contact.updateMany({
      where: { workspaceId, email: t.email, doNotContact: false },
      data: { doNotContact: true, doNotContactReason: t.reason === "BOUNCED" ? "Adresse en rebond définitif (SES)" : "Plainte pour spam (SES)" },
    })
    await audit({ action: t.reason === "BOUNCED" ? "mail.bounce" : "mail.complaint", workspaceId, actorKind: "SYSTEM", subject: t.email, metadata: { detail: t.detail } })
  }
  return added
}
