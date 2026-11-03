import { describe, expect, it } from "vitest"
import { ExtractorError } from "@/lib/extractor/client"
import { normalizeTags } from "@/lib/crm/normalize"
import { LeadError } from "@/features/leads/errors"
import { AGENTS } from "@/features/ai/agents"
import { ACTIONS, CORE_ACTIONS } from "@/features/ai/actions/catalog"
import { effectivePolicy } from "@/features/ai/actions/policy"
import { isOpen, levelOf } from "@/features/ai/tools"
import { MISSION_ACTIONS, missionSignatures } from "@/features/missions/actions"
import { missionTag, transient } from "@/features/missions/engine"
import { describeRecurrence, nextOccurrence, parisTime } from "@/features/missions/recurrence"
import { missionRequestSchema, planSchema } from "@/features/missions/schemas"

// E28 lot 2: what a mission can run, when a recurring one comes back, and the words around them.

describe("recurring missions", () => {
  it("come back at a time of Paris, in winter and in summer", () => {
    // Tuesday 3 November 2026, 10 h in Paris (UTC+1).
    const now = new Date("2026-11-03T09:00:00Z")
    expect(nextOccurrence({ frequency: "daily", hour: 8 }, now).toISOString()).toBe("2026-11-04T07:00:00.000Z")
    expect(nextOccurrence({ frequency: "daily", hour: 11, minute: 30 }, now).toISOString()).toBe("2026-11-03T10:30:00.000Z")
    expect(nextOccurrence({ frequency: "weekly", days: [1], hour: 8 }, now).toISOString()).toBe("2026-11-09T07:00:00.000Z")
    expect(nextOccurrence({ frequency: "weekly", days: [2, 5], hour: 8 }, now).toISOString()).toBe("2026-11-06T07:00:00.000Z")
    // Without days, a weekly mission comes back on Mondays.
    expect(nextOccurrence({ frequency: "weekly", hour: 8 }, now).toISOString()).toBe("2026-11-09T07:00:00.000Z")
    expect(parisTime(2027, 6, 1, 8, 0).toISOString()).toBe("2027-06-01T06:00:00.000Z")
  })

  it("keep their hour across the changes of time", () => {
    // The clocks go back on Sunday 25 October 2026, and forward on Sunday 28 March 2027.
    expect(nextOccurrence({ frequency: "daily", hour: 8 }, new Date("2026-10-24T07:00:00Z")).toISOString()).toBe("2026-10-25T07:00:00.000Z")
    expect(nextOccurrence({ frequency: "daily", hour: 8 }, new Date("2027-03-27T08:00:00Z")).toISOString()).toBe("2027-03-28T06:00:00.000Z")
  })

  it("say when, in words", () => {
    expect(describeRecurrence({ frequency: "daily", hour: 8 })).toBe("Chaque jour à 8 h")
    expect(describeRecurrence({ frequency: "weekly", days: [4, 1], hour: 9, minute: 30 })).toBe("Chaque lundi et jeudi à 9 h 30")
    expect(describeRecurrence({ frequency: "weekly", days: [1, 2, 3, 4, 5], hour: 8 })).toBe("Du lundi au vendredi à 8 h")
    expect(describeRecurrence({ frequency: "weekly", hour: 7, minute: 45 })).toBe("Chaque lundi à 7 h 45")
  })
})

describe("a mission's plan", () => {
  it("is bounded by its schema: ten steps, short loops, daytime hours", () => {
    const step = { id: "s1", action: "select_leads", input: { limit: 5 } }
    expect(planSchema.safeParse({ title: "Essai", steps: [step] }).success).toBe(true)
    expect(planSchema.safeParse({ title: "Essai", steps: Array.from({ length: 11 }, () => step) }).success).toBe(false)
    expect(planSchema.safeParse({ title: "Essai", steps: [{ ...step, forEach: ["a", "b", "c", "d", "e", "f"] }] }).success).toBe(false)
    expect(planSchema.safeParse({ title: "Essai", steps: [step], recurrence: { frequency: "daily", hour: 23 } }).success).toBe(false)
    expect(planSchema.safeParse({ title: "Essai", steps: [step], recurrence: { frequency: "weekly", days: [8], hour: 9 } }).success).toBe(false)
    expect(missionRequestSchema.safeParse({ action: "approve", capEur: 101 }).success).toBe(false)
    expect(missionRequestSchema.safeParse({ action: "resume", capEur: 3 }).success).toBe(true)
  })

  it("runs only actions of the catalogue the copilot may use, and one mission action of its own", () => {
    const catalogue = new Set(ACTIONS.map((a) => a.name))
    const policy = effectivePolicy(AGENTS.copilot, null)
    for (const [name, spec] of Object.entries(MISSION_ACTIONS)) {
      expect(spec.signature.startsWith(name), name).toBe(true)
      expect(isOpen(spec.def, policy), name).toBe(true)
      if (name !== "select_leads") {
        expect(catalogue.has(name), name).toBe(true)
        expect(AGENTS.copilot.tools, name).toContain(name)
      }
    }
    expect(catalogue.has("select_leads")).toBe(false)
    // Only enrolment contacts prospects: it keeps its own click inside a launched plan.
    expect(Object.values(MISSION_ACTIONS).filter((a) => levelOf(a.def) === "explicit").map((a) => a.def.name)).toEqual(["enroll_in_sequence"])
    // Nothing that deletes, exports or shares a link to a prospect.
    expect(Object.keys(MISSION_ACTIONS)).not.toContain("share_studio_link")
    expect(missionSignatures().split("\n")).toHaveLength(Object.keys(MISSION_ACTIONS).length)
    expect(CORE_ACTIONS.has("propose_mission")).toBe(true)
  })

  it("tags its fiches the way the CRM writes tags", () => {
    expect(missionTag("Architectes Nantes")).toBe("mission-architectes-nantes")
    expect(missionTag("Sites à Nantes : boulangeries, fleuristes…")).toBe("mission-sites-a-nantes")
    const long = missionTag("Boulangeries et pâtisseries de Loire-Atlantique")
    expect(long).toBe("mission-boulangeries-et")
    for (const tag of [long, missionTag("Été 2027 ! Restaurants")]) expect(normalizeTags([tag])).toEqual([tag])
  })

  it("tries again after a passing failure only", () => {
    expect(transient(new ExtractorError("unreachable", "Cleads Extractor ne répond pas."))).toBe(true)
    expect(transient(new ExtractorError("invalid", "Requête invalide"))).toBe(false)
    expect(transient(new LeadError("unavailable", "Indisponible", 503))).toBe(true)
    expect(transient(new LeadError("forbidden", "Non", 403))).toBe(false)
    expect(transient({ code: "P1001" })).toBe(true)
    expect(transient(new Error("Boum"))).toBe(false)
  })
})
