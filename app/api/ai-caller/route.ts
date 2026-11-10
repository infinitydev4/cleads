import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { overview } from "@/features/ai-caller/service"

export const dynamic = "force-dynamic"

/** The AI caller's page, refreshed while calls are under way (E33). */
export async function GET() {
  try {
    const { user } = await requirePermission("aicall:manage")
    return NextResponse.json(await overview(user))
  } catch (error) {
    return handleError(error)
  }
}
