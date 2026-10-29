import { notFound } from "next/navigation"
import { PageHeader } from "@/components/crm/page-header"
import { requirePagePermission } from "@/lib/auth/guard"
import { LeadError } from "@/features/leads/errors"
import { getLead, listAssignees } from "@/features/leads/service"
import { LeadPageClient } from "./lead-page-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "Fiche prospect" }

export default async function LeadPage(props: { params: Promise<{ id: string }> }) {
  const { user } = await requirePagePermission("lead:read")
  const { id } = await props.params
  const lead = await getLead(user, id).catch((e) => (e instanceof LeadError && e.code === "not_found" ? null : Promise.reject(e)))
  if (!lead) notFound()
  const assignees = await listAssignees(user)

  return (
    <>
      <PageHeader title="Fiche prospect" breadcrumbs={[{ label: "CRM", href: "/app" }, { label: "Prospects", href: "/app/leads" }, { label: lead.company?.name ?? lead.contact?.name ?? "Fiche" }]} />
      <div className="mx-auto max-w-3xl">
        <LeadPageClient initial={lead} assignees={assignees} currentUserId={user.id} />
      </div>
    </>
  )
}
