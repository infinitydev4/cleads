import type { Role as PrismaRole } from "@prisma/client"

/** CRM roles (see docs/crm-v1/PLAN.md §4). The database still stores USER / ADMIN until epic E2. */
export const CRM_ROLES = ["OWNER", "MANAGER", "SDR", "CLOSER", "VIEWER"] as const
export type CrmRole = (typeof CRM_ROLES)[number]

export const ROLE_LABELS: Record<CrmRole, string> = {
  OWNER: "Propriétaire",
  MANAGER: "Manager",
  SDR: "SDR",
  CLOSER: "Closer",
  VIEWER: "Lecteur",
}

/** Interim mapping: an ADMIN account is the owner. Anything else gets the least-privileged role. */
export function toCrmRole(role: PrismaRole | CrmRole | string | undefined | null): CrmRole {
  if (role === "ADMIN") return "OWNER"
  if (role && (CRM_ROLES as readonly string[]).includes(role)) return role as CrmRole
  return "VIEWER"
}
