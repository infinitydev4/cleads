import { PageHeader } from "@/components/crm/page-header"
import { requirePagePermission } from "@/lib/auth/guard"
import { scopeOf } from "@/lib/rbac"
import { getAvailability, listHosts } from "@/features/meetings/service"
import { AvailabilityForm } from "./availability-form"

export const metadata = { title: "Disponibilités" }
export const dynamic = "force-dynamic"

export default async function AvailabilityPage(props: { searchParams: Promise<{ host?: string }> }) {
  const { user } = await requirePagePermission("availability:manage")
  const { host } = await props.searchParams
  const [initial, hosts] = await Promise.all([getAvailability(user, host), listHosts(user)])
  const others = scopeOf(user.role, "availability:manage") === "all"
  return (
    <>
      <PageHeader
        title="Disponibilités"
        description="Vos horaires de rendez-vous, vos jours fermés et votre page de réservation publique. Un créneau n’est proposé que s’il est dans ces horaires, loin de vos autres rendez-vous et assez à l’avance."
        breadcrumbs={[{ label: "CRM", href: "/app" }, { label: "Rendez-vous", href: "/app/meetings" }, { label: "Disponibilités" }]}
      />
      <AvailabilityForm key={initial.hostId} initial={initial} hosts={others ? hosts.map((h) => ({ id: h.id, name: h.name })) : []} />
    </>
  )
}
