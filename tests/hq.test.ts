import { describe, expect, it } from "vitest"
import { ambienceAt, mix, sunAt } from "@/features/hq/ambience"
import { CHARACTER_IDS, characterFor } from "@/features/hq/characters"
import { JOURNEY, ZONES, ZONE_IDS, assignStations, HQ_SEATS, isZoneId, zoneById } from "@/features/hq/zones"
import { deltaPct, deltaPts, formatDeltaPct, formatDeltaPts, formatRate, INDICATORS, parsePeriod, rate } from "@/features/metrics/definitions"
import { AGENT_IDS } from "@/features/ai/agents"
import { AGENCY_ORDER, CONTROL_ROOM, agencySummaries, agentStateOf, postOf } from "@/features/hq/agency"
import type { AgencyPulse, AgentPulse } from "@/features/hq/types"
import { CONSOLE, CONTROL_ROOM_SEATS, DESIGNER_SEAT, GALLERY_FRAMES, PLATFORM, PLOT_HALF, RING, SEATS, TOTEM, TREES, WING, agentAnchor, doorOf, onPlatform, onRing, spurs } from "@/components/crm/hq/scene/layout"
import { windowPath } from "@/lib/crm/hq-window"

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
  it("declares the ten spaces once, with keys 1 to 9 then 0", () => {
    expect(ZONES.map((z) => z.id).sort()).toEqual([...ZONE_IDS].sort())
    expect(ZONES.map((z) => z.key)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"])
    expect(new Set(ZONES.map((z) => z.position.join())).size).toBe(ZONES.length)
    for (const z of ZONES) {
      expect(z.description.length).toBeGreaterThan(20)
      expect(z.href.startsWith("/app")).toBe(true)
      const [x, zz] = z.position
      expect(onPlatform(x - PLOT_HALF, zz - PLOT_HALF) && onPlatform(x + PLOT_HALF, zz + PLOT_HALF)).toBe(true)
    }
    expect(isZoneId("pipeline")).toBe(true)
    expect(isZoneId("agents")).toBe(true)
    expect(isZoneId("robots")).toBe(false)
    // The AI spaces open the 2D modules with the rights of those pages.
    expect(zoneById("agents")).toMatchObject({ href: "/app/agents", permission: "ai:use", key: "9", seats: 0 })
    expect(zoneById("studio")).toMatchObject({ href: "/app/studio", permission: "studio:generate", key: "0", seats: 0 })
  })

  it("keeps the plots apart, with room for the paths between them", () => {
    for (const a of ZONES) {
      for (const b of ZONES) {
        if (a.id >= b.id) continue
        const gap = Math.max(Math.abs(a.position[0] - b.position[0]), Math.abs(a.position[1] - b.position[1])) - 2 * PLOT_HALF
        expect(gap, `${a.id} / ${b.id}`).toBeGreaterThanOrEqual(3)
      }
    }
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
    expect(spurs(true)).toHaveLength(WING.length)
    expect(spurs(false)).toHaveLength(ZONES.length - WING.length + 4)
  })

  it("opens each door on the edge of its plot, and leads the avenues of the AI wing between the plots", () => {
    for (const z of ZONES) {
      const { door } = doorOf(z.id)
      const [cx, cz] = z.position
      // On the edge: as far as the plot's half-width along one axis at least, never beyond it.
      expect(Math.max(Math.abs(door[0] - cx), Math.abs(door[1] - cz))).toBeCloseTo(PLOT_HALF, 5)
    }
    for (const [[x1, z1], [x2, z2]] of spurs(true)) {
      expect(z1).toBe(z2)
      expect(x1).toBe(-RING)
      // An avenue runs along a street: it crosses no plot of the grid on its way.
      for (const z of ZONES.filter((zz) => !WING.includes(zz.id))) {
        const [cx, cz] = z.position
        const crossesX = Math.min(x1, x2) < cx + PLOT_HALF && Math.max(x1, x2) > cx - PLOT_HALF
        expect(crossesX && Math.abs(z1 - cz) < PLOT_HALF, z.id).toBe(false)
      }
    }
  })

  it("keeps the trees off the plots and the paths", () => {
    for (const [x, z] of TREES) {
      for (const zone of ZONES) expect(Math.max(Math.abs(x - zone.position[0]), Math.abs(z - zone.position[1])), zone.id).toBeGreaterThan(PLOT_HALF + 0.5)
    }
    expect(onPlatform(TOTEM[0], TOTEM[1])).toBe(true)
    expect(PLATFORM.minX).toBeLessThan(-24 - PLOT_HALF)
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

describe("the AI agency of the 3D view (E26)", () => {
  const pulse = (over: Partial<AgentPulse> & { id: AgentPulse["id"] }): AgentPulse => ({ state: "idle", running: 0, queued: 0, waiting: 0, current: null, lastDone: null, today: { runs: 0, costEur: 0 }, ...over })
  const agency = (agents: AgentPulse[], extra: Partial<AgencyPulse> = {}): AgencyPulse => ({ generatedAt: "", agents, approvals: 0, worker: { online: true, queued: 0 }, configured: true, studio: null, ...extra })

  it("puts every agent at one place: the core, a post of the control room, or the Studio's desk", () => {
    expect(postOf("copilot")).toEqual({ zone: "agents", kind: "core" })
    expect(postOf("designer")).toEqual({ zone: "studio", kind: "desk" })
    expect(CONTROL_ROOM.map((id) => postOf(id))).toEqual(CONTROL_ROOM.map((_, index) => ({ zone: "agents", kind: "station", index })))
    expect([...AGENCY_ORDER].sort()).toEqual([...AGENT_IDS].sort())
    for (const id of AGENT_IDS) expect(agentAnchor(id)[1]).toBeGreaterThan(1)
  })

  it("seats the agents round the core, facing it, never between the camera and the core", () => {
    for (const seat of CONTROL_ROOM_SEATS) {
      expect(Math.hypot(seat.x, seat.z)).toBeLessThan(PLOT_HALF - 0.8)
      expect(Math.hypot(seat.x, seat.z)).toBeGreaterThan(CONSOLE.outer)
      // Facing (sin rot, cos rot) points at the centre.
      const facing = [Math.sin(seat.rot), Math.cos(seat.rot)]
      expect(facing[0] * -seat.x + facing[1] * -seat.z).toBeCloseTo(Math.hypot(seat.x, seat.z), 5)
      // The camera looks from +x +z: no post within 25° of that line.
      const towardsCamera = (seat.x + seat.z) / Math.SQRT2 / Math.hypot(seat.x, seat.z)
      expect(towardsCamera).toBeLessThan(Math.cos((25 * Math.PI) / 180))
    }
    expect(Math.abs(DESIGNER_SEAT.x)).toBeLessThan(PLOT_HALF)
    for (const [x, z] of GALLERY_FRAMES) expect(Math.max(Math.abs(x), Math.abs(z))).toBeLessThan(PLOT_HALF)
  })

  it("says first what waits for a person, then what moves", () => {
    expect(agentStateOf({ enabled: true, running: 1, queued: 2, waiting: 1 })).toBe("waiting")
    expect(agentStateOf({ enabled: true, running: 1, queued: 2, waiting: 0 })).toBe("working")
    expect(agentStateOf({ enabled: false, running: 0, queued: 1, waiting: 0 })).toBe("queued")
    expect(agentStateOf({ enabled: false, running: 0, queued: 0, waiting: 0 })).toBe("off")
    expect(agentStateOf({ enabled: true, running: 0, queued: 0, waiting: 0 })).toBe("idle")
  })

  it("gives the AI spaces live badges, and none to a role that cannot open them", () => {
    const open = { agents: false, studio: false }
    const studio = { latest: [], building: 0, briefs: 0, ready: 3 }
    expect(agencySummaries(agency([pulse({ id: "auditor", running: 1 })], { approvals: 1 }), open).agents).toEqual({ badge: "1 à valider", tone: "attention", locked: false })
    expect(agencySummaries(agency([pulse({ id: "auditor", running: 1 }), pulse({ id: "writer", running: 2 })]), open).agents).toEqual({ badge: "2 agents au travail", tone: "active", locked: false })
    expect(agencySummaries(agency([pulse({ id: "qualifier", queued: 3 })]), open).agents.badge).toBe("3 exécutions en file")
    expect(agencySummaries(agency([pulse({ id: "auditor", today: { runs: 4, costEur: 0.4 } })]), open).agents.badge).toBe("4 exécutions aujourd’hui")
    expect(agencySummaries(agency([pulse({ id: "auditor" })]), open).agents.badge).toBe("Au repos")
    expect(agencySummaries(agency([], { studio: { ...studio, briefs: 1, building: 1 } }), open).studio).toEqual({ badge: "1 brief à relire", tone: "attention", locked: false })
    expect(agencySummaries(agency([], { studio: { ...studio, building: 2 } }), open).studio.badge).toBe("2 maquettes en cours")
    expect(agencySummaries(agency([], { studio }), open).studio.badge).toBe("3 maquettes prêtes")
    expect(agencySummaries(agency([], { studio: { ...studio, ready: 0 } }), open).studio.badge).toBe("Aucune maquette")
    // No pulse (no AI right), a locked space, or no Studio right: no figure at all.
    expect(agencySummaries(null, open)).toEqual({ agents: { badge: null, tone: "neutral", locked: true }, studio: { badge: null, tone: "neutral", locked: true } })
    expect(agencySummaries(agency([], { studio }), { agents: true, studio: false }).agents.locked).toBe(true)
    expect(agencySummaries(agency([]), open).studio.locked).toBe(true)
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

describe("windows of the 3D view (E16)", () => {
  const origin = "https://crm.cleads.fr"

  it("opens the CRM pages, with their filters", () => {
    expect(windowPath("/app")).toBe("/app")
    expect(windowPath("/app/search")).toBe("/app/search")
    expect(windowPath("/app/leads?status=REPLIED&owner=me")).toBe("/app/leads?status=REPLIED&owner=me")
    expect(windowPath("/app/campaigns?new=1", origin)).toBe("/app/campaigns?new=1")
    expect(windowPath(`${origin}/app/pipeline`, origin)).toBe("/app/pipeline")
    // The AI wing's links (E26): a mock-up, the approvals tab.
    expect(windowPath("/app/studio/cmabc123")).toBe("/app/studio/cmabc123")
    expect(windowPath("/app/agents?tab=approvals")).toBe("/app/agents?tab=approvals")
  })

  it("never opens the 3D view inside itself", () => {
    expect(windowPath("/app/3d")).toBeNull()
    expect(windowPath("/app/3d?w=/app/leads")).toBeNull()
    expect(windowPath("/app/3d/anything")).toBeNull()
  })

  it("refuses what is not a CRM page of this site", () => {
    for (const href of ["https://evil.example/app/leads", "//evil.example/app/leads", "javascript:alert(1)", "mailto:a@b.fr", "tel:+33100000000", "/dashboard/settings", "/auth/login", "/api/leads", "/application", "/app/../auth/login", "", null, undefined]) {
      expect(windowPath(href, origin), String(href)).toBeNull()
    }
  })
})
