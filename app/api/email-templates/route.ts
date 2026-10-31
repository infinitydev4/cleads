import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { templateSchema } from "@/features/outreach/schemas"
import { createTemplate, listTemplates } from "@/features/outreach/templates"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const { user } = await requirePermission("email:send")
    return NextResponse.json({ templates: await listTemplates(user) })
  } catch (error) {
    return handleError(error)
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("sequence:manage")
    return NextResponse.json(await createTemplate(user, templateSchema.parse(await request.json())), { status: 201 })
  } catch (error) {
    return handleError(error)
  }
}
