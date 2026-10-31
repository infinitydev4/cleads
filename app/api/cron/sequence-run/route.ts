import { NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { runSequences } from "@/features/outreach/sequence-run"

export const dynamic = "force-dynamic"
export const maxDuration = 60

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const given = Buffer.from(request.headers.get("authorization") ?? "")
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** Every few minutes: sends the sequence steps that are due, inside the send window. Safe to run twice (leases). */
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  try {
    return NextResponse.json({ success: true, ...(await runSequences()) })
  } catch (error) {
    console.error("[CRON_SEQUENCE_RUN]", error)
    return NextResponse.json({ error: "Erreur lors de l'envoi des séquences" }, { status: 500 })
  }
}
