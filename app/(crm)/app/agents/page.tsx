import { PageHeader } from "@/components/crm/page-header"
import { requirePagePermission } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { listApprovals } from "@/features/ai/approvals"
import { ensureAgentCatalog } from "@/features/ai/catalog"
import { agentViews } from "@/features/ai/definitions"
import { isManager, listRuns } from "@/features/ai/runs"
import { aiSettingsView } from "@/features/ai/settings"
import { listSkills } from "@/features/ai/skills/service"
import { listOffers } from "@/features/offers/service"
import { qualityDashboard } from "@/features/quality/dashboard"
import { qualityPage } from "@/features/quality/service"
import { listMissions, listSchedules } from "@/features/missions/service"
import { mcpAccess, rightsView } from "@/features/mcp/policy"
import { AgentsView } from "./agents-view"
import { TABS, type Tab } from "./tabs"

export const metadata = { title: "Agents IA" }
export const dynamic = "force-dynamic"

export default async function AgentsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requirePagePermission("ai:console")
  const params = await props.searchParams
  const tab = (TABS as readonly string[]).includes(String(params.tab)) && (params.tab !== "quality" || isManager(user)) ? (params.tab as Tab) : "agents"
  await ensureAgentCatalog(user.workspaceId)
  // The quality of the AI (E27) is followed by owners and managers.
  const manager = isManager(user)
  const [agents, skills, archivedSkills, offers, archivedOffers, runs, approvals, settings, dashboard, quality, missions, schedules, mcp] = await Promise.all([
    agentViews(user),
    listSkills(user),
    listSkills(user, { archived: true }),
    listOffers(user),
    listOffers(user, { archived: true }),
    listRuns(user, { limit: 50 }),
    listApprovals(user),
    aiSettingsView(user),
    manager ? qualityDashboard(user, 30) : null,
    manager ? qualityPage(user) : null,
    listMissions(user),
    listSchedules(user),
    mcpAccess(user.workspaceId),
  ])
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined)
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
        agents={{ ...agents, mcp: rightsView(mcp) }}
        skills={skills}
        archivedSkills={archivedSkills}
        offers={offers}
        archivedOffers={archivedOffers}
        runs={runs}
        approvals={approvals}
        missions={{ missions, schedules }}
        settings={settings}
        quality={dashboard && quality ? { dashboard, page: quality, evaluate: { suite: one(params.evaluate), role: one(params.role) as never, model: one(params.model) } } : null}
        can={{ manageSkills: can(user.role, "skill:manage"), manageOffers: can(user.role, "offer:manage"), manageAi: can(user.role, "ai:manage") }}
      />
    </>
  )
}
