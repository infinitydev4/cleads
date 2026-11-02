import { notFound } from "next/navigation"
import { PageHeader } from "@/components/crm/page-header"
import { requirePagePermission } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { LeadError } from "@/features/leads/errors"
import { campaignOfferOptions, getCampaign } from "@/features/campaigns/service"
import { relevanceView } from "@/features/relevance/service"
import { listAssignees } from "@/features/leads/service"
import { CampaignDetailView } from "./campaign-detail"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  return { title: "Campagne" }
}

export default async function CampaignPage(props: { params: Promise<{ id: string }> }) {
  const { user } = await requirePagePermission("campaign:read")
  const campaign = await getCampaign(user, (await props.params).id).catch((e) => {
    if (e instanceof LeadError && e.status === 404) notFound()
    throw e
  })
  const [people, offers, relevance] = await Promise.all([
    campaign.can.manage ? listAssignees(user) : [],
    campaignOfferOptions(user),
    can(user.role, "ai:read") ? relevanceView(user, campaign.id) : null,
  ])
  return (
    <>
      <PageHeader title={campaign.name} breadcrumbs={[{ label: "CRM", href: "/app" }, { label: "Campagnes", href: "/app/campaigns" }, { label: campaign.name }]} />
      <CampaignDetailView campaign={campaign} people={people.map((p) => ({ id: p.id, name: p.name, email: p.email }))} offers={offers} relevance={relevance} currentUserId={user.id} canSearch={can(user.role, "search:run")} />
    </>
  )
}
