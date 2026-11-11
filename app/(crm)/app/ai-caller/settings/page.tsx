import { requirePagePermission } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { accountChoices, hostsFor, monthSpentMicros, settingsView } from "@/features/ai-caller/service"
import { zadarmaLines } from "@/features/ai-caller/zadarma-lines"
import { AiCallerSettingsView } from "./settings-view"

export const metadata = { title: "Réglages de l’agent d’appel IA" }
export const dynamic = "force-dynamic"

/** E33: what the agent says, with which voice, within which budget, and its connection to ElevenLabs (mockup artboard 18). */
export default async function AiCallerSettingsPage() {
  const { user } = await requirePagePermission("aicall:manage")
  const canConfigure = can(user.role, "aicall:configure")
  const [settings, account, hosts, spent, zadarma] = await Promise.all([settingsView(user), accountChoices(), hostsFor(user.workspaceId), monthSpentMicros(user.workspaceId), canConfigure ? zadarmaLines() : null])
  return <AiCallerSettingsView initial={settings} account={account} zadarma={zadarma} hosts={hosts} spentMicros={spent} canConfigure={canConfigure} />
}
