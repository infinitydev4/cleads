import { NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { sendMeetingReminders } from "@/features/meetings/service"

export const dynamic = "force-dynamic"

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const given = Buffer.from(request.headers.get("authorization") ?? "")
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** Hourly: reminds the contact and the closer of meetings starting within 24 hours, once each. Safe to run twice. */
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  try {
    return NextResponse.json({ success: true, ...(await sendMeetingReminders()) })
  } catch (error) {
    console.error("[CRON_MEETING_REMINDERS]", error)
    return NextResponse.json({ error: "Erreur lors de l'envoi des rappels" }, { status: 500 })
  }
}
