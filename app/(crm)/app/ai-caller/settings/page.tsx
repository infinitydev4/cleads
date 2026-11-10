import { requirePagePermission } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { accountChoices, hostsFor, monthSpentMicros, settingsView } from "@/features/ai-caller/service"
import { AiCallerSettingsView } from "./settings-view"

export const metadata = { title: "Réglages de l’agent d’appel IA" }
export const dynamic = "force-dynamic"

/** E33: what the agent says, with which voice, within which budget, and its connection to ElevenLabs (mockup artboard 18). */
export default async function AiCallerSettingsPage() {
  const { user } = await requirePagePermission("aicall:manage")
  const [settings, account, hosts, spent] = await Promise.all([settingsView(user), accountChoices(), hostsFor(user.workspaceId), monthSpentMicros(user.workspaceId)])
  return <AiCallerSettingsView initial={settings} account={account} hosts={hosts} spentMicros={spent} canConfigure={can(user.role, "aicall:configure")} />
}
