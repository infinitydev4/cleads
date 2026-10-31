import { NextResponse } from "next/server"
import { handleError } from "@/lib/api"
import { rateLimit } from "@/lib/rate-limit"
import { clientIp } from "@/lib/request-ip"
import { unsubscribe } from "@/features/outreach/unsubscribe"

export const dynamic = "force-dynamic"
const noStore = { "Cache-Control": "no-store" }

/**
 * One-click unsubscribe (RFC 8058): mail clients POST `List-Unsubscribe=One-Click` here, without cookies or a page.
 * The confirmation button of /u/<token> posts here too. A link we did not sign answers 404.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const ip = clientIp(request.headers)
    if (!(await rateLimit("unsubscribe", ip, 60, 3600))) return NextResponse.json({ error: "Trop de demandes : réessayez plus tard." }, { status: 429, headers: noStore })
    const ok = await unsubscribe(decodeURIComponent((await params).token), ip)
    return NextResponse.json(ok ? { ok: true } : { error: "Lien inconnu" }, { status: ok ? 200 : 404, headers: noStore })
  } catch (error) {
    return handleError(error)
  }
}

/** A GET never unsubscribes (link scanners open every URL): it shows the confirmation page. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  return NextResponse.redirect(new URL(`/u/${encodeURIComponent((await params).token)}`, request.url), 303)
}
