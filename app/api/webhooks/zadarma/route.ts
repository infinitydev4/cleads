import { NextResponse } from "next/server"
import { verifyWebhook } from "@/lib/telephony/zadarma"
import { defaultWorkspaceId } from "@/lib/mail/workspace"
import { pbxTime } from "@/features/telephony/rules"
import { attachRecording, recordCall } from "@/features/telephony/service"

export const dynamic = "force-dynamic"

/**
 * Zadarma checks the address before saving it: it calls it with ?zd_echo=… and expects the value back as it was sent.
 * Only a short token is echoed, as plain text.
 */
export async function GET(request: Request) {
  const echo = new URL(request.url).searchParams.get("zd_echo")
  if (!echo || !/^[\w.-]{1,128}$/.test(echo)) return NextResponse.json({ error: "zd_echo manquant" }, { status: 400 })
  return new Response(echo, { headers: { "Content-Type": "text/plain; charset=utf-8" } })
}

/**
 * The PBX's call notifications (Settings › Integrations and API › Notifications), signed with the API secret: the end
 * of a call, out or in, and its recording once ready. Every other event is acknowledged and dropped. The nightly sync
 * (/api/cron/calls-sync) files what a refused or lost notification missed.
 */
export async function POST(request: Request) {
  const secret = process.env.ZADARMA_API_SECRET
  if (!secret) return NextResponse.json({ error: "ZADARMA_API_SECRET is not set" }, { status: 503 })

  const fields = new URLSearchParams(await request.text())
  const event = fields.get("event") ?? ""
  if (!["NOTIFY_OUT_END", "NOTIFY_END", "NOTIFY_RECORD"].includes(event)) return new Response(null, { status: 200 })
  if (!verifyWebhook(fields, request.headers.get("signature"), secret)) return NextResponse.json({ error: "Signature invalide" }, { status: 403 })

  const pbxCallId = fields.get("pbx_call_id")
  if (!pbxCallId) return NextResponse.json({ error: "pbx_call_id manquant" }, { status: 400 })
  if (event === "NOTIFY_RECORD") {
    const recording = fields.get("call_id_with_rec")
    return NextResponse.json({ attached: recording ? await attachRecording(pbxCallId, recording) : false })
  }

  const workspaceId = await defaultWorkspaceId()
  if (!workspaceId) return NextResponse.json({ error: "Aucun espace de travail" }, { status: 500 })
  const out = event === "NOTIFY_OUT_END"
  const extension = (out ? fields.get("internal") : fields.get("last_internal") || fields.get("internal")) || null
  const result = await recordCall(workspaceId, {
    externalId: pbxCallId,
    direction: out ? "OUTBOUND" : "INBOUND",
    extension,
    number: (out ? fields.get("destination") : fields.get("caller_id")) ?? "",
    // The notification comes when the call ends: without a readable start, now less its length is close enough.
    startedAt: pbxTime(fields.get("call_start")) ?? new Date(Date.now() - Number(fields.get("duration") ?? 0) * 1000),
    durationSec: Number(fields.get("duration") ?? 0) || 0,
    disposition: fields.get("disposition") ?? "",
    recordingId: fields.get("is_recorded") === "1" ? fields.get("call_id_with_rec") || null : null,
  })
  return NextResponse.json({ filed: result.created, matched: Boolean(result.leadId) })
}
