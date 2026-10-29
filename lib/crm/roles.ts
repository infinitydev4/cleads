import type { Role as PrismaRole } from "@prisma/client"

/** CRM staff roles (docs/crm-v1/PLAN.md section 4), stored in the `Role` enum next to two legacy values. */
export const CRM_ROLES = ["OWNER", "MANAGER", "SDR", "CLOSER", "VIEWER"] as const
export type CrmRole = (typeof CRM_ROLES)[number]

export const ROLE_LABELS: Record<CrmRole, string> = {
  OWNER: "Propriétaire",
  MANAGER: "Manager",
  SDR: "SDR",
  CLOSER: "Closer",
  VIEWER: "Lecteur",
}

export const ROLE_DESCRIPTIONS: Record<CrmRole, string> = {
  OWNER: "Accès complet : équipe, boîtes d’envoi, suppression de données.",
  MANAGER: "Voit et réattribue tout, pilote l’équipe, exporte les données.",
  SDR: "Prospecte et qualifie : ses prospects et le pool non attribué.",
  CLOSER: "Convertit : ses rendez-vous et ses opportunités.",
  VIEWER: "Lecture seule des prospects, du pipeline et des rapports.",
}

export const isStaffRole = (role: string | null | undefined): role is CrmRole =>
  !!role && (CRM_ROLES as readonly string[]).includes(role)

/**
 * Role to use for a stored value. ADMIN (legacy) is treated as OWNER defensively;
 * the migration already converts those rows. USER (a former appointment "client") has no CRM access.
 */
export function toCrmRole(role: PrismaRole | string | undefined | null): CrmRole | null {
  if (role === "ADMIN") return "OWNER"
  return isStaffRole(role) ? role : null
}
