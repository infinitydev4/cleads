import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { startAuditSchema } from "@/features/prospect-audit/schemas"
import { getLeadAudit, requestAudit } from "@/features/prospect-audit/service"

export const dynamic = "force-dynamic"

/** The fiche's latest AI audit, the audit in progress if any, and whether the person may start one. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("ai:read")
    return NextResponse.json(await getLeadAudit(user, (await params).id))
  } catch (error) {
    return handleError(error)
  }
}

/** Starts an audit, or reuses a fresh one of the same domain; `force: true` audits again anyway. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("ai:use")
    const body = await request.json().catch(() => ({}))
    const result = await requestAudit(user, (await params).id, startAuditSchema.parse(body ?? {}))
    return NextResponse.json(result, { status: result.reused ? 200 : 202 })
  } catch (error) {
    return handleError(error)
  }
}
