import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { MAX_LOT } from "@/features/lots/prompt"
import { lotPreview, sendLot } from "@/features/lots/service"

export const dynamic = "force-dynamic"
type Ctx = { params: Promise<{ searchId: string }> }

/** What the batch would keep from the search's results; nothing is written. */
export async function GET(request: Request, { params }: Ctx) {
  try {
    const { user } = await requirePermission("team:dispatch")
    const q = new URL(request.url).searchParams
    const count = Math.min(MAX_LOT, Math.max(1, Number(q.get("count")) || 100))
    return NextResponse.json(await lotPreview(user, (await params).searchId, { count, noSite: q.get("noSite") === "1" }))
  } catch (error) {
    return handleError(error)
  }
}

const sendSchema = z.object({ ids: z.array(z.number().int()).min(1).max(MAX_LOT), closerId: z.string().min(1) })

/** Imports the chosen businesses into the batch's campaign and gives them to the closer. */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { user } = await requirePermission("team:dispatch")
    return NextResponse.json(await sendLot(user, (await params).searchId, sendSchema.parse(await request.json()), clientIp(request.headers)))
  } catch (error) {
    return handleError(error)
  }
}
