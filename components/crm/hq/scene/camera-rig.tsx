"use client"

import { useEffect, useRef } from "react"
import { CameraControls, CameraControlsImpl } from "@react-three/drei"
import * as THREE from "three"
import { useHq, useHqStore } from "../store"
import { FOCUS_DISTANCE, LIMITS, OVERVIEW, PLATFORM_HALF, PLOT_Y, zoneCenter } from "./layout"

const { ACTION } = CameraControlsImpl
const OVERVIEW_DISTANCE = new THREE.Vector3(...OVERVIEW.position).sub(new THREE.Vector3(...OVERVIEW.target)).length()

/**
 * The camera: drag to move across the site, right-drag (or two fingers) to turn, wheel or pinch to zoom. Selecting
 * a space flies there, keeping the angle the person chose; "reset" comes back to the whole site.
 */
export function CameraRig() {
  const ref = useRef<CameraControlsImpl>(null)
  const store = useHqStore()
  const focus = useHq((s) => s.focus)
  const command = useHq((s) => s.command)
  const reducedMotion = useHq((s) => s.reducedMotion)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.setLookAt(...OVERVIEW.position, ...OVERVIEW.target, false)
    c.setBoundary(new THREE.Box3(new THREE.Vector3(-PLATFORM_HALF - 4, -1, -PLATFORM_HALF - 4), new THREE.Vector3(PLATFORM_HALF + 4, 8, PLATFORM_HALF + 4)))
  }, [])

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const animate = !reducedMotion
    const position = c.getPosition(new THREE.Vector3())
    const target = c.getTarget(new THREE.Vector3())
    const direction = position.sub(target).normalize()
    const [x, z] = focus ? zoneCenter(focus) : [OVERVIEW.target[0], OVERVIEW.target[2]]
    const to = new THREE.Vector3(x, focus ? PLOT_Y + 0.8 : OVERVIEW.target[1], z)
    const distance = focus === "hq" ? FOCUS_DISTANCE + 5 : focus ? FOCUS_DISTANCE : OVERVIEW_DISTANCE
    const from = to.clone().addScaledVector(direction, distance)
    void c.setLookAt(from.x, from.y, from.z, to.x, to.y, to.z, animate)
  }, [focus, reducedMotion])

  useEffect(() => {
    const c = ref.current
    if (!c || !command) return
    const animate = !store.get().reducedMotion
    switch (command.kind) {
      case "zoomIn":
        void c.dolly(c.distance * 0.25, animate)
        break
      case "zoomOut":
        void c.dolly(-c.distance * 0.3, animate)
        break
      case "rotateLeft":
        void c.rotate(Math.PI / 4, 0, animate)
        break
      case "rotateRight":
        void c.rotate(-Math.PI / 4, 0, animate)
        break
      case "reset":
        void c.setLookAt(...OVERVIEW.position, ...OVERVIEW.target, animate)
        break
    }
  }, [command, store])

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={LIMITS.minDistance}
      maxDistance={LIMITS.maxDistance}
      minPolarAngle={LIMITS.minPolar}
      maxPolarAngle={LIMITS.maxPolar}
      smoothTime={reducedMotion ? 0 : 0.55}
      draggingSmoothTime={0.12}
      dollySpeed={0.7}
      truckSpeed={1.6}
      mouseButtons={{ left: ACTION.TRUCK, middle: ACTION.DOLLY, right: ACTION.ROTATE, wheel: ACTION.DOLLY }}
      touches={{ one: ACTION.TOUCH_TRUCK, two: ACTION.TOUCH_DOLLY_ROTATE, three: ACTION.TOUCH_ROTATE }}
    />
  )
}
