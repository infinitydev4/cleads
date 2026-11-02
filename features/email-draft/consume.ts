import type { DraftKind } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { editRatio } from "./edits"

/**
 * Links a sent message to the draft it came from, with how much the person changed it (E22, measured for E27). A draft
 * that is missing, of another fiche or already used is ignored: a draft never blocks a send.
 */
export async function consumeDraft(
  where: { draftId: string; workspaceId: string; kind: DraftKind; leadId: string; replyToId?: string },
  sent: { emailId: string; subject: string; body: string }
): Promise<number | null> {
  const draft = await prisma.emailDraft.findFirst({
    where: { id: where.draftId, workspaceId: where.workspaceId, kind: where.kind, leadId: where.leadId, ...(where.replyToId ? { replyToId: where.replyToId } : {}), sentEmailId: null },
    select: { id: true, subject: true, body: true },
  })
  if (!draft) return null
  const ratio = editRatio(`${draft.subject}\n${draft.body}`, `${sent.subject}\n${sent.body}`)
  const res = await prisma.emailDraft.updateMany({ where: { id: draft.id, sentEmailId: null }, data: { sentEmailId: sent.emailId, sentAt: new Date(), editRatio: ratio } })
  return res.count ? ratio : null
}
