import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { mergeLeads } from "@/features/leads/duplicates"

const schema = z.object({ keepId: z.string().min(1), dropId: z.string().min(1) })

export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("lead:merge")
    const { keepId, dropId } = schema.parse(await request.json())
    await mergeLeads(user, keepId, dropId, clientIp(request.headers))
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleError(error)
  }
}
