import { createHash, randomBytes } from "node:crypto"
import type { CrmRole } from "@/lib/crm/roles"

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** 256 bits, URL safe. Only its hash is stored, so a database leak does not leak working links. */
export const generateToken = () => randomBytes(32).toString("base64url")
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex")

export type InvitationStatus = "valid" | "expired" | "accepted" | "revoked"

export function invitationStatus(
  invitation: { expiresAt: Date; acceptedAt: Date | null; revokedAt: Date | null },
  now = new Date()
): InvitationStatus {
  if (invitation.acceptedAt) return "accepted"
  if (invitation.revokedAt) return "revoked"
  if (invitation.expiresAt.getTime() <= now.getTime()) return "expired"
  return "valid"
}

export type MemberChangeError = "self" | "last_owner"

/**
 * Rules for changing a member's role or access. `activeOwners` counts active owners before the change.
 * Returns an error code, or null when the change is allowed.
 */
export function checkMemberChange(input: {
  actorId: string
  target: { id: string; role: CrmRole; active: boolean }
  change: { role?: CrmRole; active?: boolean }
  activeOwners: number
}): MemberChangeError | null {
  const { actorId, target, change, activeOwners } = input
  if (target.id === actorId) return "self"
  const losesOwnership = target.role === "OWNER" && target.active && (change.active === false || (change.role !== undefined && change.role !== "OWNER"))
  if (losesOwnership && activeOwners <= 1) return "last_owner"
  return null
}

export const MEMBER_CHANGE_MESSAGES: Record<MemberChangeError, string> = {
  self: "Vous ne pouvez pas modifier votre propre accès.",
  last_owner: "Il doit rester au moins un propriétaire actif.",
}
