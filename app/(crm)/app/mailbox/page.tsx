import Link from "next/link"
import { PageHeader } from "@/components/crm/page-header"
import { Button } from "@/components/ui/button"
import { requirePagePermission } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { usableMailboxes } from "@/features/outreach/mailboxes"
import { listEmails } from "@/features/outreach/service"
import { deliverability } from "@/features/outreach/deliverability"
import { listReplies } from "@/features/outreach/replies"
import { listTemplates } from "@/features/outreach/templates"
import { MailboxView } from "./mailbox-view"

export const metadata = { title: "Emails" }
export const dynamic = "force-dynamic"

export default async function MailboxPage() {
  const { user } = await requirePagePermission("email:send")
  const [emails, mailboxes, templates, replies, health] = await Promise.all([listEmails(user, { direction: "OUTBOUND" }), usableMailboxes(user), listTemplates(user), listReplies(user), deliverability(user)])
  const team = user.role === "OWNER" || user.role === "MANAGER"
  return (
    <>
      <PageHeader
        title="Emails"
        description={`${team ? "Les emails de prospection de l’équipe" : "Vos emails de prospection"}, et les modèles pour les écrire. On écrit à un prospect depuis sa fiche.`}
        breadcrumbs={[{ label: "CRM", href: "/app" }, { label: "Emails" }]}
        actions={can(user.role, "mailbox:manage") && <Button asChild variant="outline"><Link href="/app/settings/mailboxes">Boîtes d’envoi</Link></Button>}
      />
      <MailboxView initialEmails={emails} initialReplies={replies} health={health} mailboxes={mailboxes} initialTemplates={templates} canManageTemplates={can(user.role, "sequence:manage")} showSender={team} />
    </>
  )
}
