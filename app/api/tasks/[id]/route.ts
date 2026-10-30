import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { updateTaskSchema } from "@/features/activity/rules"
import { deleteTask, updateTask } from "@/features/activity/tasks"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("task:write")
    await updateTask(user, (await params).id, updateTaskSchema.parse(await request.json()))
    return NextResponse.json({ ok: true })
  } catch (error) {
    return handleError(error)
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("task:write")
    await deleteTask(user, (await params).id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return handleError(error)
  }
}
