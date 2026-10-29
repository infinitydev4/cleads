import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { activitySchema } from "@/features/leads/schemas"
import { addActivity, getLead } from "@/features/leads/service"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("lead:write")
    const id = (await params).id
    await addActivity(user, id, activitySchema.parse(await request.json()))
    return NextResponse.json(await getLead(user, id), { status: 201 })
  } catch (error) {
    return handleError(error)
  }
}
