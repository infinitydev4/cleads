import { PageHeader } from "@/components/crm/page-header"
import { requirePagePermission } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { mcpAccess } from "@/features/mcp/policy"
import { appOrigin } from "@/features/mcp/status"
import { listTokens } from "@/features/mcp/tokens"
import { McpAccessView } from "./mcp-access"

export const metadata = { title: "Accès MCP" }
export const dynamic = "force-dynamic"

/** E29: the CRM's MCP server, seen from the CRM: the owner's switch, how to connect, each member's connections and tokens. */
export default async function McpSettingsPage() {
  const { user } = await requirePagePermission("ai:use")
  const owner = can(user.role, "ai:manage")
  const [access, mine, team] = await Promise.all([mcpAccess(user.workspaceId), listTokens(user), owner ? listTokens(user, { team: true }) : Promise.resolve(null)])
  return (
    <>
      <PageHeader
        title="Accès MCP"
        description="Pilotez le CRM depuis Claude, ChatGPT, Claude Code ou Cursor, avec vos droits et rien de plus : vous autorisez chaque application dans Cleads, et vous la déconnectez quand vous voulez. Ce qui change le CRM attend votre validation dans Cleads ; ce qui contacte un prospect, toujours votre propre clic."
        breadcrumbs={[{ label: "CRM", href: "/app" }, { label: "Accès MCP" }]}
      />
      <McpAccessView enabled={access.enabled} canManage={owner} endpoint={`${appOrigin()}/api/mcp`} mine={mine} team={team?.filter((t) => t.owner?.id !== user.id) ?? null} />
    </>
  )
}
