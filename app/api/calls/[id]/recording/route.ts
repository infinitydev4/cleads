import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { recordingLink } from "@/features/telephony/service"

export const dynamic = "force-dynamic"

/** A link valid for half an hour to a call's recording, kept at Zadarma (E32). */
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("lead:read")
    const { id } = await props.params
    return NextResponse.json(await recordingLink(user, id))
  } catch (error) {
    return handleError(error)
  }
}
