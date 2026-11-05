import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { CONVERSION_COLUMNS, PERSON_INDICATORS, PROSPECTING_COLUMNS } from "@/features/metrics/definitions"
import { currentPeriod, isFuture, mondayOf, monthPeriod, parseReportPeriod, periodQuery, shiftPeriod, weekPeriod } from "@/features/metrics/periods"
import { csvCell, wonCsv } from "@/features/metrics/won-csv"
import { navGroups } from "@/lib/crm/nav"

const HOUR = 3600_000
const span = (p: { from: Date; to: Date }) => (p.to.getTime() - p.from.getTime()) / HOUR

describe("report periods (E10, D55)", () => {
  it("cuts calendar months at Paris midnight, summer time included", () => {
    const nov = monthPeriod("2026-11")
    expect(nov).toMatchObject({ kind: "mois", key: "2026-11", label: "Novembre 2026" })
    expect(nov.from.toISOString()).toBe("2026-10-31T23:00:00.000Z")
    expect(nov.to.toISOString()).toBe("2026-11-30T23:00:00.000Z")
    // March 2026 loses an hour on the 29th.
    const mar = monthPeriod("2026-03")
    expect(mar.from.toISOString()).toBe("2026-02-28T23:00:00.000Z")
    expect(mar.to.toISOString()).toBe("2026-03-31T22:00:00.000Z")
    expect(span(mar)).toBe(31 * 24 - 1)
  })

  it("cuts weeks from Monday to Sunday, across the changes of time", () => {
    const autumn = weekPeriod("2026-10-19") // the clocks go back on Sunday 25 October
    expect(autumn.from.toISOString()).toBe("2026-10-18T22:00:00.000Z")
    expect(autumn.to.toISOString()).toBe("2026-10-25T23:00:00.000Z")
    expect(span(autumn)).toBe(7 * 24 + 1)
    expect(span(weekPeriod("2026-03-23"))).toBe(7 * 24 - 1) // forward on Sunday 29 March
    expect(span(weekPeriod("2026-11-02"))).toBe(7 * 24)
  })

  it("names weeks the French way, across months and years", () => {
    expect(weekPeriod("2026-11-02").label).toBe("Semaine du 2 au 8 novembre 2026")
    expect(weekPeriod("2026-10-26").label).toBe("Semaine du 26 octobre au 1er novembre 2026")
    expect(weekPeriod("2025-12-29").label).toBe("Semaine du 29 décembre 2025 au 4 janvier 2026")
    expect(weekPeriod("2026-06-01").label).toBe("Semaine du 1er au 7 juin 2026")
  })

  it("finds the Monday of any day, and moves one period at a time", () => {
    expect(mondayOf("2026-11-08")).toBe("2026-11-02") // a Sunday
    expect(mondayOf("2026-11-02")).toBe("2026-11-02")
    expect(shiftPeriod(monthPeriod("2026-01"), -1).key).toBe("2025-12")
    expect(shiftPeriod(monthPeriod("2026-12"), 1).key).toBe("2027-01")
    expect(shiftPeriod(weekPeriod("2026-11-02"), -1).key).toBe("2026-10-26")
    expect(periodQuery(weekPeriod("2026-11-02"))).toBe("periode=semaine&du=2026-11-02")
  })

  it("reads the address, and falls back to the current month for anything odd or still to come", () => {
    const now = new Date("2026-11-30T23:30:00Z") // already 1 December in Paris
    expect(currentPeriod("mois", now).key).toBe("2026-12")
    expect(currentPeriod("semaine", now).key).toBe("2026-11-30")
    expect(parseReportPeriod({}, now).key).toBe("2026-12")
    expect(parseReportPeriod({ periode: "mois", du: "2026-10" }, now).key).toBe("2026-10")
    expect(parseReportPeriod({ periode: "mois", du: "2026-13" }, now).key).toBe("2026-12")
    expect(parseReportPeriod({ periode: "mois", du: "2027-02" }, now).key).toBe("2026-12")
    expect(parseReportPeriod({ periode: "semaine", du: "2026-11-05" }, now).key).toBe("2026-11-02")
    expect(parseReportPeriod({ periode: "semaine", du: "n'importe" }, now).key).toBe("2026-11-30")
    expect(isFuture(monthPeriod("2027-01"), now)).toBe(true)
    expect(isFuture(monthPeriod("2026-12"), now)).toBe(false)
  })
})

describe("report definitions", () => {
  it("defines every figure the tables show", () => {
    for (const k of [...PROSPECTING_COLUMNS, ...CONVERSION_COLUMNS]) {
      expect(PERSON_INDICATORS[k].label.length, k).toBeGreaterThan(2)
      expect(PERSON_INDICATORS[k].definition.length, k).toBeGreaterThan(30)
    }
  })
})

describe("won opportunities as CSV", () => {
  const row = { dealId: "d1", leadId: "l1", wonAt: "2026-11-30T23:30:00.000Z", company: "Boulangerie Durand", owner: "Léa", createdBy: "Sam", amountCents: 450050, currency: "EUR" }

  it("reads in Excel in French: BOM, semicolons, decimal comma, Paris dates", () => {
    const csv = wonCsv([row, { ...row, dealId: "d2", amountCents: null, owner: null, createdBy: null }])
    expect(csv.startsWith("﻿Date du gain;Entreprise;Closer;")).toBe(true)
    const lines = csv.trimEnd().split("\r\n")
    expect(lines).toHaveLength(3)
    expect(lines[1]).toBe("01/12/2026;Boulangerie Durand;Léa;Sam;4500,50;EUR;d1")
    expect(lines[2]).toBe("01/12/2026;Boulangerie Durand;;;;EUR;d2")
  })

  it("never lets a name from the web become a formula, and quotes what needs quoting", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe(`"'=HYPERLINK(""http://x"")"`)
    expect(csvCell("+33 1 23")).toBe("'+33 1 23")
    expect(csvCell("@cmd")).toBe("'@cmd")
    expect(csvCell("Dupont; fils")).toBe('"Dupont; fils"')
    expect(csvCell("Garage Martin")).toBe("Garage Martin")
  })
})

describe("who reaches the reports", () => {
  const read = (path: string) => readFileSync(path, "utf8")

  it("guards the page with report:read and the export with data:export, on the server", () => {
    expect(read("app/(crm)/app/reports/page.tsx")).toContain('requirePagePermission("report:read")')
    expect(read("app/api/reports/won/route.ts")).toContain('requirePermission("data:export")')
  })

  it("shows « Rapports » in the menu, no longer as « bientôt »", () => {
    const item = navGroups.flatMap((g) => g.items).find((i) => i.id === "reports")
    expect(item).toMatchObject({ href: "/app/reports", permission: "report:read" })
    expect(item?.soon).toBeFalsy()
  })
})
