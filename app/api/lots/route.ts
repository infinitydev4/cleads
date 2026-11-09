import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { MAX_LOT } from "@/features/lots/prompt"
import { startLot } from "@/features/lots/service"

export const dynamic = "force-dynamic"

const bodySchema = z.object({
  activity: z.string().trim().min(2, "Indique un métier (ex. électricien)").max(100),
  location: z.string().trim().min(2, "Indique une ville (ex. Nantes)").max(120),
  count: z.number().int().min(1).max(MAX_LOT),
  noSite: z.boolean(),
})

/** A batch for a closer: its campaign, and the Extractor search that feeds it (no AI). */
export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("team:dispatch")
    return NextResponse.json(await startLot(user, bodySchema.parse(await request.json()), clientIp(request.headers)), { status: 201 })
  } catch (error) {
    return handleError(error)
  }
}
