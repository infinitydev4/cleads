import { NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { defaultWorkspaceId } from "@/lib/mail/workspace"
import { elevenLabsConfigured } from "@/lib/telephony/elevenlabs"
import { dispatchCalls } from "@/features/ai-caller/service"

export const dynamic = "force-dynamic"

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const given = Buffer.from(request.headers.get("authorization") ?? "")
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/**
 * Every five minutes: starts the AI caller's waiting calls when the calling hours open, closes those ElevenLabs never
 * reported on (E33). Most calls leave sooner, right after the previous one ends.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  if (process.env.CRON_RUNNER !== "vercel") return NextResponse.json({ skipped: "Tâches planifiées pas encore basculées sur Vercel (CRON_RUNNER)." }, { status: 202 })
  if (!elevenLabsConfigured()) return NextResponse.json({ skipped: "Agent d’appel IA non configuré." }, { status: 202 })
  try {
    const workspaceId = await defaultWorkspaceId()
    if (!workspaceId) return NextResponse.json({ error: "Aucun espace de travail" }, { status: 500 })
    return NextResponse.json({ success: true, ...(await dispatchCalls(workspaceId)) })
  } catch (error) {
    console.error("[CRON_AI_CALLS]", error)
    return NextResponse.json({ error: "Erreur lors de l’envoi des appels" }, { status: 500 })
  }
}
