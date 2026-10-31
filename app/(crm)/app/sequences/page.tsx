import { PageHeader } from "@/components/crm/page-header"
import { requirePagePermission } from "@/lib/auth/guard"
import { listSequences } from "@/features/outreach/sequences"
import { SequencesView } from "./sequences-view"

export const metadata = { title: "Séquences" }
export const dynamic = "force-dynamic"

export default async function SequencesPage() {
  const { user } = await requirePagePermission("sequence:manage")
  const sequences = await listSequences(user)
  return (
    <>
      <PageHeader
        title="Séquences"
        description="Un premier message puis jusqu’à trois relances, envoyées toutes seules. On inscrit des prospects depuis la liste des Prospects."
        breadcrumbs={[{ label: "CRM", href: "/app" }, { label: "Séquences" }]}
      />
      <SequencesView initial={sequences} />
    </>
  )
}
