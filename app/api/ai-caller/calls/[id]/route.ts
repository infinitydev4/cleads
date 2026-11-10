import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { callDetail } from "@/features/ai-caller/service"

/** E33: one call of the agent, with its result, what it learnt and its transcript. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("aicall:manage")
    return NextResponse.json(await callDetail(user, (await params).id))
  } catch (error) {
    return handleError(error)
  }
}
