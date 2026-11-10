import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { ElevenLabsError } from "@/lib/telephony/elevenlabs"
import { setupAgent } from "@/features/ai-caller/service"

/** E33: creates the agent and its tools in the owner's ElevenLabs account, with the key set in the environment. */
export async function POST() {
  try {
    const { user } = await requirePermission("aicall:configure")
    return NextResponse.json(await setupAgent(user))
  } catch (error) {
    if (error instanceof ElevenLabsError) return NextResponse.json({ error: error.message, code: error.kind }, { status: error.kind === "not_configured" ? 503 : 502 })
    return handleError(error)
  }
}
