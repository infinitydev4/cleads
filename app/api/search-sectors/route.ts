import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { getExtractorClient } from "@/lib/extractor/client"

export const dynamic = "force-dynamic"

/** Activity suggestions for the search form (the extractor's taxonomy). */
export async function GET() {
  try {
    await requirePermission("search:run")
    const sectors = await getExtractorClient().sectors()
    return NextResponse.json(sectors.map((s) => ({ key: s.key, label: s.label })))
  } catch (error) {
    return handleError(error)
  }
}
