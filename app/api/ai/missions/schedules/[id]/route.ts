import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { actOnSchedule } from "@/features/missions/service"
import { scheduleRequestSchema } from "@/features/missions/schemas"

export const dynamic = "force-dynamic"

/** Pauses, resumes or stops a recurring mission (E28, D35). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("ai:console")
    return NextResponse.json(await actOnSchedule(user, (await params).id, scheduleRequestSchema.parse(await request.json())))
  } catch (error) {
    return handleError(error)
  }
}
