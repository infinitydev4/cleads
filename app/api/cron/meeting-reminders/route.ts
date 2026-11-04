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
  // On Vercel the tasks come from Vercel Cron (GET): a call from Netlify's functions after the switch is ignored.
  if (process.env.VERCEL) return NextResponse.json({ skipped: "Sur Vercel, ces tâches passent par Vercel Cron." }, { status: 202 })
  return run()
}

async function run() {
  try {
    return NextResponse.json({ success: true, ...(await sendMeetingReminders()) })
  } catch (error) {
    console.error("[CRON_MEETING_REMINDERS]", error)
    return NextResponse.json({ error: "Erreur lors de l'envoi des rappels" }, { status: 500 })
  }
}

/**
 * Vercel Cron calls in GET, with the same secret. It runs only once the tasks are switched to Vercel
 * (CRON_RUNNER=vercel, docs/crm-v1/MIGRATION-VERCEL.md): Netlify and Vercel never send at once.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  if (process.env.CRON_RUNNER !== "vercel") return NextResponse.json({ skipped: "Tâches planifiées pas encore basculées sur Vercel (CRON_RUNNER)." }, { status: 202 })
  return run()
}
