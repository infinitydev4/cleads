import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { setWaveStatus } from "@/features/ai-caller/service"
import { waveActionSchema } from "@/features/ai-caller/schemas"

/** E33: pause, resume or stop a wave. Stopping drops its calls still waiting; a call under way finishes. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("aicall:manage")
    const { status } = waveActionSchema.parse(await request.json())
    await setWaveStatus(user, (await params).id, status)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return handleError(error)
  }
}
