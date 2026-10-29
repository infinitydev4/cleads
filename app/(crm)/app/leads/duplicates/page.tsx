import { PageHeader } from "@/components/crm/page-header"
import { requirePagePermission } from "@/lib/auth/guard"
import { findDuplicateGroups } from "@/features/leads/duplicates"
import { DuplicatesList } from "./duplicates-list"

export const metadata = { title: "Doublons" }
export const dynamic = "force-dynamic"

export default async function DuplicatesPage() {
  const { user } = await requirePagePermission("lead:merge")
  const groups = await findDuplicateGroups(user)
  return (
    <>
      <PageHeader
        title="Doublons"
        description="Fiches qui semblent décrire la même entreprise. Rien n’est fusionné automatiquement : vous choisissez celle à garder, l’autre disparaît en laissant son historique, ses rendez-vous et ses informations manquantes sur la fiche gardée."
        breadcrumbs={[{ label: "CRM", href: "/app" }, { label: "Prospects", href: "/app/leads" }, { label: "Doublons" }]}
      />
      <DuplicatesList groups={groups} />
    </>
  )
}
