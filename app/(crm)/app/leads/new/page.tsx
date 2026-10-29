import { PageHeader } from "@/components/crm/page-header"
import { requirePagePermission } from "@/lib/auth/guard"
import { NewLeadForm } from "./new-lead-form"

export const metadata = { title: "Nouveau prospect" }

export default async function NewLeadPage() {
  await requirePagePermission("lead:write")
  return (
    <>
      <PageHeader title="Nouveau prospect" description="Une entreprise, et si vous l’avez, la personne à contacter. Si elle existe déjà, vous êtes redirigé vers sa fiche." breadcrumbs={[{ label: "CRM", href: "/app" }, { label: "Prospects", href: "/app/leads" }, { label: "Nouveau" }]} />
      <NewLeadForm />
    </>
  )
}
