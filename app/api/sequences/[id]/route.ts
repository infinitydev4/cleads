import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { archiveSequence, listEnrollments, setSequenceStatus, updateSequence } from "@/features/outreach/sequences"
import { sequenceSchema } from "@/features/outreach/schemas"

export const dynamic = "force-dynamic"

/** The fiches in this sequence (a SDR sees the ones they enrolled). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("sequence:manage")
    return NextResponse.json({ enrollments: await listEnrollments(user, { sequenceId: (await params).id }) })
  } catch (error) {
    return handleError(error)
  }
}

const patchSchema = z.union([z.object({ status: z.enum(["ACTIVE", "PAUSED"]) }).strict(), sequenceSchema])

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("sequence:manage")
    const id = (await params).id
    const body = patchSchema.parse(await request.json())
    if ("status" in body) await setSequenceStatus(user, id, body.status)
    else await updateSequence(user, id, body)
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleError(error)
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("sequence:manage")
    return NextResponse.json(await archiveSequence(user, (await params).id))
  } catch (error) {
    return handleError(error)
  }
}
