import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { listMembers } from "@/features/team/service"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await requirePermission("team:read")
    return NextResponse.json(await listMembers())
  } catch (error) {
    return handleError(error)
  }
}
