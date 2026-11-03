import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { LeadError } from "@/features/leads/errors"
import { MAX_AUDIO_BYTES, transcribeFor } from "@/features/copilot/voice"

export const dynamic = "force-dynamic"

/** E28: a question dictated in the copilot's panel, as text to read before sending. The audio is never stored. */
export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("ai:use")
    if (Number(request.headers.get("content-length") ?? 0) > MAX_AUDIO_BYTES + 10_000) throw new LeadError("invalid", "Dictée trop longue : une minute au plus.", 400)
    const form = await request.formData()
    const file = form.get("audio")
    if (!(file instanceof Blob)) throw new LeadError("invalid", "Aucun son reçu.", 400)
    return NextResponse.json(await transcribeFor(user, { bytes: new Uint8Array(await file.arrayBuffer()), type: file.type }))
  } catch (error) {
    return handleError(error)
  }
}
