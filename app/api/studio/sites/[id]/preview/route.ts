import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { previewHeaders } from "@/features/studio/preview"
import { internalPreview } from "@/features/studio/service"

export const dynamic = "force-dynamic"

/**
 * A version as the CRM frames it (sandboxed iframe): the same isolation as the public page, framed by the CRM only,
 * images inlined. It never counts as a visit.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("studio:generate")
    const number = Number(new URL(request.url).searchParams.get("v"))
    if (!Number.isInteger(number) || number < 1) return new Response("Version invalide", { status: 400 })
    const html = await internalPreview(user, (await params).id, number)
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Frame-Options": "SAMEORIGIN", ...previewHeaders("'self'") } })
  } catch (error) {
    return handleError(error)
  }
}
