/**
 * Day and night of the 3D view (E16), from the clock of the person's device. Pure: the scene reads it every minute,
 * the tests pin it. A simple model of the sun at ~46° N (France, Switzerland): day length follows the season, solar
 * noon sits around 13:15 local time. Good enough for a mood, not an almanac.
 */
export type AmbienceMode = "auto" | "day" | "night"
export const AMBIENCE_MODES: { id: AmbienceMode; label: string; hint: string }[] = [
  { id: "auto", label: "Auto", hint: "Suit l’heure de votre appareil" },
  { id: "day", label: "Jour", hint: "Toujours en journée" },
  { id: "night", label: "Nuit", hint: "Toujours de nuit" },
]

export interface Ambience {
  phase: "night" | "dawn" | "day" | "dusk"
  label: string
  /** 0 in full daylight, 1 at night. Screens, paths and lamps glow with it. */
  night: number
  /** Sun (or moon at night) direction, from the scene centre towards the light. */
  lightDirection: [number, number, number]
  lightColor: string
  lightIntensity: number
  skyColor: string
  groundColor: string
  hemiIntensity: number
  backgroundTop: string
  backgroundBottom: string
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hex(a)
  const [br, bg, bb] = hex(b)
  const k = clamp01(t)
  const c = (x: number, y: number) => Math.round(x + (y - x) * k).toString(16).padStart(2, "0")
  return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`
}

const DAY = { light: "#fff7ec", sky: "#ffffff", ground: "#dfe3f2", top: "#f7f8fd", bottom: "#e6e9f6" }
const GOLDEN = { light: "#ffc48a", sky: "#ffe9d6", ground: "#e6dcea", top: "#fde9da", bottom: "#e4e1f1" }
const NIGHT = { light: "#a9bbff", sky: "#3b4d7a", ground: "#0b1523", top: "#0b1523", bottom: "#1a2846" }

/** Hours since local midnight, and day of the year, of a date on the device's clock. */
const localHours = (d: Date) => d.getHours() + d.getMinutes() / 60
function dayOfYear(d: Date) {
  const start = new Date(d.getFullYear(), 0, 0)
  return Math.floor((d.getTime() - start.getTime()) / 86_400_000)
}

/** Sun elevation in degrees (negative below the horizon) and azimuth progress (0 at sunrise, 1 at sunset). */
export function sunAt(d: Date): { elevation: number; progress: number } {
  const season = Math.sin((2 * Math.PI * (dayOfYear(d) - 80)) / 365)
  const dayLength = 12 + 3.9 * season
  const noon = 13.25
  const maxElevation = 44 + 23.4 * season
  const h = localHours(d)
  const progress = (h - (noon - dayLength / 2)) / dayLength
  if (progress >= 0 && progress <= 1) return { elevation: Math.sin(Math.PI * progress) * maxElevation, progress }
  // Night: the sun dips to about -20° at local midnight.
  const nightLength = 24 - dayLength
  const intoNight = ((h - (noon + dayLength / 2) + 24) % 24) / nightLength
  return { elevation: -Math.sin(Math.PI * clamp01(intoNight)) * 20, progress }
}

export function ambienceAt(date: Date, mode: AmbienceMode = "auto"): Ambience {
  const { elevation, progress } =
    mode === "day" ? { elevation: 42, progress: 0.42 } : mode === "night" ? { elevation: -18, progress: 1.4 } : sunAt(date)
  const night = 1 - smooth(-6, 4, elevation)
  const golden = (1 - smooth(4, 16, elevation)) * (1 - night)

  // The light swings from east (morning) to west (evening) over the platform; at night the moon hangs high.
  const az = Math.PI * (0.15 + 0.7 * clamp01(progress))
  const height = night > 0.5 ? 0.9 : Math.max(0.25, Math.sin((Math.max(elevation, 8) * Math.PI) / 180) * 1.4)
  const lightDirection: [number, number, number] = [Math.cos(az) * 0.9 + 0.3, height, Math.sin(az) * 0.9 + 0.4]

  const pick = (key: keyof typeof DAY) => mix(mix(DAY[key], GOLDEN[key], golden), NIGHT[key], night)
  const phase: Ambience["phase"] = night > 0.6 ? "night" : golden > 0.35 ? (progress < 0.5 ? "dawn" : "dusk") : "day"
  return {
    phase,
    label: { night: "Nuit", dawn: "Aube", day: "Jour", dusk: "Crépuscule" }[phase],
    night,
    lightDirection,
    lightColor: pick("light"),
    lightIntensity: 2.4 * (1 - night) * (1 - 0.35 * golden) + 0.8 * night,
    skyColor: pick("sky"),
    groundColor: pick("ground"),
    hemiIntensity: 1.1 * (1 - night) + 0.9 * night,
    backgroundTop: pick("top"),
    backgroundBottom: pick("bottom"),
  }
}
