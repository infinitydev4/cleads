"use client"

import { useMemo } from "react"
import * as THREE from "three"
import { useHq, useHqStore, clearSelection } from "../store"
import { Circuits } from "./circuits"
import { Lamp, Trees, rounded } from "./kit"
import { FLOOR_Y, HQ_HALF, PLATFORM, PLATFORM_CENTER, PLATFORM_HEIGHT, PLATFORM_SIZE, PLOT_Y, TREES, onPlatform } from "./layout"
import { PALETTE, materials } from "./materials"
import { Prop, PropInstances, type Placement } from "./props"

/**
 * Street lamps on the platform's edges: they light the night (a real light each, and a pool on the floor). Every real
 * light costs on every lit pixel of the scene: the AI wing (E26) moved the near-left corner's lamp rather than adding one.
 */
const LAMPS: [number, number][] = [
  [PLATFORM.minX + 1.2, PLATFORM.maxZ - 1.2],
  [PLATFORM.maxX - 1.2, PLATFORM.maxZ - 1.2],
  [PLATFORM.maxX - 1.2, PLATFORM.minZ + 1.2],
  [-6, PLATFORM.maxZ - 1.2],
  [PLATFORM.maxX - 1.2, 6],
]

/** A soft round glow drawn once, used for the pools of light on the floor at night. */
function usePoolTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas")
    c.width = c.height = 128
    const g = c.getContext("2d")!
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    grad.addColorStop(0, "rgba(255,255,255,1)")
    grad.addColorStop(0.35, "rgba(255,255,255,0.45)")
    grad.addColorStop(1, "rgba(255,255,255,0)")
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
}

/**
 * Night lighting: a point light per lamp and one warm light in the building, always mounted (their intensity follows
 * the night) so turning the evening on never recompiles a shader; plus pools of light on the floor, which cost nothing.
 */
function NightLights() {
  const night = useHq((s) => s.light.night)
  const lowPower = useHq((s) => s.lowPower)
  const pool = usePoolTexture()
  const neon = useMemo(() => new THREE.Color(PALETTE.neon), [])
  const warm = useMemo(() => new THREE.Color(PALETTE.warm), [])
  return (
    <group>
      {!lowPower && LAMPS.map(([x, z], i) => <pointLight key={i} position={[x, FLOOR_Y + 2.7, z]} color={i % 2 ? warm : neon} intensity={night * 26} distance={13} decay={2} />)}
      {!lowPower && <pointLight position={[0.5, PLOT_Y + 2.2, 0.5]} color={warm} intensity={night * 34} distance={12} decay={2} />}
      {LAMPS.map(([x, z], i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[x, FLOOR_Y + 0.02, z]} renderOrder={1}>
          <planeGeometry args={[7, 7]} />
          <meshBasicMaterial map={pool} color={(i % 2 ? warm : neon).clone().multiplyScalar(0.55 * night)} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      <mesh rotation-x={-Math.PI / 2} position={[0.5, PLOT_Y + 0.02, 0.5]} renderOrder={1}>
        <planeGeometry args={[HQ_HALF * 2.2, HQ_HALF * 2.2]} />
        <meshBasicMaterial map={pool} color={warm.clone().multiplyScalar(0.4 * night)} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** Trees round the platform (Meshy model, one draw call per part). */
function Garden() {
  const outside: Placement[] = useMemo(() => TREES.filter(([x, z]) => !onPlatform(x, z)).map(([x, z, s], i) => ({ position: [x, 0, z], rotation: i * 1.31, height: 3.1 * s })), [])
  const inside: Placement[] = useMemo(() => TREES.filter(([x, z]) => onPlatform(x, z)).map(([x, z, s], i) => ({ position: [x, FLOOR_Y, z], rotation: i * 2.1, height: 2.6 * s })), [])
  return (
    <>
      <PropInstances name="tree" items={outside} fallback={<Trees trees={TREES.filter(([x, z]) => !onPlatform(x, z))} />} />
      <PropInstances name="tree" items={inside} fallback={<Trees trees={TREES.filter(([x, z]) => onPlatform(x, z))} y={FLOOR_Y} />} />
    </>
  )
}

/** Ground, platform, circuits, trees, road and lamps: everything that is not a space. */
export function World() {
  const store = useHqStore()
  const m = materials()
  const ground = useHq((s) => s.light.backgroundBottom)
  const [width, depth] = PLATFORM_SIZE
  const [cx, cz] = PLATFORM_CENTER
  return (
    <group>
      {/* Clicking the empty ground leaves the current space. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]} receiveShadow onClick={(e) => { if (e.delta <= 4) clearSelection(store) }}>
        <planeGeometry args={[320, 320]} />
        <meshStandardMaterial color={ground} roughness={1} />
      </mesh>
      <mesh geometry={rounded(width, PLATFORM_HEIGHT, depth, 0.3)} material={m.ivoryWarm} position={[cx, PLATFORM_HEIGHT / 2, cz]} receiveShadow castShadow />
      {/* A neon line along the top edge of the platform. */}
      {[[cx, PLATFORM.maxZ - 0.05, width - 0.6, 0.05], [cx, PLATFORM.minZ + 0.05, width - 0.6, 0.05], [PLATFORM.maxX - 0.05, cz, 0.05, depth - 0.6], [PLATFORM.minX + 0.05, cz, 0.05, depth - 0.6]].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, FLOOR_Y - 0.04, z]} material={m.neonSoft}>
          <boxGeometry args={[w, 0.04, d]} />
        </mesh>
      ))}
      {/* Low glass fence on the far edges, as in the reference: the platform reads as a site. */}
      {[[PLATFORM.minX + 0.15, cz, 0], [cx, PLATFORM.minZ + 0.15, 1]].map(([x, z, r], i) => (
        <mesh key={i} geometry={rounded(r ? width - 0.6 : 0.06, 0.8, r ? 0.06 : depth - 0.6, 0.02)} material={m.glass} position={[x, FLOOR_Y + 0.4, z]} />
      ))}
      <Circuits />
      <Garden />
      {/* The road along the near-left side, with its dashes. */}
      <mesh rotation-x={-Math.PI / 2} position={[cx, 0.005, PLATFORM.maxZ + 4.2]} receiveShadow material={m.stone}>
        <planeGeometry args={[102, 5]} />
      </mesh>
      {Array.from({ length: 17 }, (_, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[cx - 48 + i * 6, 0.012, PLATFORM.maxZ + 4.2]}>
          <planeGeometry args={[2.4, 0.16]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      ))}
      {LAMPS.map(([x, z], i) => <Prop key={i} name="lamp" fit={{ height: 3.0 }} position={[x, FLOOR_Y, z]} fallback={<Lamp />} />)}
      <NightLights />
    </group>
  )
}
