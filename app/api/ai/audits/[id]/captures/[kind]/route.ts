import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { LeadError } from "@/features/leads/errors"
import { auditCapture } from "@/features/prospect-audit/service"

export const dynamic = "force-dynamic"

/** A screenshot of an audited site, for whoever sees the fiche (`?lead=`) it is shown on. Never cached by a proxy. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  try {
    const { user } = await requirePermission("ai:read")
    const { id, kind } = await params
    const lead = new URL(request.url).searchParams.get("lead")
    if (!lead || (kind !== "mobile" && kind !== "desktop")) throw new LeadError("not_found", "Capture introuvable", 404)
    const capture = await auditCapture(user, id, kind, lead)
    return new NextResponse(Buffer.from(capture.data), {
      headers: { "Content-Type": capture.mediaType, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" },
    })
  } catch (error) {
    return handleError(error)
  }
}
