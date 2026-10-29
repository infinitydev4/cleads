import { PageHeader } from "@/components/crm/page-header"
import { requirePagePermission } from "@/lib/auth/guard"
import { ImportWizard } from "./import-wizard"

export const metadata = { title: "Importer des prospects" }

export default async function ImportPage() {
  await requirePagePermission("lead:import")
  return (
    <>
      <PageHeader
        title="Importer des prospects"
        description="Un fichier CSV (export Excel, annuaire, outil de prospection). Vous vérifiez tout avant que rien ne soit écrit, et rejouer le même fichier n’ajoute aucun doublon."
        breadcrumbs={[{ label: "CRM", href: "/app" }, { label: "Prospects", href: "/app/leads" }, { label: "Importer" }]}
      />
      <ImportWizard />
    </>
  )
}
