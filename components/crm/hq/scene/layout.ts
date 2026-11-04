import type { AgentId } from "@/features/ai/agents"
import { CONTROL_ROOM, postOf } from "@/features/hq/agency"
import { ZONES, type ZoneId } from "@/features/hq/zones"

/**
 * Geometry of the platform, in metres (1 unit = 1 m, y up). The camera looks from +x +z towards the centre, so on
 * screen x+ runs down-right and z+ down-left. The spaces sit on a 3 × 3 grid (12 m apart) around the Cleads building;
 * a lime path runs round the building between them. The AI wing (E26) widens the platform on its far-left side: its
 * two spaces line up on the streets between the plots (z = ±6), and two avenues of the circuit lead there.
 */
export const PLATFORM = { minX: -32, maxX: 20, minZ: -20, maxZ: 20 } as const
export const PLATFORM_CENTER: [number, number] = [(PLATFORM.minX + PLATFORM.maxX) / 2, (PLATFORM.minZ + PLATFORM.maxZ) / 2]
export const PLATFORM_SIZE: [number, number] = [PLATFORM.maxX - PLATFORM.minX, PLATFORM.maxZ - PLATFORM.minZ]
export const onPlatform = (x: number, z: number) => x >= PLATFORM.minX && x <= PLATFORM.maxX && z >= PLATFORM.minZ && z <= PLATFORM.maxZ
export const PLATFORM_HEIGHT = 0.6
export const FLOOR_Y = PLATFORM_HEIGHT
export const PLOT_HALF = 4.3
export const PLOT_HEIGHT = 0.14
export const PLOT_Y = FLOOR_Y + PLOT_HEIGHT
export const HQ_HALF = 5
export const RING = 6.1

export const CAMERA_FOV = 24
/** The whole site: the camera's usual angle, far enough back for the widened platform, aimed at its middle. */
const VIEW: [number, number, number] = [47, 44, 47]
const OVERVIEW_ZOOM = 1.3
const OVERVIEW_TARGET: [number, number, number] = [PLATFORM_CENTER[0], 0.4, PLATFORM_CENTER[1]]
export const OVERVIEW = {
  position: VIEW.map((v, i) => OVERVIEW_TARGET[i] + v * OVERVIEW_ZOOM) as [number, number, number],
  target: OVERVIEW_TARGET,
}
export const FOCUS_DISTANCE = 31
export const LIMITS = { minDistance: 16, maxDistance: 135, minPolar: 0.62, maxPolar: 1.2 }

export const zoneCenter = (id: ZoneId | "hq"): [number, number] => (id === "hq" ? [0, 0] : ZONES.find((z) => z.id === id)!.position)

/** The spaces of the AI wing (E26), beyond the grid: their doors face the main platform (x+). */
export const WING: readonly ZoneId[] = ["agents", "studio"]
export const isWing = (id: ZoneId) => WING.includes(id)

/** Unit vector from a space's centre towards its door: the building for the grid, the main platform for the wing. */
export function towardsCentre(id: ZoneId): [number, number] {
  if (isWing(id)) return [1, 0]
  const [x, z] = zoneCenter(id)
  const len = Math.hypot(x, z) || 1
  return [-x / len, -z / len]
}

/**
 * A space's door (on the edge of its plot) and the point of the ring its path leaves from. Corner spaces open at the
 * corner of their plot; the wing's avenues leave the ring's corners and run along the streets between the plots.
 */
export function doorOf(id: ZoneId): { door: [number, number]; ring: [number, number] } {
  const [cx, cz] = zoneCenter(id)
  if (isWing(id)) return { door: [cx + PLOT_HALF, Math.sign(cz) * RING], ring: [-RING, Math.sign(cz) * RING] }
  const [dx, dz] = towardsCentre(id)
  const corner = Math.abs(cx) > 1 && Math.abs(cz) > 1
  return {
    door: corner ? [cx + dx * PLOT_HALF * Math.SQRT2, cz + dz * PLOT_HALF * Math.SQRT2] : [cx + dx * PLOT_HALF, cz + dz * PLOT_HALF],
    ring: corner ? [Math.sign(cx) * RING, Math.sign(cz) * RING] : [Math.sign(cx) * RING || 0, Math.sign(cz) * RING || 0],
  }
}

export interface Seat {
  x: number
  z: number
  /** Yaw of the person: 0 faces +z; Math.PI / 4 faces the camera. */
  rot: number
  pose: "sit" | "stand"
}

const FACE = Math.PI / 4
/** Desks (relative to the space's centre). The first one also seats the space's operator when no member is there. */
export const SEATS: Record<ZoneId | "hq", Seat[]> = {
  sources: [
    { x: 1.6, z: 1.9, rot: FACE, pose: "sit" },
    { x: -1.0, z: 2.9, rot: FACE, pose: "sit" },
  ],
  qualification: [
    { x: 1.4, z: 0.4, rot: FACE, pose: "sit" },
    { x: -1.2, z: 1.9, rot: FACE, pose: "sit" },
    { x: 2.6, z: -2.2, rot: FACE, pose: "sit" },
  ],
  coordination: [
    { x: -0.9, z: 1.1, rot: FACE + Math.PI, pose: "sit" },
    { x: 1.1, z: -0.9, rot: FACE + Math.PI, pose: "sit" },
    { x: 2.4, z: 1.9, rot: -Math.PI / 4 - Math.PI / 2, pose: "stand" },
  ],
  outreach: [
    { x: 0.6, z: 1.4, rot: FACE, pose: "sit" },
    { x: -1.8, z: 2.4, rot: FACE, pose: "sit" },
  ],
  pipeline: [
    { x: 1.5, z: 1.2, rot: FACE, pose: "sit" },
    { x: -1.0, z: 2.5, rot: FACE, pose: "sit" },
  ],
  analytics: [
    { x: 0.2, z: 0.6, rot: FACE + Math.PI, pose: "sit" },
    { x: 2.1, z: -1.2, rot: FACE + Math.PI, pose: "sit" },
  ],
  meetings: [
    { x: 0.2, z: -0.3, rot: FACE, pose: "sit" },
    { x: 2.4, z: 2.3, rot: Math.PI, pose: "stand" },
  ],
  campaigns: [
    { x: 1.3, z: 0.9, rot: FACE + Math.PI, pose: "sit" },
    { x: 2.8, z: -1.4, rot: -Math.PI / 2 - FACE, pose: "stand" },
  ],
  // The AI wing has no desks for members: the agents work there (CONTROL_ROOM_SEATS, DESIGNER_SEAT).
  agents: [],
  studio: [],
  hq: [
    { x: -2.2, z: 1.2, rot: FACE, pose: "sit" },
    { x: 0.4, z: 1.2, rot: FACE, pose: "sit" },
    { x: -2.2, z: -1.4, rot: FACE, pose: "sit" },
    { x: 0.4, z: -1.4, rot: FACE, pose: "sit" },
    { x: 2.6, z: 1.2, rot: FACE, pose: "sit" },
    { x: 2.6, z: -1.4, rot: FACE, pose: "sit" },
  ],
}

/** The path round the building, as a closed loop of corners (clockwise seen from above). */
export const RING_PATH: [number, number][] = [
  [-RING, -RING],
  [RING, -RING],
  [RING, RING],
  [-RING, RING],
]

/** Short spurs from the ring to each door (spaces and building); `wing` keeps only the avenues of the AI wing, or the others. */
export function spurs(wing?: boolean): [[number, number], [number, number]][] {
  const out: [[number, number], [number, number]][] = []
  for (const z of ZONES) {
    if (wing !== undefined && isWing(z.id) !== wing) continue
    const { ring, door } = doorOf(z.id)
    out.push([ring, door])
  }
  if (wing) return out
  for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) out.push([[x * RING, z * RING], [x * HQ_HALF, z * HQ_HALF]])
  return out
}

/** Position along the closed ring at t ∈ [0, 1). */
export function onRing(t: number): [number, number] {
  const n = RING_PATH.length
  const u = (((t % 1) + 1) % 1) * n
  const i = Math.floor(u)
  const f = u - i
  const [ax, az] = RING_PATH[i]
  const [bx, bz] = RING_PATH[(i + 1) % n]
  return [ax + (bx - ax) * f, az + (bz - az) * f]
}

/** Trees round the platform: a fixed, hand-tuned scatter (no randomness between renders). */
export const TREES: [number, number, number][] = [
  [-35.5, -14, 1.1], [-36, -3, 0.9], [-35.5, 8, 1.2], [-34.5, 17.5, 1], [-14, -23, 1], [-3, -24, 1.15], [9, -23.5, 0.95], [18, -22, 1.1],
  [23, -12, 1], [24, 2, 1.2], [23, 14, 0.9], [14, 23.5, 1.05], [2, 24.5, 0.9], [-10, 23.5, 1.1], [-17.5, -17.5, 0.85], [17.5, 17.5, 0.9],
  [-18.6, 9.5, 0.7], [18.6, -7, 0.75], [-7.5, -18.8, 0.7], [6.5, 18.8, 0.72], [-26, -23.5, 1.05], [-34, -22.5, 0.9], [-24, 23.8, 1],
]

// ---------------------------------------------------------------------------------------------------------------
// The AI wing (E26): the control room of "Agents IA" and the Studio's atelier, relative to their plot's centre
// ---------------------------------------------------------------------------------------------------------------

/** The copilot's core in the middle of the control room, and the ring of posts round it. */
export const CORE_HEIGHT = 1.75
export const CONTROL_ROOM_RADIUS = 2.85
export const CONSOLE = { inner: 1.75, outer: 2.5, height: 0.74 }

/**
 * The posts, in the order of the acquisition journey and clockwise on screen from the top left, evenly spaced round
 * the core; the camera (from +x +z) looks through the middle of a gap, so no post stands between it and the core. Each
 * agent faces the core, its holographic panel between them.
 */
const CAMERA_ANGLE = Math.PI / 4
const POST_STEP = (2 * Math.PI) / CONTROL_ROOM.length
/** The first post is the one nearest the top left of the screen (7π/12 from the camera, where it stood with six). */
const FIRST_POST = Math.round(((13 * Math.PI) / 12 - CAMERA_ANGLE - POST_STEP / 2) / POST_STEP)
export const CONTROL_ROOM_SEATS: (Seat & { angle: number })[] = CONTROL_ROOM.map((_, k) => {
  const angle = CAMERA_ANGLE + POST_STEP / 2 + (FIRST_POST + k) * POST_STEP
  const [x, z] = [Math.cos(angle) * CONTROL_ROOM_RADIUS, Math.sin(angle) * CONTROL_ROOM_RADIUS]
  return { x, z, rot: Math.atan2(-x, -z), pose: "sit" as const, angle }
})

/** The designer's desk in the Studio, facing the gallery in the far corner; the holographic canvas stands before it. */
export const DESIGNER_SEAT: Seat = { x: 0.9, z: 0.9, rot: (-3 * Math.PI) / 4, pose: "sit" }

/** The gallery wall of the Studio: an L on the plot's far sides, two frames on each (x, z, yaw of the picture). */
export const GALLERY_WALL = { inset: PLOT_HALF - 0.32, height: 2.6, thickness: 0.18 }
export const GALLERY_FRAMES: [number, number, number][] = [
  [-GALLERY_WALL.inset + 0.12, 1.65, Math.PI / 2],
  [-GALLERY_WALL.inset + 0.12, -1.65, Math.PI / 2],
  [-1.65, -GALLERY_WALL.inset + 0.12, 0],
  [1.65, -GALLERY_WALL.inset + 0.12, 0],
]

/** The "Agence IA" totem at the entrance of the wing, between its two avenues. */
export const TOTEM: [number, number] = [-18, 0]

/** Where an agent's head is in the scene (for its name label): at its post, or above the core for the copilot. */
export function agentAnchor(id: AgentId): [number, number, number] {
  const post = postOf(id)
  const [cx, cz] = zoneCenter(post.zone)
  if (post.kind === "core") return [cx, PLOT_Y + CORE_HEIGHT + 1.2, cz]
  const seat = post.kind === "desk" ? DESIGNER_SEAT : CONTROL_ROOM_SEATS[post.index]
  return [cx + seat.x, PLOT_Y + 1.95, cz + seat.z]
}
