import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { LeadError } from "@/features/leads/errors"
import { getSkillVersion } from "@/features/ai/skills/service"

export const dynamic = "force-dynamic"

/** An earlier version of a skill, read-only. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; version: string }> }) {
  try {
    const { user } = await requirePermission("ai:use")
    const { id, version } = await params
    const n = Number(version)
    if (!Number.isInteger(n) || n < 1) throw new LeadError("not_found", "Version introuvable", 404)
    return NextResponse.json(await getSkillVersion(user, id, n))
  } catch (error) {
    return handleError(error)
  }
}
