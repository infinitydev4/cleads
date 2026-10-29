import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { savedViewSchema } from "@/features/leads/schemas"
import { createView, listViews } from "@/features/leads/views"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const { user } = await requirePermission("lead:read")
    return NextResponse.json(await listViews(user))
  } catch (error) {
    return handleError(error)
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("lead:read")
    return NextResponse.json(await createView(user, savedViewSchema.parse(await request.json())), { status: 201 })
  } catch (error) {
    return handleError(error)
  }
}
