import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { listBoard } from "@/features/pipeline/service"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { user } = await requirePermission("deal:read")
    const q = new URL(request.url).searchParams
    return NextResponse.json(await listBoard(user, { owner: q.get("owner") ?? undefined, q: q.get("q") ?? undefined }))
  } catch (error) {
    return handleError(error)
  }
}
