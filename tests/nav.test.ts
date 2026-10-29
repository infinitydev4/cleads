import { describe, expect, it } from "vitest"
import { allNavItems, navFor } from "@/lib/crm/nav"
import { toCrmRole } from "@/lib/crm/roles"
import { CRM_ROLES } from "@/lib/crm/roles"

const ids = (role: Parameters<typeof navFor>[0]) => allNavItems(role).map((i) => i.id)

describe("roles", () => {
  it("maps stored values", () => {
    expect(toCrmRole("ADMIN")).toBe("OWNER")
    expect(toCrmRole("USER")).toBeNull()
    expect(toCrmRole(undefined)).toBeNull()
    expect(toCrmRole("CLOSER")).toBe("CLOSER")
  })
})

describe("navigation by role", () => {
  it("keeps admin tooling for the owner only", () => {
    expect(ids("OWNER")).toEqual(expect.arrayContaining(["design", "legacy", "team", "audit"]))
    for (const role of ["MANAGER", "SDR", "CLOSER", "VIEWER"] as const) {
      expect(ids(role)).not.toContain("design")
      expect(ids(role)).not.toContain("legacy")
    }
  })

  it("shows team and audit to owners and managers only", () => {
    expect(ids("MANAGER")).toEqual(expect.arrayContaining(["team", "audit"]))
    for (const role of ["SDR", "CLOSER", "VIEWER"] as const) {
      expect(ids(role)).not.toContain("team")
      expect(ids(role)).not.toContain("audit")
    }
  })

  it("hides prospecting tools from closers and viewers", () => {
    for (const role of ["CLOSER", "VIEWER"] as const) {
      expect(ids(role)).not.toContain("search")
      expect(ids(role)).not.toContain("sequences")
    }
    expect(ids("SDR")).toEqual(expect.arrayContaining(["search", "sequences", "leads"]))
  })

  it("never returns empty groups and always offers the home page", () => {
    for (const role of CRM_ROLES) {
      expect(navFor(role).groups.every((g) => g.items.length > 0)).toBe(true)
      expect(allNavItems(role).some((i) => i.href === "/app")).toBe(true)
    }
  })
})
