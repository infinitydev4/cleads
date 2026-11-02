import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { skillTestRequestSchema, startSkillTest } from "@/features/ai/skill-test"

export const dynamic = "force-dynamic"

/** Queues a test of the skill on a fiche: a real run, billed to the person's quota. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("skill:manage")
    return NextResponse.json(await startSkillTest(user, (await params).id, skillTestRequestSchema.parse(await request.json())), { status: 202 })
  } catch (error) {
    return handleError(error)
  }
}
