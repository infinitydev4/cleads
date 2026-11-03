import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { actOnMission, missionDetail, missionView } from "@/features/missions/service"
import { missionRequestSchema } from "@/features/missions/schemas"

export const dynamic = "force-dynamic"

/** A mission as its card shows it; `?view=detail` adds its runs and their costs. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("ai:read")
    const id = (await params).id
    if (new URL(request.url).searchParams.get("view") === "detail") return NextResponse.json(await missionDetail(user, id))
    return NextResponse.json(await missionView(user, id))
  } catch (error) {
    return handleError(error)
  }
}

/** Launches (one click, D28), refuses, pauses, resumes or cancels a mission. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("ai:use")
    return NextResponse.json(await actOnMission(user, (await params).id, missionRequestSchema.parse(await request.json())))
  } catch (error) {
    return handleError(error)
  }
}
