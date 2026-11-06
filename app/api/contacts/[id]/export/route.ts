import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { exportPerson } from "@/features/leads/person-export"

export const dynamic = "force-dynamic"

/** E14 lot 4 (D65): what the CRM holds about one person, as JSON, for owners and managers (data:export). Each export is in the audit log. */
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("data:export")
    const { id } = await props.params
    const exported = await exportPerson(user, id, clientIp(request.headers))
    return new NextResponse(JSON.stringify(exported, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="cleads-donnees-personnelles-${exported.contactId}.json"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    return handleError(error)
  }
}
