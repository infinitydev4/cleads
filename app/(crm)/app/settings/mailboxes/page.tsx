import { PageHeader } from "@/components/crm/page-header"
import { requirePagePermission } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { toCrmRole } from "@/lib/crm/roles"
import { secretBoxConfigured } from "@/lib/crypto/secret-box"
import { listAssignees } from "@/features/leads/service"
import { listMailboxes, protectedDomains } from "@/features/outreach/mailboxes"
import { MailboxesManager } from "./mailboxes-manager"

export const metadata = { title: "Boîtes d’envoi" }
export const dynamic = "force-dynamic"

export default async function MailboxesPage() {
  const { user } = await requirePagePermission("mailbox:manage")
  const [mailboxes, members] = await Promise.all([listMailboxes(user), listAssignees(user)])
  const senders = members.filter((m) => {
    const role = toCrmRole(m.role)
    return role && can(role, "email:send")
  })
  return (
    <>
      <PageHeader
        title="Boîtes d’envoi"
        description="Les boîtes de prospection, sur des domaines secondaires. Chaque boîte a un plafond par jour qui monte pendant la chauffe ; un message ne part que si la boîte répond au test de connexion."
        breadcrumbs={[{ label: "CRM", href: "/app" }, { label: "Boîtes d’envoi" }]}
      />
      <MailboxesManager initial={mailboxes} senders={senders} canSeal={secretBoxConfigured()} protectedDomains={protectedDomains()} />
    </>
  )
}
