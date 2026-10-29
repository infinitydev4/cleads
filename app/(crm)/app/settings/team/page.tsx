import { PageHeader } from "@/components/crm/page-header"
import { requirePagePermission } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { listMembers, listPendingInvitations } from "@/features/team/service"
import { TeamManager } from "./team-manager"

export const metadata = { title: "Équipe" }
export const dynamic = "force-dynamic"

export default async function TeamPage() {
  const { user } = await requirePagePermission("team:read")
  const [members, invitations] = await Promise.all([listMembers(user.workspaceId), listPendingInvitations(user.workspaceId)])

  return (
    <>
      <PageHeader
        title="Équipe"
        description="Qui a accès au CRM, avec quel rôle. Un accès se donne par invitation : la personne choisit elle-même son mot de passe."
        breadcrumbs={[{ label: "CRM", href: "/app" }, { label: "Équipe" }]}
      />
      <TeamManager
        currentUserId={user.id}
        canManage={can(user.role, "team:manage")}
        members={members.map((m) => ({ ...m, lastLoginAt: m.lastLoginAt?.toISOString() ?? null, createdAt: m.createdAt.toISOString() }))}
        invitations={invitations.map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role,
          expiresAt: i.expiresAt.toISOString(),
          invitedBy: i.invitedBy.name ?? i.invitedBy.email ?? "",
        }))}
      />
    </>
  )
}
