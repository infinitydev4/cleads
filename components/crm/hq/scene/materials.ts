import * as THREE from "three"

/**
 * One set of materials for the whole scene, in the Cleads palette: warm ivory surfaces (matte or glazed like
 * ceramic), navy, glass, and a neon lime green that glows. Created once and shared, so the GPU compiles a handful of
 * programs. Neon colours are pushed above 1 (HDR): the bloom pass turns exactly those into light.
 */
export const PALETTE = {
  ivory: "#fbf8f1",
  ivoryWarm: "#f5f0e5",
  sand: "#e8e1d2",
  stone: "#d9d2c3",
  slate: "#8a93ad",
  navy: "#0b1523",
  ink: "#16223a",
  /** Brand lime of the interface. */
  lime: "#d7ff00",
  /** Neon lime green of the scene's lights: greener than the brand lime, it reads as light, not as paint. */
  neon: "#9dff2a",
  /** Neon lime as ink on a light screen (dials): darker so it stays readable. */
  neonInk: "#5fbf00",
  leaf: "#a8d54a",
  glass: "#e6efff",
  screen: "#0f1a2c",
  warm: "#ffd49a",
} as const

const NEON = new THREE.Color(PALETTE.neon)
const WARM = new THREE.Color(PALETTE.warm)

/** A fine grain for the ivory surfaces: they read as satin ceramic rather than flat plastic. */
function grain() {
  if (typeof document === "undefined") return null
  const size = 128
  const c = document.createElement("canvas")
  c.width = c.height = size
  const g = c.getContext("2d")!
  const img = g.createImageData(size, size)
  let seed = 7
  for (let i = 0; i < size * size; i++) {
    seed = (seed * 16807) % 2147483647
    const v = 200 + ((seed / 2147483647) * 40) | 0
    img.data.set([v, v, v, 255], i * 4)
  }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(6, 6)
  return t
}

let cache: ReturnType<typeof build> | null = null

function build() {
  const roughnessMap = grain()
  const matte = (color: string, roughness = 0.62) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, roughnessMap, envMapIntensity: 0.85 })
  const glazed = (color: string) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.28, envMapIntensity: 1 })
  const neon = (k: number) => new THREE.MeshBasicMaterial({ color: NEON.clone().multiplyScalar(k), toneMapped: false })
  return {
    ivory: matte(PALETTE.ivory),
    ivoryWarm: matte(PALETTE.ivoryWarm, 0.7),
    sand: matte(PALETTE.sand, 0.75),
    stone: matte(PALETTE.stone, 0.8),
    ceramic: glazed(PALETTE.ivory),
    navy: new THREE.MeshStandardMaterial({ color: PALETTE.navy, roughness: 0.42, metalness: 0.1, envMapIntensity: 1 }),
    ink: new THREE.MeshStandardMaterial({ color: PALETTE.ink, roughness: 0.5 }),
    leaf: matte(PALETTE.leaf, 0.85),
    glass: new THREE.MeshStandardMaterial({ color: PALETTE.glass, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.2, envMapIntensity: 2.2, depthWrite: false }),
    /** Neon lime: strong light (strips, selection, nodes) and a softer one (borders). */
    neon: neon(2.2),
    neonSoft: neon(1.1),
    /** Warm windows and bulbs, off in the day. */
    lamp: new THREE.MeshStandardMaterial({ color: PALETTE.ivory, roughness: 0.4, emissive: WARM.clone(), emissiveIntensity: 0 }),
    screenOff: new THREE.MeshStandardMaterial({ color: PALETTE.screen, roughness: 0.25, metalness: 0.2, envMapIntensity: 1.2 }),
    /** Floor of the selected space: a pale lime wash, the neon outline does the pointing. */
    selected: matte("#f3ffd9", 0.6),
    /** The brand lime as a paint (small objects), never as light. */
    lime: new THREE.MeshStandardMaterial({ color: PALETTE.lime, roughness: 0.5, emissive: new THREE.Color(PALETTE.lime), emissiveIntensity: 0.25 }),
    /** The AI wing's floor (E26): glossy navy glass under its grid of light; a shade lighter when the space is selected. */
    lab: new THREE.MeshPhysicalMaterial({ color: "#0d1a2c", roughness: 0.22, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1.1 }),
    labSelected: new THREE.MeshPhysicalMaterial({ color: "#16294a", roughness: 0.22, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1.1 }),
  }
}

export function materials() {
  if (!cache) cache = build()
  return cache
}

/** Shared uniform of the props' neon (scene/props.tsx): their painted lime strips light up with it. */
export const neonUniform = { value: 0.6 }

/** How much the neon and the warm lights shine for a night factor (0 day, 1 night). */
export function applyNight(night: number) {
  const m = materials()
  m.neon.color.copy(NEON).multiplyScalar(1.6 + 2.6 * night)
  m.neonSoft.color.copy(NEON).multiplyScalar(0.7 + 1.5 * night)
  m.lamp.emissiveIntensity = 2.4 * night
  neonUniform.value = 0.35 + 2.4 * night
}

export const neonColor = (k = 1) => NEON.clone().multiplyScalar(k)
