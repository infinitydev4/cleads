import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { rolesWith } from "@/lib/rbac"
import { AUDIT_FILTERS, auditLabel } from "@/features/audit/labels"

const read = (path: string) => readFileSync(path, "utf8")

describe("who exports a person's data (E14, D65)", () => {
  it("is the owner and the managers only", () => {
    expect(rolesWith("data:export")).toEqual(["OWNER", "MANAGER"])
  })

  it("guards the route with data:export on the server, and keeps the file out of every cache", () => {
    const route = read("app/api/contacts/[id]/export/route.ts")
    expect(route).toContain('requirePermission("data:export")')
    expect(route).toContain("handleError(error)")
    expect(route).toContain('"Content-Disposition": `attachment;')
    expect(route).toContain('"Cache-Control": "no-store"')
  })

  it("shows the button on the fiche only to those who may export", () => {
    expect(read("features/leads/service.ts")).toContain('export: can(user.role, "data:export")')
    const view = read("app/(crm)/app/leads/lead-detail-view.tsx")
    expect(view).toContain("{k && lead.can.export && (")
    expect(view).toContain("/api/contacts/${k.id}/export")
    expect(view).toContain("Exporter ses données (RGPD)")
  })

  it("names the export in the audit log, with its own filter", () => {
    expect(auditLabel("contact.exported")).toBe("Données d’une personne exportées (RGPD)")
    expect(AUDIT_FILTERS.map((f) => f.value)).toContain("contact.")
  })
})
