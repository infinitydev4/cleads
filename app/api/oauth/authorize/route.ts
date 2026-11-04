import { getCurrentUser } from "@/lib/auth/guard"
import { getSession } from "@/lib/auth/session"
import { handleDecision } from "@/features/mcp/oauth/http"

export const dynamic = "force-dynamic"

/** E29 lot 2: the consent screen's answer (/auth/authorize): « Autoriser » or « Refuser », by the signed-in member. */
export async function POST(request: Request) {
  const session = await getSession()
  return handleDecision(request, { actor: await getCurrentUser(), temporaryPassword: !!session?.user?.isTemporaryPassword })
}
