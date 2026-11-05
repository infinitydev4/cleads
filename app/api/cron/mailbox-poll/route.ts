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

async function run() {
  try {
    return NextResponse.json({ success: true, ...(await pollAll()) })
  } catch (error) {
    console.error("[CRON_MAILBOX_POLL]", error)
    return NextResponse.json({ error: "Erreur lors de la lecture des boîtes" }, { status: 500 })
  }
}

/**
 * Every few minutes: reads replies and bounces in the prospecting mailboxes. Safe to run twice (a claim per mailbox).
 * Called by Vercel Cron (vercel.json); works only with CRON_RUNNER=vercel (docs/crm-v1/MIGRATION-VERCEL.md).
 */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  if (process.env.CRON_RUNNER !== "vercel") return NextResponse.json({ skipped: "Tâches planifiées pas encore basculées sur Vercel (CRON_RUNNER)." }, { status: 202 })
  return run()
}
