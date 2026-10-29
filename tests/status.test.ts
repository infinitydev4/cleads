import { describe, expect, it } from "vitest"
import { dealStage, leadStatus, meetingStatus } from "@/lib/crm/status"

describe("status maps", () => {
  it("give every status a label and a tone", () => {
    for (const map of [leadStatus, dealStage, meetingStatus]) {
      for (const [key, meta] of Object.entries(map)) {
        expect(meta.label.length, key).toBeGreaterThan(0)
        expect(meta.tone, key).toBeTruthy()
      }
    }
  })

  it("never reuse a label inside one map", () => {
    for (const map of [leadStatus, dealStage, meetingStatus]) {
      const labels = Object.values(map).map((m) => m.label)
      expect(new Set(labels).size).toBe(labels.length)
    }
  })

  it("flags do-not-contact as destructive so it cannot be missed", () => {
    expect(leadStatus.DO_NOT_CONTACT.tone).toBe("destructive")
  })
})
