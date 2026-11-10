import { requirePagePermission } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { hostsFor, overview } from "@/features/ai-caller/service"
import { AiCallerView } from "./ai-caller-view"

export const metadata = { title: "Agent d’appel IA" }
export const dynamic = "force-dynamic"

/** E33: the AI caller's waves, its calls as they end, and a new wave (mockup artboards 16–17). */
export default async function AiCallerPage({ searchParams }: { searchParams: Promise<{ appel?: string }> }) {
  const { user } = await requirePagePermission("aicall:manage")
  const [data, hosts] = await Promise.all([overview(user), hostsFor(user.workspaceId)])
  return <AiCallerView initial={data} hosts={hosts} canConfigure={can(user.role, "aicall:configure")} openCallId={(await searchParams).appel ?? null} />
}
