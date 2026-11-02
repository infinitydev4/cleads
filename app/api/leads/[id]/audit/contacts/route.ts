import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { addProposedContact } from "@/features/prospect-audit/service"

export const dynamic = "force-dynamic"

const bodySchema = z.object({ auditId: z.string().min(1), index: z.number().int().min(0).max(10) }).strict()

/** Adds an officer the audit found as a contact of the company, with its source and legal basis. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("lead:write")
    const { auditId, index } = bodySchema.parse(await request.json())
    return NextResponse.json(await addProposedContact(user, (await params).id, auditId, index, clientIp(request.headers)), { status: 201 })
  } catch (error) {
    return handleError(error)
  }
}
