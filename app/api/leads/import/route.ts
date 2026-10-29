import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { MAX_IMPORT_ROWS, runImport } from "@/features/leads/import"
import { IMPORT_FIELDS } from "@/features/leads/mapping"

export const maxDuration = 60

const fields = Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, z.string().max(500).optional()]))
const bodySchema = z.object({
  rows: z.array(z.object(fields)).min(1).max(MAX_IMPORT_ROWS),
  fileName: z.string().max(200).optional(),
  /** false = preview: nothing is written. */
  commit: z.boolean().default(false),
})

export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("lead:import")
    const body = bodySchema.parse(await request.json())
    return NextResponse.json(await runImport(user, body.rows, { commit: body.commit, source: "CSV", fileName: body.fileName, ip: clientIp(request.headers) }))
  } catch (error) {
    return handleError(error)
  }
}
