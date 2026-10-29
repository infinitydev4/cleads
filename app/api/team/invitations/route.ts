import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { inviteSchema } from "@/features/team/schemas"
import { createInvitation, listPendingInvitations } from "@/features/team/service"
import { invitationLink, sendInvitationEmail } from "@/features/team/invite-email"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const { user } = await requirePermission("team:read")
    return NextResponse.json(await listPendingInvitations(user.workspaceId))
  } catch (error) {
    return handleError(error)
  }
}

/** Returns the link once: the token is not stored, so it cannot be shown again later. */
export async function POST(request: Request) {
  try {
    const { user } = await requirePermission("team:manage")
    const input = inviteSchema.parse(await request.json())
    const { invitation, token } = await createInvitation(user, input, clientIp(request.headers))
    const link = invitationLink(token)
    const emailSent = await sendInvitationEmail({ to: input.email, role: input.role, inviterName: user.name, link })
    return NextResponse.json({ id: invitation.id, email: input.email, role: input.role, expiresAt: invitation.expiresAt, link, emailSent }, { status: 201 })
  } catch (error) {
    return handleError(error)
  }
}
