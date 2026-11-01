import { describe, expect, it } from "vitest"
import { ambienceAt, mix, sunAt } from "@/features/hq/ambience"
import { CHARACTER_IDS, characterFor } from "@/features/hq/characters"
import { JOURNEY, ZONES, ZONE_IDS, assignStations, HQ_SEATS, isZoneId, zoneById } from "@/features/hq/zones"
import { deltaPct, deltaPts, formatDeltaPct, formatDeltaPts, formatRate, INDICATORS, parsePeriod, rate } from "@/features/metrics/definitions"
import { PLATFORM_HALF, PLOT_HALF, RING, SEATS, onRing, spurs } from "@/components/crm/hq/scene/layout"

const at = (iso: string) => new Date(iso)

describe("day and night (E16)", () => {
  it("is night in the small hours and day at lunch time, whatever the season", () => {
    for (const day of ["2026-01-15", "2026-06-21", "2026-11-01"]) {
      expect(ambienceAt(at(`${day}T02:30:00`)).phase).toBe("night")
      expect(ambienceAt(at(`${day}T02:30:00`)).night).toBeGreaterThan(0.95)
      expect(ambienceAt(at(`${day}T13:00:00`)).phase).toBe("day")
      expect(ambienceAt(at(`${day}T13:00:00`)).night).toBe(0)
    }
  })

  it("follows the season: 19:30 is still day in June, already night in January", () => {
    expect(ambienceAt(at("2026-06-21T19:30:00")).night).toBeLessThan(0.1)
    expect(ambienceAt(at("2026-01-15T19:30:00")).night).toBeGreaterThan(0.9)
  })

  it("goes through dawn and dusk instead of switching at once", () => {
    const evening = [16, 17, 18, 19, 20].map((h) => ambienceAt(at(`2026-11-01T${h}:00:00`)).night)
    // Monotonic and with at least one value strictly between day and night.
    expect([...evening].sort((a, b) => a - b)).toEqual(evening)
    expect(evening.some((n) => n > 0.05 && n < 0.95) || ambienceAt(at("2026-11-01T17:30:00")).phase === "dusk").toBe(true)
  })

  it("ignores the clock when the person chose day or night", () => {
    expect(ambienceAt(at("2026-11-01T02:00:00"), "day").phase).toBe("day")
    expect(ambienceAt(at("2026-11-01T13:00:00"), "night").phase).toBe("night")
  })

  it("puts the sun above the horizon at noon and below at midnight", () => {
    expect(sunAt(at("2026-03-20T13:15:00")).elevation).toBeGreaterThan(30)
    expect(sunAt(at("2026-03-20T00:30:00")).elevation).toBeLessThan(0)
  })

  it("mixes colours as valid hex", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080")
    expect(mix("#d7ff00", "#0b1523", 0)).toBe("#d7ff00")
    for (const h of [0, 6, 12, 18, 21]) {
      const a = ambienceAt(at(`2026-11-01T${String(h).padStart(2, "0")}:00:00`))
      for (const c of [a.lightColor, a.skyColor, a.groundColor, a.backgroundTop, a.backgroundBottom]) expect(c).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})

describe("spaces of the 3D view", () => {
  it("declares the eight modules once, with keys 1 to 8", () => {
    expect(ZONES.map((z) => z.id).sort()).toEqual([...ZONE_IDS].sort())
    expect(ZONES.map((z) => z.key).sort()).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"])
    expect(new Set(ZONES.map((z) => z.position.join())).size).toBe(ZONES.length)
    for (const z of ZONES) {
      expect(z.description.length).toBeGreaterThan(20)
      expect(z.href.startsWith("/app")).toBe(true)
      expect(Math.abs(z.position[0]) + PLOT_HALF).toBeLessThanOrEqual(PLATFORM_HALF)
      expect(Math.abs(z.position[1]) + PLOT_HALF).toBeLessThanOrEqual(PLATFORM_HALF)
    }
    expect(isZoneId("pipeline")).toBe(true)
    expect(isZoneId("agents")).toBe(false)
  })

  it("maps every step of the journey to a space and to a defined indicator", () => {
    for (const step of JOURNEY) {
      expect(zoneById(step.zone)).toBeDefined()
      expect(INDICATORS[step.key as keyof typeof INDICATORS]).toBeDefined()
    }
  })

  it("keeps every desk on its plot and the paths between the plots", () => {
    for (const [zone, seats] of Object.entries(SEATS)) {
      if (zone !== "hq") expect(seats.length).toBe(zoneById(zone)!.seats)
      for (const s of seats) {
        expect(Math.abs(s.x)).toBeLessThan(PLOT_HALF)
        expect(Math.abs(s.z)).toBeLessThan(PLOT_HALF)
      }
    }
    expect(SEATS.hq.length).toBe(HQ_SEATS)
    expect(onRing(0)).toEqual([-RING, -RING])
    expect(onRing(0.25)).toEqual([RING, -RING])
    expect(spurs()).toHaveLength(ZONES.length + 4)
  })

  it("seats members by role, then in the central building when the desks are full", () => {
    const sdrs = Array.from({ length: 9 }, (_, i) => ({ id: `s${i}`, role: "SDR" }))
    const seated = assignStations([{ id: "o", role: "OWNER" }, ...sdrs])
    expect(seated[0]).toMatchObject({ station: "coordination", seat: 0 })
    // 3 desks in qualification, 2 in outreach, 2 in sources, then the building.
    expect(seated.slice(1, 4).map((m) => m.station)).toEqual(["qualification", "qualification", "qualification"])
    expect(seated.slice(4, 6).map((m) => m.station)).toEqual(["outreach", "outreach"])
    expect(seated.slice(6, 8).map((m) => m.station)).toEqual(["sources", "sources"])
    expect(seated.slice(8).map((m) => m.station)).toEqual(["hq", "hq"])
    expect(seated.slice(8).map((m) => m.seat)).toEqual([0, 1])
  })
})

describe("characters", () => {
  it("keeps the person's choice, and otherwise always gives the same one for the same person", () => {
    expect(characterFor({ id: "u1", role: "SDR", hqCharacter: "manager" })).toBe("manager")
    const a = characterFor({ id: "u1", role: "SDR" })
    expect(characterFor({ id: "u1", role: "SDR", hqCharacter: null })).toBe(a)
    expect(CHARACTER_IDS).toContain(a)
    expect(characterFor({ id: "u1", role: "SDR", hqCharacter: "pirate" })).toBe(a)
  })
})

describe("indicators (E10 rule: defined, never invented)", () => {
  it("returns no rate and no trend rather than a fake 0 % or +∞ %", () => {
    expect(rate(0, 0)).toBeNull()
    expect(rate(3, 12)).toBe(0.25)
    expect(deltaPct(10, 0)).toBeNull()
    expect(deltaPct(12, 10)).toBeCloseTo(20)
    expect(deltaPts(null, 0.1)).toBeNull()
    expect(deltaPts(0.084, 0.065)).toBeCloseTo(1.9)
  })

  it("formats in French", () => {
    expect(formatRate(0.0836)).toBe("8,4 %")
    expect(formatRate(null)).toBe("—")
    expect(formatDeltaPct(12.3)).toBe("+12 %")
    expect(formatDeltaPct(-4.6)).toBe("−5 %")
    expect(formatDeltaPct(null)).toBeNull()
    expect(formatDeltaPts(1.94)).toBe("+1,9 pt")
  })

  it("accepts only the offered periods", () => {
    expect(parsePeriod("7")).toBe(7)
    expect(parsePeriod("90")).toBe(90)
    expect(parsePeriod("365")).toBe(30)
    expect(parsePeriod(null)).toBe(30)
  })

  it("has a definition for every indicator", () => {
    for (const i of Object.values(INDICATORS)) expect(i.definition.length).toBeGreaterThan(20)
  })
})
