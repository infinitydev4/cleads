import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { qualityPage, startEvaluation, startEvaluationSchema } from "@/features/quality/service"

export const dynamic = "force-dynamic"

/** The evaluation suites, what each can compare and costs, and the latest evaluations (E27). */
export async function GET() {
  try {
    const { user } = await requirePermission("ai:use")
    return NextResponse.json(await qualityPage(user))
  } catch (error) {
    return handleError(error)
  }
}

/** Launches an evaluation: the worker runs it, its cost reserved first. */
export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("skill:manage")
    return NextResponse.json(await startEvaluation(user, startEvaluationSchema.parse(await request.json()), clientIp(request.headers)), { status: 201 })
  } catch (error) {
    return handleError(error)
  }
}
