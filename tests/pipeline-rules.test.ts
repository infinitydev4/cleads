import { describe, expect, it } from "vitest"
import type { DealStage } from "@prisma/client"
import { CRM_ROLES, type CrmRole } from "@/lib/crm/roles"
import { DEAL_OWNER_ROLES, DISQUALIFY_REASONS, LOST_REASONS, OPEN_STAGES, STAGES, checkDealAssign, checkDealMove, isOpen, qualificationSchema } from "@/features/pipeline/rules"

const me = (role: CrmRole) => ({ id: `${role}-1`, role })

describe("moving an opportunity", () => {
  it("only closers (their own), managers and owners move opportunities", () => {
    for (const from of STAGES) {
      for (const to of STAGES) {
        for (const role of CRM_ROLES) {
          const mine = checkDealMove({ actor: me(role), deal: { ownerId: me(role).id, stage: from }, to, lostReason: "Budget insuffisant" })
          const theirs = checkDealMove({ actor: me(role), deal: { ownerId: "someone-else", stage: from }, to, lostReason: "Budget insuffisant" })
          const unassigned = checkDealMove({ actor: me(role), deal: { ownerId: null, stage: from }, to, lostReason: "Budget insuffisant" })
          const label = `${role} ${from}->${to}`
          if (role === "SDR" || role === "VIEWER") {
            expect(mine?.code, label).toBe("forbidden")
            expect(theirs?.code, label).toBe("forbidden")
          } else if (role === "CLOSER") {
            expect(theirs?.code, label).toBe("forbidden")
            expect(unassigned?.code, label).toBe("forbidden")
            // Their own: free inside the open stages, and into WON or LOST; reopening a closed one is refused.
            const reopening = !isOpen(from) && from !== to
            expect(mine?.code ?? null, label).toBe(reopening ? "forbidden" : null)
          } else {
            expect(mine, label).toBeNull()
            expect(theirs, label).toBeNull()
            expect(unassigned, label).toBeNull()
          }
        }
      }
    }
  })

  it("never needs a reason unless the opportunity is lost", () => {
    expect(checkDealMove({ actor: me("CLOSER"), deal: { ownerId: "CLOSER-1", stage: "PROPOSAL" }, to: "WON" })).toBeNull()
    expect(checkDealMove({ actor: me("CLOSER"), deal: { ownerId: "CLOSER-1", stage: "PROPOSAL" }, to: "LOST" })).toMatchObject({ code: "invalid" })
    expect(checkDealMove({ actor: me("CLOSER"), deal: { ownerId: "CLOSER-1", stage: "PROPOSAL" }, to: "LOST", lostReason: "   " })).toMatchObject({ code: "invalid" })
    expect(checkDealMove({ actor: me("MANAGER"), deal: { ownerId: null, stage: "PROPOSAL" }, to: "LOST", lostReason: "Autre" })).toBeNull()
  })

  it("a manager reopens a lost opportunity, a closer cannot, and staying put is never an error", () => {
    expect(checkDealMove({ actor: me("MANAGER"), deal: { ownerId: "x", stage: "LOST" }, to: "NEGOTIATION" })).toBeNull()
    expect(checkDealMove({ actor: me("CLOSER"), deal: { ownerId: "CLOSER-1", stage: "WON" }, to: "PROPOSAL" })).toMatchObject({ code: "forbidden" })
    expect(checkDealMove({ actor: me("CLOSER"), deal: { ownerId: "CLOSER-1", stage: "WON" }, to: "WON" })).toBeNull()
  })
})

describe("handing an opportunity over", () => {
  it("managers and owners assign anyone, others only keep what they have", () => {
    for (const role of CRM_ROLES) {
      const r = checkDealAssign(me(role), { ownerId: null }, "someone")
      expect(r === null, role).toBe(role === "OWNER" || role === "MANAGER")
      expect(checkDealAssign(me(role), { ownerId: "x" }, "x"), `${role} unchanged`).toBeNull()
    }
  })
})

describe("the pipeline vocabulary", () => {
  it("has the stages in order, open ones first", () => {
    expect(STAGES).toEqual(["QUALIFIED", "MEETING_SET", "PROPOSAL", "NEGOTIATION", "WON", "LOST"])
    expect(OPEN_STAGES.every(isOpen)).toBe(true)
    expect((["WON", "LOST"] as DealStage[]).some(isOpen)).toBe(false)
  })
  it("offers fixed reasons so that they can be counted, with a free 'Autre'", () => {
    expect(LOST_REASONS).toContain("Autre")
    expect(DISQUALIFY_REASONS).toContain("Autre")
    expect(new Set(LOST_REASONS).size).toBe(LOST_REASONS.length)
    expect(DEAL_OWNER_ROLES).not.toContain("SDR")
  })
})

describe("qualification answers", () => {
  it("accepts a partial answer: every field is optional", () => {
    expect(qualificationSchema.parse({})).toEqual({})
    expect(qualificationSchema.parse({ need: "  Refonte du site  ", budget: "yes", budgetAmountCents: 500000, authority: "decision_maker", timing: "1_3_months" })).toMatchObject({ need: "Refonte du site", budget: "yes" })
  })
  it("refuses values outside the guided choices", () => {
    expect(() => qualificationSchema.parse({ budget: "huge" })).toThrow()
    expect(() => qualificationSchema.parse({ timing: "yesterday" })).toThrow()
    expect(() => qualificationSchema.parse({ budgetAmountCents: -1 })).toThrow()
    expect(() => qualificationSchema.parse({ need: "x".repeat(1001) })).toThrow()
  })
})
