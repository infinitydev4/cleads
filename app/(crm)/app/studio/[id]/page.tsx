import { notFound } from "next/navigation"
import { PageHeader } from "@/components/crm/page-header"
import { requirePagePermission } from "@/lib/auth/guard"
import { LeadError } from "@/features/leads/errors"
import { getSite } from "@/features/studio/service"
import { StudioSiteView } from "./site-view"

export const metadata = { title: "Maquette · Studio Web" }
export const dynamic = "force-dynamic"

export default async function StudioSitePage(props: { params: Promise<{ id: string }> }) {
  const { user } = await requirePagePermission("studio:generate")
  const site = await getSite(user, (await props.params).id).catch((error: unknown) => {
    if (error instanceof LeadError && error.status === 404) notFound()
    throw error
  })
  return (
    <>
      <PageHeader
        title={site.companyName}
        description="La landing de démonstration du Designer web : relisez son brief, regardez la page, partagez le lien."
        breadcrumbs={[{ label: "CRM", href: "/app" }, { label: "Studio Web", href: "/app/studio" }, { label: site.companyName }]}
      />
      <StudioSiteView site={site} userId={user.id} />
    </>
  )
}
