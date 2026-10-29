import { hash } from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import { AuthError, type CurrentUser } from "@/lib/auth/guard"
import { validatePassword } from "@/lib/auth/password"
import { CRM_ROLES, ROLE_LABELS, isStaffRole, toCrmRole, type CrmRole } from "@/lib/crm/roles"
import { INVITATION_TTL_MS, MEMBER_CHANGE_MESSAGES, checkMemberChange, generateToken, hashToken, invitationStatus } from "./rules"
import type { InviteInput, MemberChange } from "./schemas"

/** Business error with a stable code, mapped to a 4xx by the route handlers. */
export class TeamError extends Error {
  constructor(
    public readonly code: "already_member" | "invalid_invitation" | "invalid_password" | "not_found" | "forbidden_change",
    message: string,
    public readonly status: 400 | 404 | 409 | 410 = 400
  ) {
    super(message)
  }
}

const STAFF_ROLES = [...CRM_ROLES, "ADMIN"] as const

export async function listMembers(workspaceId: string) {
  const users = await prisma.user.findMany({
    where: { workspaceId, role: { in: [...STAFF_ROLES] } },
    select: { id: true, name: true, email: true, image: true, role: true, active: true, lastLoginAt: true, createdAt: true },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
  })
  return users.map((u) => ({ ...u, role: toCrmRole(u.role)! }))
}

export async function listPendingInvitations(workspaceId: string) {
  return prisma.invitation.findMany({
    where: { workspaceId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, email: true, role: true, expiresAt: true, createdAt: true, invitedBy: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  })
}

export async function createInvitation(actor: CurrentUser, input: InviteInput, ip?: string | null) {
  const existing = await prisma.user.findFirst({ where: { email: { equals: input.email, mode: "insensitive" } }, select: { role: true } })
  if (existing && isStaffRole(existing.role === "ADMIN" ? "OWNER" : existing.role)) {
    throw new TeamError("already_member", "Cette personne a déjà un accès. Réactivez-la ou modifiez son rôle depuis la liste.", 409)
  }

  const token = generateToken()
  const invitation = await prisma.$transaction(async (tx) => {
    // One live link per person: a new invitation replaces the previous ones.
    await tx.invitation.updateMany({ where: { email: input.email, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } })
    return tx.invitation.create({
      data: { email: input.email, role: input.role, tokenHash: hashToken(token), invitedById: actor.id, workspaceId: actor.workspaceId, expiresAt: new Date(Date.now() + INVITATION_TTL_MS) },
    })
  })
  await audit({
    action: "team.invited",
    actorId: actor.id,
    workspaceId: actor.workspaceId,
    entityType: "Invitation",
    entityId: invitation.id,
    subject: input.email,
    metadata: { role: input.role },
    ip,
  })
  return { invitation, token }
}

export async function revokeInvitation(actor: CurrentUser, id: string, ip?: string | null) {
  const invitation = await prisma.invitation.findFirst({ where: { id, workspaceId: actor.workspaceId } })
  if (!invitation || invitationStatus(invitation) !== "valid") throw new TeamError("not_found", "Invitation introuvable ou déjà utilisée.", 404)
  await prisma.invitation.update({ where: { id }, data: { revokedAt: new Date() } })
  await audit({ action: "team.invite_revoked", actorId: actor.id, workspaceId: actor.workspaceId, entityType: "Invitation", entityId: id, subject: invitation.email, ip })
}

export async function updateMember(actor: CurrentUser, userId: string, change: MemberChange, ip?: string | null) {
  const target = await prisma.user.findFirst({ where: { id: userId, workspaceId: actor.workspaceId }, select: { id: true, role: true, active: true, email: true } })
  const targetRole = toCrmRole(target?.role)
  if (!target || !targetRole) throw new TeamError("not_found", "Membre introuvable.", 404)

  const activeOwners = await prisma.user.count({ where: { workspaceId: actor.workspaceId, role: { in: ["OWNER", "ADMIN"] }, active: true } })
  const problem = checkMemberChange({ actorId: actor.id, target: { id: target.id, role: targetRole, active: target.active }, change, activeOwners })
  if (problem) throw new TeamError("forbidden_change", MEMBER_CHANGE_MESSAGES[problem], 409)

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { ...(change.role ? { role: change.role } : {}), ...(change.active !== undefined ? { active: change.active } : {}) },
    select: { id: true, role: true, active: true },
  })
  if (change.role && change.role !== targetRole) {
    await audit({ action: "team.role_changed", actorId: actor.id, workspaceId: actor.workspaceId, entityType: "User", entityId: userId, subject: target.email ?? undefined, metadata: { from: targetRole, to: change.role } })
  }
  if (change.active !== undefined && change.active !== target.active) {
    await audit({ action: change.active ? "team.reactivated" : "team.deactivated", actorId: actor.id, workspaceId: actor.workspaceId, entityType: "User", entityId: userId, subject: target.email ?? undefined, ip })
  }
  return updated
}

export async function inspectInvitation(token: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, email: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true, invitedBy: { select: { name: true } } },
  })
  if (!invitation) return null
  return { ...invitation, status: invitationStatus(invitation), roleLabel: ROLE_LABELS[invitation.role as CrmRole] ?? invitation.role }
}

/** Single use: the invitation is claimed atomically before the account is created or updated. */
export async function acceptInvitation(token: string, input: { name: string; password: string }, ip?: string | null) {
  const invitation = await prisma.invitation.findUnique({ where: { tokenHash: hashToken(token) } })
  if (!invitation || invitationStatus(invitation) !== "valid") {
    throw new TeamError("invalid_invitation", "Ce lien d’invitation n’est plus valable. Demandez-en un nouveau.", 410)
  }
  const passwordError = validatePassword(input.password, { email: invitation.email, name: input.name })
  if (passwordError) throw new TeamError("invalid_password", passwordError, 400)

  const passwordHash = await hash(input.password, 12)
  const user = await prisma.$transaction(async (tx) => {
    const claimed = await tx.invitation.updateMany({ where: { id: invitation.id, acceptedAt: null, revokedAt: null }, data: { acceptedAt: new Date() } })
    if (claimed.count !== 1) throw new TeamError("invalid_invitation", "Ce lien d’invitation vient d’être utilisé.", 410)
    const existing = await tx.user.findFirst({ where: { email: { equals: invitation.email, mode: "insensitive" } }, select: { id: true } })
    const data = { name: input.name, password: passwordHash, role: invitation.role, active: true, isTemporaryPassword: false, workspaceId: invitation.workspaceId }
    return existing
      ? tx.user.update({ where: { id: existing.id }, data })
      : tx.user.create({ data: { ...data, email: invitation.email } })
  })
  await audit({ action: "team.invite_accepted", actorId: user.id, workspaceId: invitation.workspaceId, entityType: "User", entityId: user.id, subject: invitation.email, metadata: { role: invitation.role }, ip })
  return { email: invitation.email }
}

export { AuthError }
