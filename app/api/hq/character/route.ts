import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { setCharacter } from "@/features/hq/service"

const bodySchema = z.object({ character: z.string().max(30).nullable() })

/** A member chooses the character they appear as in the 3D view (null = back to the default of their role). */
export async function PUT(request: Request) {
  try {
    const { user } = await requirePermission("hq:view")
    return NextResponse.json({ character: await setCharacter(user, bodySchema.parse(await request.json()).character) })
  } catch (error) {
    return handleError(error)
  }
}
