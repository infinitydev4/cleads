import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { findDuplicateGroups } from "@/features/leads/duplicates"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const { user } = await requirePermission("lead:merge")
    return NextResponse.json(await findDuplicateGroups(user))
  } catch (error) {
    return handleError(error)
  }
}
