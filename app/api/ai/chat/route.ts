import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { copilotTurn } from "@/features/copilot/turn"

export const dynamic = "force-dynamic"

/**
 * The copilot (E24): one turn, streamed to the panel. The body carries a question, or the person's answers to the
 * approvals of the last answer; the server keeps the conversation and takes nothing else from the browser.
 */
export async function POST(request: Request) {
  const startedAt = Date.now()
  try {
    const { user } = await requirePermission("ai:use")
    return await copilotTurn(user, await request.json(), request.signal, { startedAt })
  } catch (error) {
    return handleError(error)
  }
}
