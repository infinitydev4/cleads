import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { searchResults } from "@/features/search/service"

export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("search:run")
    const q = new URL(request.url).searchParams
    return NextResponse.json(
      await searchResults(user, (await params).id, {
        cursor: q.get("cursor") ?? undefined,
        limit: Number(q.get("limit")) || undefined,
        useful: q.get("useful") !== "0",
        hasEmail: q.get("hasEmail") === "1",
        minCompleteness: Number(q.get("minCompleteness")) || 0,
      })
    )
  } catch (error) {
    return handleError(error)
  }
}
