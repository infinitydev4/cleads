import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { searchErrors } from "@/features/search/service"

export const dynamic = "force-dynamic"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("search:run")
    return NextResponse.json(await searchErrors(user, (await params).id))
  } catch (error) {
    return handleError(error)
  }
}
