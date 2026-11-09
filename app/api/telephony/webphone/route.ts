import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { ZadarmaError } from "@/lib/telephony/zadarma"
import { webphoneSession } from "@/features/telephony/webphone"

export const dynamic = "force-dynamic"

/** The member's WebRTC key for the phone in the browser, or why there is none (E32 lot 2). Never cached by the browser. */
export async function GET() {
  try {
    const { user } = await requirePermission("lead:read")
    return NextResponse.json(await webphoneSession(user), { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (error instanceof ZadarmaError) return NextResponse.json({ ready: false, reason: "unreachable", message: error.message }, { status: 503 })
    return handleError(error)
  }
}
