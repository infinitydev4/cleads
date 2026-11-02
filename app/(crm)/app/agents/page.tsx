import { PageHeader } from "@/components/crm/page-header"
import { requirePagePermission } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { listApprovals } from "@/features/ai/approvals"
import { ensureAgentCatalog } from "@/features/ai/catalog"
import { agentViews } from "@/features/ai/definitions"
import { listRuns } from "@/features/ai/runs"
import { aiSettingsView } from "@/features/ai/settings"
import { listSkills } from "@/features/ai/skills/service"
import { listOffers } from "@/features/offers/service"
import { AgentsView } from "./agents-view"
import { TABS, type Tab } from "./tabs"

export const metadata = { title: "Agents IA" }
export const dynamic = "force-dynamic"

export default async function AgentsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requirePagePermission("ai:use")
  const params = await props.searchParams
  const tab = (TABS as readonly string[]).includes(String(params.tab)) ? (params.tab as Tab) : "agents"
  await ensureAgentCatalog(user.workspaceId)
  const [agents, skills, archivedSkills, offers, archivedOffers, runs, approvals, settings] = await Promise.all([
    agentViews(user),
    listSkills(user),
    listSkills(user, { archived: true }),
    listOffers(user),
    listOffers(user, { archived: true }),
    listRuns(user, { limit: 50 }),
    listApprovals(user),
    aiSettingsView(user),
  ])
  return (
    <>
      <PageHeader
        title="Agents IA"
        description="Les agents de l’agence, les skills qui guident leur travail et le catalogue d’offres qu’ils recommandent. Tout ce qu’ils feront hors du CRM attendra la validation d’une personne."
        breadcrumbs={[{ label: "CRM", href: "/app" }, { label: "Agents IA" }]}
      />
      <AgentsView
        userId={user.id}
        initialTab={tab}
        agents={agents}
        skills={skills}
        archivedSkills={archivedSkills}
        offers={offers}
        archivedOffers={archivedOffers}
        runs={runs}
        approvals={approvals}
        settings={settings}
        can={{ manageSkills: can(user.role, "skill:manage"), manageOffers: can(user.role, "offer:manage"), manageAi: can(user.role, "ai:manage") }}
      />
    </>
  )
}
