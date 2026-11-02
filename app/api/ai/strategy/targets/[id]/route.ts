import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { targetActionSchema } from "@/features/strategy/schemas"
import { actOnTarget } from "@/features/strategy/service"

export const dynamic = "force-dynamic"

/** What a person does with a target: its campaign (a draft), its search (confirmed, maybe adjusted), or set it aside. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("campaign:manage")
    const action = targetActionSchema.parse(await request.json())
    return NextResponse.json({ status: await actOnTarget(user, (await params).id, action, clientIp(request.headers)) })
  } catch (error) {
    return handleError(error)
  }
}
