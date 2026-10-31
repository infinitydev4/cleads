import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { deliverability } from "@/features/outreach/deliverability"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const { user } = await requirePermission("email:send")
    return NextResponse.json({ mailboxes: await deliverability(user) })
  } catch (error) {
    return handleError(error)
  }
}
