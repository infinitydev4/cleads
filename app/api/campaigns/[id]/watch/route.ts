import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { getWatch, previewWatch, saveWatch, watchInputSchema } from "@/features/signals/watch-service"

export const dynamic = "force-dynamic"
// Reading seven days of the BODACC for a few départements takes a few seconds.
export const maxDuration = 60

/** The campaign's watch of the BODACC (E30). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("campaign:read")
    return NextResponse.json({ watch: await getWatch(user, (await params).id) })
  } catch (error) {
    return handleError(error)
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("campaign:manage")
    return NextResponse.json({ watch: await saveWatch(user, (await params).id, watchInputSchema.parse(await request.json()), clientIp(request.headers)) })
  } catch (error) {
    return handleError(error)
  }
}

/** « Aperçu » : what the watch would have found over seven days, from the BODACC alone. Nothing is written. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requirePermission("campaign:manage")
    return NextResponse.json(await previewWatch(user, (await params).id, watchInputSchema.parse(await request.json())))
  } catch (error) {
    return handleError(error)
  }
}
