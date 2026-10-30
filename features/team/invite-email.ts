import { sendMail } from "@/lib/mail"
import { ROLE_LABELS, type CrmRole } from "@/lib/crm/roles"

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

export const appBaseUrl = () =>
  (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "")

export const invitationLink = (token: string) => `${appBaseUrl()}/auth/invite/${token}`

/**
 * Transactional email (provider chosen in the settings). Returns false when it could not be sent; the inviter always also
 * gets the link, so access never depends on email delivery.
 */
export async function sendInvitationEmail(input: { to: string; role: CrmRole; inviterName: string; link: string }): Promise<boolean> {
  const outcome = await sendMail(
    {
      to: input.to,
      subject: "Votre accès au CRM Cleads",
      html: `
        <p>Bonjour,</p>
        <p>${escapeHtml(input.inviterName)} vous invite à rejoindre le CRM Cleads avec le rôle <strong>${escapeHtml(ROLE_LABELS[input.role])}</strong>.</p>
        <p><a href="${escapeHtml(input.link)}">Créer mon accès</a></p>
        <p>Ce lien est personnel, valable 7 jours et ne peut servir qu'une fois. Si vous n'attendiez pas cette invitation, ignorez ce message.</p>
        <p>L'équipe Cleads</p>`,
    },
    { purpose: "transactional" }
  )
  return outcome.ok
}
