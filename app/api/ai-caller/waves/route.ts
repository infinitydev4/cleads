import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { launchWave } from "@/features/ai-caller/service"
import { launchWaveSchema } from "@/features/ai-caller/schemas"

/** E33: hands a batch of fiches to the AI caller. The calls leave during the calling hours, within the monthly cap. */
export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("aicall:manage")
    return NextResponse.json(await launchWave(user, launchWaveSchema.parse(await request.json())), { status: 201 })
  } catch (error) {
    return handleError(error)
  }
}
