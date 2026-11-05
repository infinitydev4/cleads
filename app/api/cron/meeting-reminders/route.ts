import { NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { sendMeetingReminders } from "@/features/meetings/service"
import { queueResearch } from "@/features/research/schedule"

export const dynamic = "force-dynamic"

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const given = Buffer.from(request.headers.get("authorization") ?? "")
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

async function run() {
  try {
    const reminders = await sendMeetingReminders()
    return NextResponse.json({ success: true, ...reminders, research: await queueResearch() })
  } catch (error) {
    console.error("[CRON_MEETING_REMINDERS]", error)
    return NextResponse.json({ error: "Erreur lors de l'envoi des rappels" }, { status: 500 })
  }
}

/**
 * Hourly: reminds the contact and the closer of meetings starting within 24 hours, once each. Safe to run twice. Then
 * queues the Enquêteur's scheduled work (E30 lot 2): the brief of tomorrow's meetings, and the GEO probes of the day.
 * Called by Vercel Cron (vercel.json); works only with CRON_RUNNER=vercel (docs/crm-v1/MIGRATION-VERCEL.md).
 */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  if (process.env.CRON_RUNNER !== "vercel") return NextResponse.json({ skipped: "Tâches planifiées pas encore basculées sur Vercel (CRON_RUNNER)." }, { status: 202 })
  return run()
}
