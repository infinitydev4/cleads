import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { meetingActionSchema } from "@/features/meetings/rules"
import { actOnMeeting, getMeeting } from "@/features/meetings/service"

export const dynamic = "force-dynamic"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("meeting:read")
    return NextResponse.json({ meeting: await getMeeting(user, (await params).id) })
  } catch (error) {
    return handleError(error)
  }
}

/** One endpoint for every change (confirm, cancel, reschedule, no-show, complete); the service checks the right per action. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("meeting:read")
    return NextResponse.json({ meeting: await actOnMeeting(user, (await params).id, meetingActionSchema.parse(await request.json()), clientIp(request.headers)) })
  } catch (error) {
    return handleError(error)
  }
}
