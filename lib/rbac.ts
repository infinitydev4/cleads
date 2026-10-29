import { CRM_ROLES, type CrmRole } from "@/lib/crm/roles"

/**
 * Who may do what (docs/crm-v1/PLAN.md section 4). This table is the only place where rights are
 * decided: pages, API routes, server actions and the navigation all read it.
 *
 * A role listed for a permission can do it; the value says on which records:
 *  - "all":  every record;
 *  - "pool": records assigned to the user plus the unassigned pool;
 *  - "own":  records assigned to the user.
 * Permissions that are not about records use "all".
 */
export type Scope = "all" | "pool" | "own"

const matrix = {
  // Prospects and pipeline
  "lead:read": { OWNER: "all", MANAGER: "all", SDR: "pool", CLOSER: "own", VIEWER: "all" },
  "lead:write": { OWNER: "all", MANAGER: "all", SDR: "pool", CLOSER: "own" },
  "deal:read": { OWNER: "all", MANAGER: "all", SDR: "pool", CLOSER: "own", VIEWER: "all" },
  /** SDRs move an opportunity up to "Qualifié" only. */
  "deal:qualify": { OWNER: "all", MANAGER: "all", SDR: "pool" },
  "deal:move": { OWNER: "all", MANAGER: "all", CLOSER: "own" },
  // Prospecting tools
  "search:run": { OWNER: "all", MANAGER: "all", SDR: "all" },
  "sequence:manage": { OWNER: "all", MANAGER: "all", SDR: "all" },
  "email:send": { OWNER: "all", MANAGER: "all", SDR: "own", CLOSER: "own" },
  "mailbox:manage": { OWNER: "all" },
  // Meetings
  "meeting:read": { OWNER: "all", MANAGER: "all", SDR: "all", CLOSER: "own", VIEWER: "all" },
  "meeting:book": { OWNER: "all", MANAGER: "all", SDR: "all", CLOSER: "own" },
  // Reports and data
  "report:read": { OWNER: "all", MANAGER: "all", SDR: "own", CLOSER: "own", VIEWER: "all" },
  "data:export": { OWNER: "all", MANAGER: "all" },
  "data:delete": { OWNER: "all" },
  // Administration
  "team:read": { OWNER: "all", MANAGER: "all" },
  "team:manage": { OWNER: "all" },
  "audit:read": { OWNER: "all", MANAGER: "all" },
  "admin:tools": { OWNER: "all" },
  /** The pre-CRM back-office (appointments, clients). */
  "legacy:access": { OWNER: "all" },
} as const satisfies Record<string, Partial<Record<CrmRole, Scope>>>

export type Permission = keyof typeof matrix
export const PERMISSIONS = Object.keys(matrix) as Permission[]

export function scopeOf(role: CrmRole, permission: Permission): Scope | null {
  const entry = matrix[permission] as Partial<Record<CrmRole, Scope>>
  return entry[role] ?? null
}

export const can = (role: CrmRole, permission: Permission) => scopeOf(role, permission) !== null

/** Roles holding a permission, for display and tests. */
export const rolesWith = (permission: Permission): CrmRole[] => CRM_ROLES.filter((role) => can(role, permission))

interface Actor {
  id: string
  role: CrmRole
}

/** Can this user act on a record owned by `ownerId` (null = unassigned pool)? */
export function canAccessRecord(actor: Actor, permission: Permission, ownerId: string | null | undefined): boolean {
  const scope = scopeOf(actor.role, permission)
  if (scope === "all") return true
  if (scope === "own") return ownerId === actor.id
  if (scope === "pool") return ownerId == null || ownerId === actor.id
  return false
}

export type RecordFilter = { kind: "all" } | { kind: "owner"; ownerId: string } | { kind: "ownerOrPool"; ownerId: string } | { kind: "none" }

/** What a list query must restrict to; epics E4+ translate it to their `where`. */
export function recordFilter(actor: Actor, permission: Permission): RecordFilter {
  switch (scopeOf(actor.role, permission)) {
    case "all":
      return { kind: "all" }
    case "own":
      return { kind: "owner", ownerId: actor.id }
    case "pool":
      return { kind: "ownerOrPool", ownerId: actor.id }
    default:
      return { kind: "none" }
  }
}
