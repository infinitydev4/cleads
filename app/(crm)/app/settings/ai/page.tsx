import { PageHeader } from "@/components/crm/page-header"
import { requirePagePermission } from "@/lib/auth/guard"
import { listApprovals } from "@/features/ai/approvals"
import { listRuns } from "@/features/ai/runs"
import { aiSettingsView } from "@/features/ai/settings"
import { AiSettings } from "./ai-settings"

export const metadata = { title: "Intelligence artificielle" }
export const dynamic = "force-dynamic"

export default async function AiSettingsPage() {
  const { user } = await requirePagePermission("ai:use")
  const [view, approvals, runs] = await Promise.all([aiSettingsView(user), listApprovals(user), listRuns(user, { limit: 20 })])
  return (
    <>
      <PageHeader
        title="Intelligence artificielle"
        description="Les modèles utilisés par les agents, les plafonds de dépense et la consommation du mois. Les agents qui auditent, conseillent, rédigent et créent les maquettes arrivent dans les prochaines étapes ; tout ce qu’ils feront hors du CRM attendra ici votre validation."
        breadcrumbs={[{ label: "CRM", href: "/app" }, { label: "Intelligence artificielle" }]}
      />
      <AiSettings userId={user.id} initial={view} approvals={approvals} runs={runs} />
    </>
  )
}
