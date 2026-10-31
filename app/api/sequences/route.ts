import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { usableMailboxes } from "@/features/outreach/mailboxes"
import { createSequence, listSequences } from "@/features/outreach/sequences"
import { sequenceSchema } from "@/features/outreach/schemas"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const { user } = await requirePermission("sequence:manage")
    // The mailboxes this person may enroll from, for the "Inscrire dans une séquence" dialog.
    const [sequences, boxes] = await Promise.all([listSequences(user), usableMailboxes(user)])
    return NextResponse.json({ sequences, mailboxes: boxes.map((m) => ({ id: m.id, address: m.address, displayName: m.displayName, status: m.status, sentToday: m.sentToday, allowanceToday: m.allowanceToday, ownerId: m.ownerId })) })
  } catch (error) {
    return handleError(error)
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("sequence:manage")
    return NextResponse.json(await createSequence(user, sequenceSchema.parse(await request.json())), { status: 201 })
  } catch (error) {
    return handleError(error)
  }
}
