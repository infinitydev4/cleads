import { describe, expect, it } from "vitest"
import { PERMISSIONS, can, canAccessRecord, recordFilter, rolesWith, scopeOf } from "@/lib/rbac"
import { CRM_ROLES, type CrmRole } from "@/lib/crm/roles"

// The table of docs/crm-v1/PLAN.md section 4, one line per row. "-" = not allowed.
const expected: Record<string, Record<CrmRole, string>> = {
  "lead:read": { OWNER: "all", MANAGER: "all", SDR: "pool", CLOSER: "own", VIEWER: "all" },
  "lead:write": { OWNER: "all", MANAGER: "all", SDR: "pool", CLOSER: "own", VIEWER: "-" },
  "lead:import": { OWNER: "all", MANAGER: "all", SDR: "all", CLOSER: "-", VIEWER: "-" },
  "lead:merge": { OWNER: "all", MANAGER: "all", SDR: "-", CLOSER: "-", VIEWER: "-" },
  "task:write": { OWNER: "all", MANAGER: "all", SDR: "all", CLOSER: "all", VIEWER: "-" },
  "search:run": { OWNER: "all", MANAGER: "all", SDR: "all", CLOSER: "-", VIEWER: "-" },
  "email:send": { OWNER: "all", MANAGER: "all", SDR: "own", CLOSER: "own", VIEWER: "-" },
  "sequence:manage": { OWNER: "all", MANAGER: "all", SDR: "all", CLOSER: "-", VIEWER: "-" },
  "deal:move": { OWNER: "all", MANAGER: "all", SDR: "-", CLOSER: "own", VIEWER: "-" },
  "deal:qualify": { OWNER: "all", MANAGER: "all", SDR: "pool", CLOSER: "-", VIEWER: "-" },
  "meeting:book": { OWNER: "all", MANAGER: "all", SDR: "all", CLOSER: "own", VIEWER: "-" },
  "report:read": { OWNER: "all", MANAGER: "all", SDR: "own", CLOSER: "own", VIEWER: "all" },
  "team:manage": { OWNER: "all", MANAGER: "-", SDR: "-", CLOSER: "-", VIEWER: "-" },
  "data:export": { OWNER: "all", MANAGER: "all", SDR: "-", CLOSER: "-", VIEWER: "-" },
  "data:delete": { OWNER: "all", MANAGER: "-", SDR: "-", CLOSER: "-", VIEWER: "-" },
  "audit:read": { OWNER: "all", MANAGER: "all", SDR: "-", CLOSER: "-", VIEWER: "-" },
  "mailbox:manage": { OWNER: "all", MANAGER: "-", SDR: "-", CLOSER: "-", VIEWER: "-" },
}

describe("role matrix", () => {
  for (const [permission, roles] of Object.entries(expected)) {
    for (const role of CRM_ROLES) {
      it(`${role} ${roles[role] === "-" ? "cannot" : `can (${roles[role]})`} ${permission}`, () => {
        expect(scopeOf(role, permission as never) ?? "-").toBe(roles[role])
      })
    }
  }

  it("lets nobody but the owner reach the legacy back-office or admin tools", () => {
    expect(rolesWith("legacy:access")).toEqual(["OWNER"])
    expect(rolesWith("admin:tools")).toEqual(["OWNER"])
  })

  it("never lets a read-only viewer write anything", () => {
    for (const permission of PERMISSIONS) {
      if (/:(write|move|qualify|book|send|manage|delete|run|import|merge)$/.test(permission)) {
        expect(can("VIEWER", permission), permission).toBe(false)
      }
    }
  })

  it("gives every role at least the right to read the pipeline", () => {
    for (const role of CRM_ROLES) expect(can(role, "deal:read")).toBe(true)
  })
})

describe("record scope", () => {
  const sdr = { id: "sdr-1", role: "SDR" as const }
  const closer = { id: "closer-1", role: "CLOSER" as const }
  const manager = { id: "mgr-1", role: "MANAGER" as const }

  it("pool: own and unassigned records, not a colleague's", () => {
    expect(canAccessRecord(sdr, "lead:read", "sdr-1")).toBe(true)
    expect(canAccessRecord(sdr, "lead:read", null)).toBe(true)
    expect(canAccessRecord(sdr, "lead:read", "sdr-2")).toBe(false)
  })

  it("own: only assigned records, the unassigned pool stays closed", () => {
    expect(canAccessRecord(closer, "deal:move", "closer-1")).toBe(true)
    expect(canAccessRecord(closer, "deal:move", null)).toBe(false)
    expect(canAccessRecord(closer, "deal:move", "sdr-1")).toBe(false)
  })

  it("all: every record; none: no record", () => {
    expect(canAccessRecord(manager, "lead:write", "anyone")).toBe(true)
    expect(canAccessRecord(closer, "search:run", null)).toBe(false)
  })

  it("translates the scope into a query restriction", () => {
    expect(recordFilter(manager, "lead:read")).toEqual({ kind: "all" })
    expect(recordFilter(sdr, "lead:read")).toEqual({ kind: "ownerOrPool", ownerId: "sdr-1" })
    expect(recordFilter(closer, "lead:read")).toEqual({ kind: "owner", ownerId: "closer-1" })
    expect(recordFilter(closer, "search:run")).toEqual({ kind: "none" })
  })
})
