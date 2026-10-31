import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import { verifyUnsubscribeToken } from "./compose"
import { stopForEmail } from "./stops"

/** "j•••@exemple.fr": enough for the person to recognise their address, not enough to harvest it from the page. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@")
  if (at < 1) return "•••"
  return `${email[0]}•••${email.slice(at)}`
}

async function messageOf(token: string) {
  const id = verifyUnsubscribeToken(token)
  if (!id) return null
  return prisma.emailMessage.findUnique({ where: { id }, select: { id: true, workspaceId: true, toEmail: true, leadId: true, isTest: true } })
}

/** What the unsubscribe page shows. Null for a link that was not issued by us. */
export async function unsubscribeStatus(token: string): Promise<{ email: string; done: boolean } | null> {
  const m = await messageOf(token)
  if (!m) return null
  const existing = await prisma.suppression.findUnique({ where: { workspaceId_email: { workspaceId: m.workspaceId, email: m.toEmail } }, select: { id: true } })
  return { email: maskEmail(m.toEmail), done: !!existing }
}

/**
 * Stops all prospecting to the address: it joins the exclusion list (which every send checks, transactional mail
 * excepted) and its contact is marked "do not contact". Clicking twice, or the mail client's one-click and then the
 * page, changes nothing more. A stronger reason already on file (bounce, complaint) is kept.
 */
export async function unsubscribe(token: string, ip?: string | null): Promise<boolean> {
  const m = await messageOf(token)
  if (!m) return false
  const { workspaceId, toEmail: email } = m
  // Attributes the opt-out to the mailbox that sent the message (deliverability), once.
  await prisma.emailMessage.updateMany({ where: { id: m.id, unsubscribedAt: null }, data: { unsubscribedAt: new Date() } })
  const created = await prisma
    .$transaction(async (tx) => {
      const existing = await tx.suppression.findUnique({ where: { workspaceId_email: { workspaceId, email } } })
      if (existing) return false
      await tx.suppression.create({ data: { workspaceId, email, reason: "UNSUBSCRIBED", source: "lien de désinscription" } })
      await tx.contact.updateMany({ where: { workspaceId, email, doNotContact: false }, data: { doNotContact: true, doNotContactReason: "Désinscrit des emails de prospection" } })
      if (m.leadId) {
        await tx.activity.create({
          data: { workspaceId, leadId: m.leadId, actorKind: "SYSTEM", kind: "EMAIL", body: "Désinscription des emails de prospection", data: { event: "unsubscribed", emailId: m.id, to: email } },
        })
      }
      return true
    })
    // The one-click request and the page can arrive together: the second one finds the row the first just wrote.
    .catch((error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false
      throw error
    })
  // Also when the address was already excluded: a running sequence must not outlive it.
  await stopForEmail(prisma, workspaceId, email, "UNSUBSCRIBED")
  if (created) await audit({ action: "email.unsubscribed", workspaceId, actorKind: "SYSTEM", entityType: "EmailMessage", entityId: m.id, subject: email, ip })
  return true
}
