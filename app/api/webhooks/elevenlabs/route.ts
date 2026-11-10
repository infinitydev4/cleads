import { NextResponse } from "next/server"
import { verifySignature } from "@/lib/telephony/elevenlabs"
import { failCall, finishCall, readTranscriptionEvent } from "@/features/ai-caller/service"

export const dynamic = "force-dynamic"

/**
 * ElevenLabs' post-call webhook (E33), signed with ELEVENLABS_WEBHOOK_SECRET: the transcript and analysis of a finished
 * call, or a call that could not start. Other events are acknowledged and dropped. Filing is idempotent, so a replay
 * does nothing. A 2xx tells ElevenLabs to stop retrying.
 */
export async function POST(request: Request) {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: "ELEVENLABS_WEBHOOK_SECRET is not set" }, { status: 503 })
  const raw = await request.text()
  if (!verifySignature(raw, request.headers.get("elevenlabs-signature"), secret)) return NextResponse.json({ error: "Signature invalide" }, { status: 403 })
  let event: { type?: unknown; data?: unknown }
  try {
    event = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 })
  }
  const data = (event.data ?? {}) as Record<string, unknown>
  try {
    if (event.type === "post_call_transcription") {
      const finished = readTranscriptionEvent(data)
      return NextResponse.json(finished ? await finishCall(finished) : { filed: false, reason: "no_conversation" })
    }
    if (event.type === "call_initiation_failure") return NextResponse.json(await failCall(data))
    return NextResponse.json({ ignored: String(event.type ?? "") })
  } catch (error) {
    console.error("[ELEVENLABS_WEBHOOK]", error)
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 })
  }
}
