import { PageHeader } from "@/components/crm/page-header"
import { requirePagePermission } from "@/lib/auth/guard"
import { scopeOf } from "@/lib/rbac"
import { listAssignees } from "@/features/leads/service"
import { listBoard } from "@/features/pipeline/service"
import { PipelineBoard } from "./board"

export const metadata = { title: "Pipeline" }
export const dynamic = "force-dynamic"

export default async function PipelinePage(props: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { user } = await requirePagePermission("deal:read")
  const params = await props.searchParams
  const filters = { owner: params.owner || undefined, q: params.q || undefined }
  const [deals, assignees] = await Promise.all([listBoard(user, filters), listAssignees(user)])

  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Les opportunités, de la qualification à la signature. Glissez une carte d’une colonne à l’autre, ou utilisez son menu « Déplacer vers » au clavier ou sur mobile. Les gagnées et perdues des 30 derniers jours restent visibles."
        breadcrumbs={[{ label: "CRM", href: "/app" }, { label: "Pipeline" }]}
      />
      <PipelineBoard deals={deals} filters={filters} assignees={assignees.map((a) => ({ ...a }))} currentUserId={user.id} canSeeOthers={scopeOf(user.role, "deal:read") === "all"} />
    </>
  )
}
