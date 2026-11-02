import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { siteAsset } from "@/features/studio/service"

export const dynamic = "force-dynamic"

/** An image of the site (WebP, prepared by the worker), for the brief's editor. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; name: string }> }) {
  try {
    const { user } = await requirePermission("studio:generate")
    const { id, name } = await params
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(name)) return new Response(null, { status: 404 })
    const asset = await siteAsset(user, id, name)
    return new Response(asset.data, { headers: { "Content-Type": asset.mediaType, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } })
  } catch (error) {
    return handleError(error)
  }
}
