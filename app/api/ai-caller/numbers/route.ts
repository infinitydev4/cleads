import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { ElevenLabsError } from "@/lib/telephony/elevenlabs"
import { importZadarmaNumber } from "@/features/ai-caller/service"
import { importNumberSchema } from "@/features/ai-caller/schemas"

/** E33: one of the workspace's Zadarma numbers becomes the agent's line in ElevenLabs. The SIP password is not kept. */
export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("aicall:configure")
    return NextResponse.json(await importZadarmaNumber(user, importNumberSchema.parse(await request.json())))
  } catch (error) {
    if (error instanceof ElevenLabsError) return NextResponse.json({ error: error.message, code: error.kind }, { status: error.kind === "not_configured" ? 503 : 502 })
    return handleError(error)
  }
}
