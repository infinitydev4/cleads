import Link from "next/link"
import { Copy, Plus, Upload } from "lucide-react"
import { PageHeader } from "@/components/crm/page-header"
import { Button } from "@/components/ui/button"
import { requirePagePermission } from "@/lib/auth/guard"
import { can, scopeOf } from "@/lib/rbac"
import { parseLeadFilters } from "@/features/leads/schemas"
import { listAssignees, listLeads } from "@/features/leads/service"
import { listViews } from "@/features/leads/views"
import { LeadsView } from "./leads-view"

export const metadata = { title: "Prospects" }
export const dynamic = "force-dynamic"

export default async function LeadsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requirePagePermission("lead:read")
  const filters = parseLeadFilters(await props.searchParams)
  const [list, assignees, views] = await Promise.all([listLeads(user, filters), listAssignees(user), listViews(user)])
  const canWrite = can(user.role, "lead:write")

  return (
    <>
      <PageHeader
        title="Prospects"
        description="Les entreprises à contacter, qualifier et convertir. Chaque entreprise a une seule fiche : les doublons sont repérés à l’import et à la saisie."
        actions={
          <>
            {can(user.role, "lead:merge") && (
              <Button asChild variant="ghost"><Link href="/app/leads/duplicates"><Copy className="h-4 w-4" aria-hidden="true" /> Doublons</Link></Button>
            )}
            {can(user.role, "lead:import") && (
              <Button asChild variant="outline"><Link href="/app/leads/import"><Upload className="h-4 w-4" aria-hidden="true" /> Importer</Link></Button>
            )}
            {canWrite && (
              <Button asChild><Link href="/app/leads/new"><Plus className="h-4 w-4" aria-hidden="true" /> Nouveau prospect</Link></Button>
            )}
          </>
        }
      />
      <LeadsView
        list={list}
        filters={filters}
        assignees={assignees.map((a) => ({ ...a }))}
        views={views}
        currentUserId={user.id}
        canWrite={canWrite}
        canAssignOthers={scopeOf(user.role, "lead:write") === "all"}
        canShareViews={can(user.role, "team:read")}
        canImport={can(user.role, "lead:import")}
      />
    </>
  )
}
