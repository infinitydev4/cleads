import { NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { zadarmaConfigured } from "@/lib/telephony/zadarma"
import { defaultWorkspaceId } from "@/lib/mail/workspace"
import { syncCalls } from "@/features/telephony/service"

export const dynamic = "force-dynamic"

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const given = Buffer.from(request.headers.get("authorization") ?? "")
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/**
 * Nightly: files the Zadarma calls of the last 48 hours that no notification brought, and corrects the others' facts
 * (E32). Called by Vercel Cron (vercel.json); works only with CRON_RUNNER=vercel and the Zadarma keys set.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  if (process.env.CRON_RUNNER !== "vercel") return NextResponse.json({ skipped: "Tâches planifiées pas encore basculées sur Vercel (CRON_RUNNER)." }, { status: 202 })
  if (!zadarmaConfigured()) return NextResponse.json({ skipped: "Téléphonie Zadarma non configurée." }, { status: 202 })
  try {
    const workspaceId = await defaultWorkspaceId()
    if (!workspaceId) return NextResponse.json({ error: "Aucun espace de travail" }, { status: 500 })
    return NextResponse.json({ success: true, ...(await syncCalls(workspaceId)) })
  } catch (error) {
    console.error("[CRON_CALLS_SYNC]", error)
    return NextResponse.json({ error: "Erreur lors de la synchronisation des appels" }, { status: 500 })
  }
}
