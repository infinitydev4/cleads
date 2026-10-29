import { describe, expect, it } from "vitest"
import { allNavItems, navFor } from "@/lib/crm/nav"
import { toCrmRole } from "@/lib/crm/roles"

describe("navigation by role", () => {
  it("maps legacy database roles", () => {
    expect(toCrmRole("ADMIN")).toBe("OWNER")
    expect(toCrmRole("USER")).toBe("VIEWER")
    expect(toCrmRole(undefined)).toBe("VIEWER")
    expect(toCrmRole("CLOSER")).toBe("CLOSER")
  })

  it("keeps admin tooling for the owner only", () => {
    const ids = (r: Parameters<typeof navFor>[0]) => allNavItems(r).map((i) => i.id)
    expect(ids("OWNER")).toContain("design")
    for (const role of ["MANAGER", "SDR", "CLOSER", "VIEWER"] as const) {
      expect(ids(role)).not.toContain("design")
      expect(ids(role)).not.toContain("legacy")
    }
  })

  it("hides prospecting tools from closers and viewers", () => {
    for (const role of ["CLOSER", "VIEWER"] as const) {
      const ids = allNavItems(role).map((i) => i.id)
      expect(ids).not.toContain("search")
      expect(ids).not.toContain("sequences")
    }
    expect(allNavItems("SDR").map((i) => i.id)).toEqual(expect.arrayContaining(["search", "sequences", "leads"]))
  })

  it("never returns empty groups and always offers the home page", () => {
    for (const role of ["OWNER", "MANAGER", "SDR", "CLOSER", "VIEWER"] as const) {
      const { groups } = navFor(role)
      expect(groups.every((g) => g.items.length > 0)).toBe(true)
      expect(allNavItems(role).some((i) => i.href === "/app")).toBe(true)
    }
  })
})
