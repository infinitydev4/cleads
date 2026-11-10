import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { previewWave } from "@/features/ai-caller/service"
import { previewWaveSchema } from "@/features/ai-caller/schemas"

/** E33: how many fiches a wave would call, before it is launched. */
export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("aicall:manage")
    const { source, hookMode } = previewWaveSchema.parse(await request.json())
    return NextResponse.json(await previewWave(user, source, hookMode))
  } catch (error) {
    return handleError(error)
  }
}
