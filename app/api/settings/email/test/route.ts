import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { audit } from "@/lib/audit"
import { rateLimit } from "@/lib/rate-limit"
import { clientIp } from "@/lib/request-ip"
import { sendTest } from "@/lib/mail"

export const dynamic = "force-dynamic"

const schema = z.object({ provider: z.enum(["ses", "resend"]) })

/** Sends a test to the signed-in person's own address through one provider, with no fallback: it shows what that provider really does. */
export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("mailbox:manage")
    if (!(await rateLimit("mail-test", user.id, 10, 3600))) return NextResponse.json({ error: "Trop de tests : réessayez plus tard.", code: "rate_limited" }, { status: 429 })
    const { provider } = schema.parse(await request.json())
    const outcome = await sendTest(provider, user.email)
    await audit({ action: "mail.test_sent", actorId: user.id, workspaceId: user.workspaceId, metadata: { provider, ok: outcome.ok }, ip: clientIp(request.headers) })
    if (!outcome.ok) {
      const reason = outcome.skipped === "not_configured" ? "Ce fournisseur n’est pas configuré sur ce serveur." : outcome.attempts[0]?.error ?? "Échec de l’envoi."
      return NextResponse.json({ ok: false, error: reason }, { status: 502 })
    }
    return NextResponse.json({ ok: true, to: user.email, messageId: outcome.messageId })
  } catch (error) {
    return handleError(error)
  }
}
