import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { MAX_LOT } from "@/features/lots/prompt"
import { deleteLeads } from "@/features/lots/service"

export const dynamic = "force-dynamic"

/** Deletes fiches for good: the owner only, each one logged like a single deletion. */
export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("data:delete")
    const { ids } = z.object({ ids: z.array(z.string().min(1)).min(1).max(MAX_LOT) }).parse(await request.json())
    return NextResponse.json(await deleteLeads(user, ids, clientIp(request.headers)))
  } catch (error) {
    return handleError(error)
  }
}
