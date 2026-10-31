import { NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { pollAll } from "@/features/outreach/poll"

export const dynamic = "force-dynamic"
export const maxDuration = 60

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const given = Buffer.from(request.headers.get("authorization") ?? "")
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** Every few minutes: reads replies and bounces in the prospecting mailboxes. Safe to run twice (a claim per mailbox). */
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  try {
    return NextResponse.json({ success: true, ...(await pollAll()) })
  } catch (error) {
    console.error("[CRON_MAILBOX_POLL]", error)
    return NextResponse.json({ error: "Erreur lors de la lecture des boîtes" }, { status: 500 })
  }
}
