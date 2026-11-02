import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { versionRender } from "@/features/studio/service"

export const dynamic = "force-dynamic"

const KINDS = ["desktop", "mobile", "thumb"] as const

/** A render of a version (JPEG): the full page on a computer or a phone, or its first screen. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; number: string; kind: string }> }) {
  try {
    const { user } = await requirePermission("studio:generate")
    const { id, number, kind } = await params
    const n = Number(number)
    if (!Number.isInteger(n) || n < 1 || !(KINDS as readonly string[]).includes(kind)) return new Response(null, { status: 404 })
    const data = await versionRender(user, id, n, kind as (typeof KINDS)[number])
    return new Response(data, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } })
  } catch (error) {
    return handleError(error)
  }
}
