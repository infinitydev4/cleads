import { PageHeader } from "@/components/crm/page-header"
import { requirePagePermission } from "@/lib/auth/guard"
import { can, scopeOf } from "@/lib/rbac"
import { getAvailability, listHosts, listToClose } from "@/features/meetings/service"
import { Agenda } from "./agenda"

export const metadata = { title: "Rendez-vous" }
export const dynamic = "force-dynamic"

export default async function MeetingsPage() {
  const { user } = await requirePagePermission("meeting:read")
  const canManageAvailability = can(user.role, "availability:manage")
  const [hosts, toClose, availability] = await Promise.all([listHosts(user), listToClose(user), canManageAvailability ? getAvailability(user).catch(() => null) : null])
  return (
    <>
      <PageHeader
        title="Rendez-vous"
        description="Ton agenda. Un rendez-vous passé se clôture en indiquant son résultat : c’est lui qui fait avancer l’opportunité."
        breadcrumbs={[{ label: "CRM", href: "/app" }, { label: "Rendez-vous" }]}
      />
      <Agenda
        hosts={hosts}
        initialToClose={toClose}
        currentUserId={user.id}
        canFilterHosts={scopeOf(user.role, "meeting:read") === "all"}
        canManageAvailability={canManageAvailability}
        availability={availability ? { windows: availability.windows, publicUrl: availability.publicUrl, enabled: availability.profile.enabled } : null}
        canAct={can(user.role, "meeting:book")}
        canOutcome={can(user.role, "meeting:outcome")}
        isManager={user.role === "OWNER" || user.role === "MANAGER"}
      />
    </>
  )
}
