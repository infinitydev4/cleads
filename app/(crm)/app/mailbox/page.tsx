import Link from "next/link"
import { PageHeader } from "@/components/crm/page-header"
import { Button } from "@/components/ui/button"
import { requirePagePermission } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { usableMailboxes } from "@/features/outreach/mailboxes"
import { listEmails } from "@/features/outreach/service"
import { listTemplates } from "@/features/outreach/templates"
import { MailboxView } from "./mailbox-view"

export const metadata = { title: "Emails" }
export const dynamic = "force-dynamic"

export default async function MailboxPage() {
  const { user } = await requirePagePermission("email:send")
  const [emails, mailboxes, templates] = await Promise.all([listEmails(user), usableMailboxes(user), listTemplates(user)])
  const team = user.role === "OWNER" || user.role === "MANAGER"
  return (
    <>
      <PageHeader
        title="Emails"
        description={`${team ? "Les emails de prospection de l’équipe" : "Vos emails de prospection"}, et les modèles pour les écrire. On écrit à un prospect depuis sa fiche.`}
        breadcrumbs={[{ label: "CRM", href: "/app" }, { label: "Emails" }]}
        actions={can(user.role, "mailbox:manage") && <Button asChild variant="outline"><Link href="/app/settings/mailboxes">Boîtes d’envoi</Link></Button>}
      />
      <MailboxView initialEmails={emails} mailboxes={mailboxes} initialTemplates={templates} canManageTemplates={can(user.role, "sequence:manage")} showSender={team} />
    </>
  )
}
