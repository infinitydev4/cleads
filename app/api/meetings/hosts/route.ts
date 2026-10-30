import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { listHosts } from "@/features/meetings/service"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const { user } = await requirePermission("meeting:read")
    return NextResponse.json({ hosts: await listHosts(user) })
  } catch (error) {
    return handleError(error)
  }
}
