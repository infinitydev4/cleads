import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { availabilitySchema } from "@/features/meetings/rules"
import { getAvailability, saveAvailability } from "@/features/meetings/service"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { user } = await requirePermission("availability:manage")
    return NextResponse.json(await getAvailability(user, new URL(request.url).searchParams.get("hostId")))
  } catch (error) {
    return handleError(error)
  }
}

export async function PUT(request: Request) {
  try {
    const { user } = await requirePermission("availability:manage")
    return NextResponse.json(await saveAvailability(user, availabilitySchema.parse(await request.json()), clientIp(request.headers)))
  } catch (error) {
    return handleError(error)
  }
}
