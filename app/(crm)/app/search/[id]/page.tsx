import { PageHeader } from "@/components/crm/page-header"
import { requirePagePermission } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { getSearchView } from "@/features/search/service"
import { SearchDetail } from "./search-detail"

export const dynamic = "force-dynamic"
export const metadata = { title: "Recherche" }

export default async function SearchPage(props: { params: Promise<{ id: string }> }) {
  const { user } = await requirePagePermission("search:run")
  const view = await getSearchView(user, (await props.params).id)
  return (
    <>
      <PageHeader title={view.label} breadcrumbs={[{ label: "CRM", href: "/app" }, { label: "Recherche", href: "/app/search" }, { label: view.label }]} />
      <div className="mx-auto max-w-5xl">
        <SearchDetail initial={view} canImport={can(user.role, "lead:import")} />
      </div>
    </>
  )
}
