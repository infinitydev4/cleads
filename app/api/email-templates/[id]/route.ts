import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { templateSchema } from "@/features/outreach/schemas"
import { archiveTemplate, updateTemplate } from "@/features/outreach/templates"

export const dynamic = "force-dynamic"

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("sequence:manage")
    await updateTemplate(user, (await params).id, templateSchema.parse(await request.json()))
    return NextResponse.json({ ok: true })
  } catch (error) {
    return handleError(error)
  }
}

/** Archives: messages already sent keep naming the template they came from. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("sequence:manage")
    await archiveTemplate(user, (await params).id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return handleError(error)
  }
}
