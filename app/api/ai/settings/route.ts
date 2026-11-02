import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { aiSettingsView, updateAiSettings, updateAiSettingsSchema } from "@/features/ai/settings"

export const dynamic = "force-dynamic"

/** Models per role, caps and the month's consumption (Réglages › IA). */
export async function GET() {
  try {
    const { user } = await requirePermission("ai:use")
    return NextResponse.json(await aiSettingsView(user))
  } catch (error) {
    return handleError(error)
  }
}

export async function PUT(request: Request) {
  try {
    const { user } = await requirePermission("ai:manage")
    return NextResponse.json(await updateAiSettings(user, updateAiSettingsSchema.parse(await request.json()), clientIp(request.headers)))
  } catch (error) {
    return handleError(error)
  }
}
