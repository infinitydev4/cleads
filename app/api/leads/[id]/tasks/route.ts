import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { createTaskSchema } from "@/features/activity/rules"
import { createTask } from "@/features/activity/tasks"
import { getLead } from "@/features/leads/service"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("task:write")
    const id = (await params).id
    await createTask(user, id, createTaskSchema.parse(await request.json()))
    return NextResponse.json(await getLead(user, id), { status: 201 })
  } catch (error) {
    return handleError(error)
  }
}
