import { PageHeader } from "@/components/crm/page-header"
import { requirePagePermission } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { listCampaigns } from "@/features/campaigns/service"
import { listAssignees } from "@/features/leads/service"
import { CampaignsView } from "./campaigns-view"

export const metadata = { title: "Campagnes" }
export const dynamic = "force-dynamic"

export default async function CampaignsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requirePagePermission("campaign:read")
  const params = await props.searchParams
  const archived = params.archived === "1"
  const canManage = can(user.role, "campaign:manage")
  const [campaigns, people] = await Promise.all([listCampaigns(user, { archived }), canManage ? listAssignees(user) : []])
  return (
    <>
      <PageHeader
        title={archived ? "Campagnes archivées" : "Campagnes"}
        description="Chaque campagne vise une cible (secteur et zone). On y range des fiches, on lance des recherches pour elle, et ses résultats se calculent seuls."
        breadcrumbs={[{ label: "CRM", href: "/app" }, { label: "Campagnes", href: archived ? "/app/campaigns" : undefined }, ...(archived ? [{ label: "Archives" }] : [])]}
      />
      <CampaignsView campaigns={campaigns} archived={archived} startCreating={canManage && !archived && params.new === "1"} people={people.map((p) => ({ id: p.id, name: p.name, email: p.email }))} currentUserId={user.id} canManage={canManage} />
    </>
  )
}
