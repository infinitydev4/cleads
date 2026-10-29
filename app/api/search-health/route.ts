import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { extractorHealth } from "@/features/search/service"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await requirePermission("search:run")
    return NextResponse.json(await extractorHealth())
  } catch (error) {
    return handleError(error)
  }
}
