"use client"

import { useEffect, useMemo, useRef } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { ZONES, type ZoneId } from "@/features/hq/zones"
import type { HqState } from "../store"
import { useHq, useHqStore } from "../store"
import { HQ_HALF, PLOT_HALF, PLOT_Y, SEATS, zoneCenter } from "./layout"
import { materials } from "./materials"
import { useFlow, useNeonFlowMaterial } from "./circuits"

/** Where each DOM label hangs in the scene: above a space, or above the head of the person shown. */
export function anchorOf(key: string, s: HqState): [number, number, number] | null {
  if (key.startsWith("zone:")) {
    const zone = ZONES.find((z) => z.id === key.slice(5))
    if (!zone) return null
    return [zone.position[0] - 1.3, PLOT_Y + 3.3, zone.position[1] - 1.3]
  }
  if (key === "member") {
    const id = s.selection?.kind === "member" ? s.selection.id : s.hovered
    const m = s.overview.members.find((x) => x.id === id)
    if (!m) return null
    const seat = SEATS[m.station][m.seat]
    if (!seat) return null
    const [cx, cz] = zoneCenter(m.station)
    return [cx + seat.x, PLOT_Y + (seat.pose === "stand" ? 2.3 : 1.9), cz + seat.z]
  }
  return null
}

/** Puts a label at a pixel position; kept out of the component because it writes to the DOM directly, every frame. */
function place(el: HTMLElement, x: number, y: number, visible: boolean) {
  if (visible) el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`
  el.style.visibility = visible ? "visible" : "hidden"
}

/**
 * Moves the DOM labels (components/crm/hq/hud/scene-labels.tsx) over the scene, once per frame. Labels are plain DOM
 * in the HUD rather than drei <Html>: focusable buttons, no extra React root per label, one loop for all.
 */
export function LabelProjector() {
  const store = useHqStore()
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const s = store.get()
    for (const [key, el] of store.labels) {
      const anchor = anchorOf(key, s)
      if (!anchor) {
        place(el, 0, 0, false)
        continue
      }
      v.set(anchor[0], anchor[1], anchor[2]).project(camera)
      place(el, (v.x * 0.5 + 0.5) * size.width, (-v.y * 0.5 + 0.5) * size.height, v.z < 1)
    }
  })
  return null
}

/**
 * Shifts the picture away from the side panel (pixels, so it holds at every zoom): on a wide screen the platform
 * centres in the free space left of the panel; on a phone it rises above the bottom sheet.
 */
export function ViewOffset() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const wide = size.width >= 640
    const dx = wide ? Math.min(230, size.width * 0.14) : 0
    const dy = wide ? -size.height * 0.02 : size.height * 0.2
    camera.setViewOffset(size.width, size.height, dx, dy, size.width, size.height)
    camera.updateProjectionMatrix()
    invalidate()
    return () => {
      camera.clearViewOffset()
    }
  }, [camera, size, invalidate])
  return null
}

/** A rounded square of glowing trace around a plot (the chase light of the selection). */
function outline(half: number, width: number) {
  const r = 0.6
  const pts: [number, number][] = []
  const corner = (cx: number, cz: number, from: number) => {
    for (let k = 0; k <= 6; k++) {
      const a = from + (k / 6) * (Math.PI / 2)
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r])
    }
  }
  corner(half - r, half - r, 0)
  corner(-half + r, half - r, Math.PI / 2)
  corner(-half + r, -half + r, Math.PI)
  corner(half - r, -half + r, Math.PI * 1.5)
  pts.push(pts[0])
  const pos: number[] = []
  const dist: number[] = []
  const side: number[] = []
  const idx: number[] = []
  let d = 0
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i]
    const [px, pz] = pts[Math.max(0, i - 1)]
    const [nx, nz] = pts[Math.min(pts.length - 1, i + 1)]
    if (i > 0) d += Math.hypot(x - px, z - pz)
    const tx = nx - px
    const tz = nz - pz
    const len = Math.hypot(tx, tz) || 1
    const ox = (-tz / len) * (width / 2)
    const oz = (tx / len) * (width / 2)
    pos.push(x + ox, 0, z + oz, x - ox, 0, z - oz)
    dist.push(d, d)
    side.push(-1, 1)
    if (i > 0) {
      const b = (i - 1) * 2
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute("normal", new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3))
  g.setAttribute("aDist", new THREE.Float32BufferAttribute(dist, 1))
  g.setAttribute("aSide", new THREE.Float32BufferAttribute(side, 1))
  g.setIndex(idx)
  return g
}

/**
 * The selected space (or building): neon corner brackets that breathe, and a trace of light running round the plot,
 * brighter than the circuit so the eye goes there first. A hovered space gets the trace alone, dimmer.
 */
export function SelectionBrackets() {
  const selection = useHq((s) => s.selection)
  const hovered = useHq((s) => s.hovered)
  const reducedMotion = useHq((s) => s.reducedMotion)
  const group = useRef<THREE.Group>(null)
  const m = materials()
  const flow = useNeonFlowMaterial(1.4)
  useFlow(flow, 2.6, 4.2)
  const hoverFlow = useNeonFlowMaterial(0.9)
  useFlow(hoverFlow, 0.9, 1.6)
  const plotOutline = useMemo(() => outline(PLOT_HALF + 0.12, 0.22), [])
  const hqOutline = useMemo(() => outline(HQ_HALF + 0.12, 0.22), [])
  useFrame(({ clock }) => {
    if (group.current && !reducedMotion) group.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 3) * 0.012)
  })
  const target: ZoneId | "hq" | null = selection?.kind === "zone" ? selection.id : selection?.kind === "hq" ? "hq" : null
  const hover = hovered && hovered !== target && (hovered === "hq" || ZONES.some((z) => z.id === hovered)) ? (hovered as ZoneId | "hq") : null
  const arm = 1.2
  const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
  return (
    <>
      {hover && (
        <mesh geometry={hover === "hq" ? hqOutline : plotOutline} material={hoverFlow} position={[zoneCenter(hover)[0], PLOT_Y + 0.02, zoneCenter(hover)[1]]} renderOrder={2} />
      )}
      {target && (
        <group position={[zoneCenter(target)[0], PLOT_Y + 0.02, zoneCenter(target)[1]]}>
          <mesh geometry={target === "hq" ? hqOutline : plotOutline} material={flow} renderOrder={2} />
          <group ref={group}>
            {corners.map(([sx, sz], i) => {
              const half = (target === "hq" ? HQ_HALF : PLOT_HALF) + 0.55
              return (
                <group key={i} position={[sx * half, 0.06, sz * half]}>
                  <mesh material={m.neon} position={[(-sx * arm) / 2, 0, 0]}>
                    <boxGeometry args={[arm, 0.1, 0.16]} />
                  </mesh>
                  <mesh material={m.neon} position={[0, 0, (-sz * arm) / 2]}>
                    <boxGeometry args={[0.16, 0.1, arm]} />
                  </mesh>
                </group>
              )
            })}
          </group>
        </group>
      )}
    </>
  )
}
