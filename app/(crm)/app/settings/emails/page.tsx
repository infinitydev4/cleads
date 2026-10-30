import { PageHeader } from "@/components/crm/page-header"
import { requirePagePermission } from "@/lib/auth/guard"
import { mailStatus } from "@/lib/mail/status"
import { EmailSettings } from "./email-settings"

export const metadata = { title: "Fournisseurs d’envoi" }
export const dynamic = "force-dynamic"

export default async function EmailSettingsPage() {
  const { user } = await requirePagePermission("mailbox:manage")
  const status = await mailStatus(user.workspaceId)
  return (
    <>
      <PageHeader
        title="Fournisseurs d’envoi"
        description="Par où partent les emails du CRM : confirmations et rappels de rendez-vous, invitations, notifications. La prospection à froid ne passe jamais ici : elle utilise des boîtes dédiées."
        breadcrumbs={[{ label: "CRM", href: "/app" }, { label: "Fournisseurs d’envoi" }]}
      />
      <EmailSettings initial={status} email={user.email} />
    </>
  )
}
