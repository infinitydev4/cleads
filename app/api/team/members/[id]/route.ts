import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { memberChangeSchema } from "@/features/team/schemas"
import { updateMember } from "@/features/team/service"

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("team:manage")
    const { id } = await props.params
    const change = memberChangeSchema.parse(await request.json())
    return NextResponse.json(await updateMember(user, id, change, clientIp(request.headers)))
  } catch (error) {
    return handleError(error)
  }
}
