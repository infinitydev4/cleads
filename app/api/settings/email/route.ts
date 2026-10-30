import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { audit } from "@/lib/audit"
import { clientIp } from "@/lib/request-ip"
import { providers } from "@/lib/mail"
import { saveMailSettings } from "@/lib/mail/settings"
import { mailStatus } from "@/lib/mail/status"
import { LeadError } from "@/features/leads/errors"

export const dynamic = "force-dynamic"

const schema = z.object({ transactionalProvider: z.enum(["ses", "resend"]), fallbackEnabled: z.boolean() })

export async function GET() {
  try {
    const { user } = await requirePermission("mailbox:manage")
    return NextResponse.json(await mailStatus(user.workspaceId))
  } catch (error) {
    return handleError(error)
  }
}

export async function PUT(request: Request) {
  try {
    const { user } = await requirePermission("mailbox:manage")
    const input = schema.parse(await request.json())
    // Choosing a provider that cannot send would silently switch every email to the fallback: refuse it.
    if (!providers[input.transactionalProvider].configured()) throw new LeadError("invalid", `${providers[input.transactionalProvider].label} n’est pas configuré sur ce serveur (clés manquantes).`)
    await saveMailSettings(user.workspaceId, input, user.id)
    await audit({ action: "mail.settings_changed", actorId: user.id, workspaceId: user.workspaceId, entityType: "MailSetting", entityId: user.workspaceId, metadata: input, ip: clientIp(request.headers) })
    return NextResponse.json(await mailStatus(user.workspaceId))
  } catch (error) {
    return handleError(error)
  }
}
