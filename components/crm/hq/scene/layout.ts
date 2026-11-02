import { ZONES, type ZoneId } from "@/features/hq/zones"

/**
 * Geometry of the platform, in metres (1 unit = 1 m, y up). The camera looks from +x +z towards the centre, so on
 * screen x+ runs down-right and z+ down-left. The spaces sit on a 3 × 3 grid (12 m apart) around the Cleads building;
 * a lime path runs round the building between them.
 */
export const PLATFORM_HALF = 20
export const PLATFORM_HEIGHT = 0.6
export const FLOOR_Y = PLATFORM_HEIGHT
export const PLOT_HALF = 4.3
export const PLOT_HEIGHT = 0.14
export const PLOT_Y = FLOOR_Y + PLOT_HEIGHT
export const HQ_HALF = 5
export const RING = 6.1

export const CAMERA_FOV = 24
export const OVERVIEW = { position: [47, 44, 47] as [number, number, number], target: [0, 0.4, 0] as [number, number, number] }
export const FOCUS_DISTANCE = 31
export const LIMITS = { minDistance: 16, maxDistance: 135, minPolar: 0.62, maxPolar: 1.2 }

export const zoneCenter = (id: ZoneId | "hq"): [number, number] => (id === "hq" ? [0, 0] : ZONES.find((z) => z.id === id)!.position)

/** Unit vector from a space's centre towards the building (its door faces the path). */
export function towardsCentre(id: ZoneId): [number, number] {
  const [x, z] = zoneCenter(id)
  const len = Math.hypot(x, z) || 1
  return [-x / len, -z / len]
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

/** Short spurs from the ring to each door (spaces and building). */
export function spurs(): [[number, number], [number, number]][] {
  const out: [[number, number], [number, number]][] = []
  for (const z of ZONES) {
    const [cx, cz] = z.position
    const [dx, dz] = towardsCentre(z.id)
    const corner = Math.abs(cx) > 1 && Math.abs(cz) > 1
    const door: [number, number] = corner ? [cx + dx * PLOT_HALF * Math.SQRT2, cz + dz * PLOT_HALF * Math.SQRT2] : [cx + dx * PLOT_HALF, cz + dz * PLOT_HALF]
    const onRing: [number, number] = corner ? [Math.sign(cx) * RING, Math.sign(cz) * RING] : [Math.sign(cx) * RING || 0, Math.sign(cz) * RING || 0]
    out.push([onRing, door])
  }
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
  [-23, -14, 1.1], [-24, -4, 0.9], [-23.5, 8, 1.2], [-22, 17, 1], [-14, -23, 1], [-3, -24, 1.15], [9, -23.5, 0.95], [18, -22, 1.1],
  [23, -12, 1], [24, 2, 1.2], [23, 14, 0.9], [14, 23.5, 1.05], [2, 24.5, 0.9], [-10, 23.5, 1.1], [-17.5, -17.5, 0.85], [17.5, 17.5, 0.9],
  [-18.6, 9.5, 0.7], [18.6, -7, 0.75], [-7.5, -18.8, 0.7], [6.5, 18.8, 0.72],
]
