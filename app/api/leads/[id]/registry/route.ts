import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { addOfficerContact, dismissSignal, overrideLegalState, refreshLeadIdentity, registryView } from "@/features/signals/service"

export const dynamic = "force-dynamic"

/** The fiche's registry card (E30): identity, officers and BODACC signals. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("lead:read")
    return NextResponse.json(await registryView(user, (await params).id))
  } catch (error) {
    return handleError(error)
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("refresh") }),
  z.object({ action: z.literal("dismiss"), signalId: z.string().min(1).max(40) }),
  z.object({ action: z.literal("override") }),
  z.object({ action: z.literal("add_officer"), index: z.number().int().min(0).max(10) }),
])

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("lead:read")
    const id = (await params).id
    const body = actionSchema.parse(await request.json())
    const ip = clientIp(request.headers)
    if (body.action === "refresh") await refreshLeadIdentity(user, id)
    else if (body.action === "dismiss") await dismissSignal(user, id, body.signalId)
    else if (body.action === "override") await overrideLegalState(user, id, ip)
    else await addOfficerContact(user, id, body.index, ip)
    return NextResponse.json(await registryView(user, id))
  } catch (error) {
    return handleError(error)
  }
}
