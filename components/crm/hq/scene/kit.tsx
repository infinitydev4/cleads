"use client"

import { useLayoutEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js"
import { materials, PALETTE } from "./materials"

/**
 * Simple shapes in the shared materials: the building, screens, glass, and the stand-ins shown while a Meshy prop
 * loads (or if it cannot). Geometries are cached by size, so thirty desks are thirty meshes over a few geometries.
 */

const geometries = new Map<string, THREE.BufferGeometry>()
function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = geometries.get(key)
  if (!g) {
    g = make()
    geometries.set(key, g)
  }
  return g
}
export const rounded = (w: number, h: number, d: number, r = 0.04) => cached(`rb:${w}:${h}:${d}:${r}`, () => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)))
export const cylinder = (rt: number, rb: number, h: number, s = 24) => cached(`cy:${rt}:${rb}:${h}:${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s))
const sphere = (r: number, detail = 2) => cached(`ico:${r}:${detail}`, () => new THREE.IcosahedronGeometry(r, detail))
const plane = (w: number, h: number) => cached(`pl:${w}:${h}`, () => new THREE.PlaneGeometry(w, h))

type Vec3 = [number, number, number]
interface Placed {
  position?: Vec3
  rotation?: number
  scale?: number
}

export function Block({ size, position, material, radius = 0.04, shadow = true }: { size: Vec3; position: Vec3; material: THREE.Material; radius?: number; shadow?: boolean }) {
  return <mesh geometry={rounded(size[0], size[1], size[2], radius)} material={material} position={position} castShadow={shadow} receiveShadow />
}

/** A thin screen: navy frame and a picture (or a dark glass panel). Pictures ignore the lights so they stay readable. */
export function Screen({ width, height, texture, position, rotation = 0, stand = false }: { width: number; height: number; texture?: THREE.Texture | null; stand?: boolean } & Placed) {
  const m = materials()
  return (
    <group position={position} rotation-y={rotation}>
      <mesh geometry={rounded(width + 0.1, height + 0.1, 0.07, 0.035)} material={m.navy} castShadow />
      <mesh geometry={plane(width, height)} position={[0, 0, 0.037]}>
        {texture ? <meshBasicMaterial map={texture} toneMapped={false} /> : <primitive object={m.screenOff} attach="material" />}
      </mesh>
      {stand && (
        <>
          <mesh geometry={cylinder(0.03, 0.03, 0.32)} material={m.ivory} position={[0, -height / 2 - 0.16, -0.05]} />
          <mesh geometry={rounded(0.3, 0.03, 0.2, 0.012)} material={m.ivory} position={[0, -height / 2 - 0.32, -0.05]} />
        </>
      )}
    </group>
  )
}

/** Office chair whose seat top is at `seat` metres: ivory shell, lime cushion, white star base. */
export function Chair({ position, rotation = 0, seat = 0.48 }: Placed & { seat?: number }) {
  const m = materials()
  return (
    <group position={position} rotation-y={rotation}>
      <mesh geometry={rounded(0.52, 0.09, 0.5, 0.045)} material={m.ceramic} position={[0, seat - 0.065, 0]} castShadow />
      <mesh geometry={rounded(0.44, 0.04, 0.42, 0.02)} material={m.lime} position={[0, seat - 0.015, 0.01]} />
      <mesh geometry={rounded(0.5, 0.5, 0.08, 0.04)} material={m.ceramic} position={[0, seat + 0.25, -0.23]} castShadow />
      <mesh geometry={cylinder(0.03, 0.03, seat - 0.13)} material={m.ivory} position={[0, (seat - 0.11) / 2 + 0.02, 0]} />
      <mesh geometry={cylinder(0.24, 0.24, 0.035)} material={m.ivory} position={[0, 0.04, 0]} />
    </group>
  )
}

/** Desk with a monitor; the person sits on the -z side, facing it. */
export function Desk({ position, rotation = 0, width = 1.5, screen }: Placed & { width?: number; screen?: THREE.Texture | null }) {
  const m = materials()
  return (
    <group position={position} rotation-y={rotation}>
      <mesh geometry={rounded(width, 0.06, 0.72, 0.03)} material={m.ceramic} position={[0, 0.74, 0]} castShadow receiveShadow />
      <mesh geometry={rounded(0.06, 0.72, 0.66, 0.02)} material={m.ivory} position={[-width / 2 + 0.06, 0.37, 0]} castShadow />
      <mesh geometry={rounded(0.06, 0.72, 0.66, 0.02)} material={m.ivory} position={[width / 2 - 0.06, 0.37, 0]} castShadow />
      <mesh geometry={rounded(width - 0.2, 0.025, 0.02, 0.01)} material={m.neon} position={[0, 0.69, -0.35]} />
      <group position={[0, 1.08, 0.18]} rotation-y={Math.PI}>
        <Screen width={0.62} height={0.38} texture={screen} stand />
      </group>
    </group>
  )
}

/** Stand-in plant (white pot, leaves) while the Meshy one loads. */
export function Plant({ position, scale = 1 }: Placed) {
  const m = materials()
  return (
    <group position={position} scale={scale}>
      <mesh geometry={rounded(0.42, 0.42, 0.42, 0.08)} material={m.ceramic} position={[0, 0.21, 0]} castShadow />
      <mesh geometry={sphere(0.32, 1)} material={m.leaf} position={[0, 0.68, 0]} castShadow />
    </group>
  )
}

/** Stand-in server rack; its neon lights blink while a search runs (`busy`). */
export function ServerRack({ position, rotation = 0, busy = false, phase = 0 }: Placed & { busy?: boolean; phase?: number }) {
  const m = materials()
  const leds = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!leds.current) return
    const t = clock.elapsedTime * (busy ? 7 : 1.2) + phase
    leds.current.children.forEach((c, i) => {
      c.visible = !busy || Math.sin(t + i * 1.7) > -0.2
    })
  })
  return (
    <group position={position} rotation-y={rotation}>
      <mesh geometry={rounded(0.7, 1.9, 0.8, 0.06)} material={m.ceramic} position={[0, 0.95, 0]} castShadow receiveShadow />
      <mesh geometry={rounded(0.56, 1.6, 0.02, 0.01)} material={m.navy} position={[0, 0.98, 0.405]} />
      <group ref={leds}>
        {Array.from({ length: 6 }, (_, i) => (
          <mesh key={i} geometry={rounded(0.44, 0.04, 0.02, 0.01)} material={m.neon} position={[0, 0.35 + i * 0.25, 0.42]} />
        ))}
      </group>
    </group>
  )
}

export function GlassWall({ from, to, height = 1.6, y = 0 }: { from: [number, number]; to: [number, number]; height?: number; y?: number }) {
  const m = materials()
  const len = Math.hypot(to[0] - from[0], to[1] - from[1])
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0])
  return (
    <group position={[(from[0] + to[0]) / 2, y, (from[1] + to[1]) / 2]} rotation-y={-angle}>
      <mesh geometry={rounded(len, height, 0.04, 0.01)} material={m.glass} position={[0, height / 2, 0]} renderOrder={3} />
      <mesh geometry={rounded(len, 0.05, 0.07, 0.02)} material={m.ivory} position={[0, height, 0]} />
      <mesh geometry={rounded(len, 0.05, 0.07, 0.02)} material={m.ivory} position={[0, 0.03, 0]} />
    </group>
  )
}

/** Stand-in street lamp: a ring of neon on an ivory pole. */
export function Lamp({ position }: Placed) {
  const m = materials()
  return (
    <group position={position}>
      <mesh geometry={cylinder(0.05, 0.07, 2.6)} material={m.ivory} position={[0, 1.3, 0]} castShadow />
      <mesh material={m.neon} position={[0, 2.8, 0]}>
        <torusGeometry args={[0.28, 0.04, 12, 40]} />
      </mesh>
    </group>
  )
}

/** A tilted tile (for icons), facing the camera's side. */
export function Tile({ texture, position, size = 0.7 }: { texture: THREE.Texture } & Placed & { size?: number }) {
  return (
    <mesh geometry={plane(size, size)} position={position} rotation={[0, Math.PI / 4, 0]}>
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  )
}

/** Stand-in trees (pot, trunk, two crowns) in four instanced meshes. */
export function Trees({ trees, y = 0 }: { trees: [number, number, number][]; y?: number }) {
  const m = materials()
  const crowns = useRef<THREE.InstancedMesh>(null)
  const trunks = useRef<THREE.InstancedMesh>(null)
  const pots = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  useLayoutEffect(() => {
    trees.forEach(([x, z, s], i) => {
      dummy.position.set(x, y + 0.25 * s, z)
      dummy.scale.setScalar(s)
      dummy.rotation.set(0, i * 1.3, 0)
      dummy.updateMatrix()
      pots.current?.setMatrixAt(i, dummy.matrix)
      dummy.position.set(x, y + 1.0 * s, z)
      dummy.updateMatrix()
      trunks.current?.setMatrixAt(i, dummy.matrix)
      dummy.position.set(x, y + 2.15 * s, z)
      dummy.updateMatrix()
      crowns.current?.setMatrixAt(i, dummy.matrix)
    })
    for (const r of [crowns, trunks, pots]) if (r.current) r.current.instanceMatrix.needsUpdate = true
  }, [trees, dummy, y])
  return (
    <group>
      <instancedMesh ref={pots} args={[rounded(1, 0.5, 1, 0.12), m.ceramic, trees.length]} castShadow receiveShadow />
      <instancedMesh ref={trunks} args={[cylinder(0.09, 0.12, 1.4, 8), m.sand, trees.length]} castShadow />
      <instancedMesh ref={crowns} args={[sphere(1.05, 1), m.leaf, trees.length]} castShadow />
    </group>
  )
}

export { PALETTE }
