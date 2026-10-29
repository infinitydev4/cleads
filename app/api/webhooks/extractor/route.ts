import { NextResponse } from "next/server"
import { handleExtractorWebhook } from "@/features/search/service"

export const dynamic = "force-dynamic"

/** Public on purpose: the HMAC signature and timestamp are the credential. Nothing here reads a session. */
export async function POST(request: Request) {
  const raw = await request.text() // the signature covers the exact bytes, so read them before parsing
  if (raw.length > 256 * 1024) return NextResponse.json({ error: "too_large" }, { status: 400 })
  const outcome = await handleExtractorWebhook(raw, request.headers)
  return NextResponse.json(outcome.body, { status: outcome.status })
}
