import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { parseReportPeriod } from "@/features/metrics/periods"
import { exportWonCsv } from "@/features/metrics/report"

export const dynamic = "force-dynamic"

/** E10: the period's won opportunities as CSV, for owners and managers (data:export). Each export is in the audit log. */
export async function GET(request: Request) {
  try {
    const { user } = await requirePermission("data:export")
    const params = new URL(request.url).searchParams
    const period = parseReportPeriod({ periode: params.get("periode"), du: params.get("du") })
    const csv = await exportWonCsv(user, period, clientIp(request.headers))
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="cleads-gagnes-${period.kind}-${period.key}.csv"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    return handleError(error)
  }
}
