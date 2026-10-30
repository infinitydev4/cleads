import { PageHeader } from "@/components/crm/page-header"
import { requirePagePermission } from "@/lib/auth/guard"
import { can, scopeOf } from "@/lib/rbac"
import { listHosts, listToClose } from "@/features/meetings/service"
import { Agenda } from "./agenda"

export const metadata = { title: "Rendez-vous" }
export const dynamic = "force-dynamic"

export default async function MeetingsPage() {
  const { user } = await requirePagePermission("meeting:read")
  const [hosts, toClose] = await Promise.all([listHosts(user), listToClose(user)])
  return (
    <>
      <PageHeader
        title="Rendez-vous"
        description="L’agenda de l’équipe. Un rendez-vous passé reste à clôturer tant que son résultat n’est pas indiqué : c’est lui qui fait avancer l’opportunité."
        breadcrumbs={[{ label: "CRM", href: "/app" }, { label: "Rendez-vous" }]}
      />
      <Agenda
        hosts={hosts}
        initialToClose={toClose}
        currentUserId={user.id}
        canFilterHosts={scopeOf(user.role, "meeting:read") === "all"}
        canManageAvailability={can(user.role, "availability:manage")}
        canAct={can(user.role, "meeting:book")}
        canOutcome={can(user.role, "meeting:outcome")}
        isManager={user.role === "OWNER" || user.role === "MANAGER"}
      />
    </>
  )
}
