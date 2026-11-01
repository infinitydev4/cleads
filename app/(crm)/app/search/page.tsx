import { PageHeader } from "@/components/crm/page-header"
import { requirePagePermission } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { getExtractorClient } from "@/lib/extractor/client"
import { extractorHealth, isConfigured, listSearches } from "@/features/search/service"
import { campaignOptions } from "@/features/campaigns/service"
import { HealthBanner } from "./health-banner"
import { SearchForm } from "./search-form"
import { SearchList } from "./search-list"

export const metadata = { title: "Recherche d’entreprises" }
export const dynamic = "force-dynamic"

export default async function SearchPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requirePagePermission("search:run")
  const configured = isConfigured()
  const asked = (await props.searchParams).campaign
  const [health, searches, sectors, campaigns] = await Promise.all([
    extractorHealth(),
    configured ? listSearches(user) : Promise.resolve([]),
    configured ? getExtractorClient().sectors().catch(() => []) : Promise.resolve([]),
    can(user.role, "campaign:manage") ? campaignOptions(user) : Promise.resolve([]),
  ])

  return (
    <>
      <PageHeader
        title="Recherche d’entreprises"
        description="Trouvez des entreprises par activité et par zone avec Cleads Extractor, vérifiez le résultat, puis importez-le dans vos prospects. Rien n’entre dans le CRM sans votre validation."
        breadcrumbs={[{ label: "CRM", href: "/app" }, { label: "Recherche" }]}
      />
      <div className="mx-auto max-w-4xl space-y-8">
        <HealthBanner health={health} />
        <SearchForm disabled={!configured} sectors={sectors.map((s) => s.label)} canImport={can(user.role, "lead:import")} campaigns={campaigns} initialCampaign={typeof asked === "string" && campaigns.some((c) => c.id === asked) ? asked : undefined} />
        <SearchList searches={searches} />
      </div>
    </>
  )
}
