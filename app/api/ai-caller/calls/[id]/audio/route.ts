import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { ElevenLabsError, conversationAudio } from "@/lib/telephony/elevenlabs"
import { conversationOf } from "@/features/ai-caller/service"

export const dynamic = "force-dynamic"

/** E33: the call's recording, streamed from ElevenLabs; it is never stored in Cleads. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("aicall:manage")
    const res = await conversationAudio(await conversationOf(user, (await params).id))
    if (!res.ok || !res.body) return NextResponse.json({ error: "Enregistrement indisponible chez ElevenLabs." }, { status: res.status === 404 ? 404 : 502 })
    return new Response(res.body, { headers: { "Content-Type": res.headers.get("content-type") ?? "audio/mpeg", "Cache-Control": "private, no-store" } })
  } catch (error) {
    if (error instanceof ElevenLabsError) return NextResponse.json({ error: error.message }, { status: 502 })
    return handleError(error)
  }
}
