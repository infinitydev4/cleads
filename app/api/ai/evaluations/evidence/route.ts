import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { evidenceFor, evidenceQuerySchema } from "@/features/quality/service"

export const dynamic = "force-dynamic"

/** The proof a change of model needs (E27): `?role=&model=` for a role, `?agent=&role=` for an agent moved to another role. */
export async function GET(request: Request) {
  try {
    const { user } = await requirePermission("ai:manage")
    return NextResponse.json(await evidenceFor(user, evidenceQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))))
  } catch (error) {
    return handleError(error)
  }
}
