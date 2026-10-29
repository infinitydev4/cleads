import { Metadata } from "next"
import { PageHeader } from "@/components/crm/page-header"
import { DesignCatalogue } from "./catalogue"

export const metadata: Metadata = { title: "Design system" }

export default function DesignPage() {
  return (
    <>
      <PageHeader
        title="Design system"
        description="Jetons et composants du CRM, tirés de la home-v2. Les données affichées sont des exemples, pas des prospects réels."
        breadcrumbs={[{ label: "CRM", href: "/app" }, { label: "Design system" }]}
      />
      <DesignCatalogue />
    </>
  )
}
