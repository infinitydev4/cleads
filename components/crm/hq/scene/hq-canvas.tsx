"use client"

import { useEffect, useMemo, useRef } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { AdaptiveDpr } from "@react-three/drei"
import * as THREE from "three"
import { HqStoreContext, useHq, useHqStore, type HqStore } from "../store"
import { CameraRig } from "./camera-rig"
import { preloadCharacters } from "./characters"
import { Look } from "./effects"
import { LabelProjector, SelectionBrackets, ViewOffset } from "./labels"
import { CAMERA_FOV, OVERVIEW } from "./layout"
import { applyNight } from "./materials"
import { preloadProps } from "./props"
import { World } from "./world"
import { Zones } from "./zones"

/** Sun (or moon), sky light and glow, from the ambience computed by the view (features/hq/ambience.ts). */
function Lights() {
  const light = useHq((s) => s.light)
  const lowPower = useHq((s) => s.lowPower)
  const invalidate = useThree((s) => s.invalidate)
  const direction = useMemo(() => new THREE.Vector3(...light.lightDirection).normalize().multiplyScalar(60), [light.lightDirection])
  useEffect(() => {
    applyNight(light.night)
    invalidate()
  }, [light.night, invalidate])
  return (
    <>
      <hemisphereLight args={[light.skyColor, light.groundColor, light.hemiIntensity * 0.42]} />
      <directionalLight
        position={direction}
        color={light.lightColor}
        intensity={light.lightIntensity}
        castShadow={!lowPower}
        shadow-mapSize={[lowPower ? 1024 : 2048, lowPower ? 1024 : 2048]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.025}
        shadow-camera-left={-34}
        shadow-camera-right={34}
        shadow-camera-top={34}
        shadow-camera-bottom={-34}
        shadow-camera-near={1}
        shadow-camera-far={160}
      />
    </>
  )
}

interface Sample {
  start: number
  frames: number
  slow: number
  done: boolean
}

/** One frame of measure (writes the sample): true once two 3-second windows in a row ran below 36 fps. */
function tooSlow(sample: Sample, t: number, dt: number) {
  // A pause (hidden tab, a shader compiling) is not slowness: start a new window.
  if (dt > 0.5 || document.hidden) {
    sample.start = 0
    sample.frames = 0
    return false
  }
  if (!sample.start) sample.start = t
  sample.frames++
  if (t - sample.start < 3) return false
  sample.slow = sample.frames / (t - sample.start) < 36 ? sample.slow + 1 : 0
  sample.start = t
  sample.frames = 0
  return sample.slow >= 2
}

/**
 * Switches to the light rendering when the device really cannot keep up, measured after a warm-up (loading the models
 * and compiling the shaders make the first seconds slow everywhere). Acts once: after that, or once the light
 * rendering has been chosen by hand, the gauge button decides.
 */
function QualityGuard() {
  const store = useHqStore()
  const sample = useRef<Sample>({ start: 0, frames: 0, slow: 0, done: false })
  useFrame(({ clock }, dt) => {
    const s = sample.current
    const { lowPower, reducedMotion } = store.get()
    if (lowPower) s.done = true
    if (s.done || reducedMotion || clock.elapsedTime < 8) return
    if (tooSlow(s, clock.elapsedTime, dt)) {
      s.done = true
      store.set({ lowPower: true })
    }
  })
  return null
}

/** Keeps the frame loop alive only while something moves when motion is reduced. */
function DemandOnChange() {
  const store = useHqStore()
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const stop = store.subscribe(() => invalidate())
    return () => {
      stop()
    }
  }, [store, invalidate])
  return null
}

export default function HqCanvas({ store }: { store: HqStore }) {
  const reducedMotion = useHq((s) => s.reducedMotion)
  const lowPower = useHq((s) => s.lowPower)
  useEffect(() => {
    preloadCharacters()
    preloadProps()
  }, [])
  return (
    <Canvas
      className="!absolute inset-0"
      shadows={!lowPower}
      // Tone mapping is done by the post-processing chain (Khronos PBR Neutral), not by the renderer.
      flat
      dpr={[1, lowPower ? 1 : 1.5]}
      frameloop={reducedMotion ? "demand" : "always"}
      camera={{ fov: CAMERA_FOV, position: OVERVIEW.position, near: 1, far: 420 }}
      gl={{ antialias: false, alpha: false, stencil: false, powerPreference: "high-performance" }}
      fallback={<p className="p-6 text-sm">Votre navigateur n’affiche pas la 3D (WebGL indisponible). Utilisez la vue 2D.</p>}
    >
      {/* Re-provided inside the Canvas, which is another React root. */}
      <HqStoreContext.Provider value={store}>
        <Lights />
        <World />
        <Zones />
        <SelectionBrackets />
        <CameraRig />
        <Look />
        <LabelProjector />
        <ViewOffset />
        <DemandOnChange />
        <QualityGuard />
        <AdaptiveDpr />
      </HqStoreContext.Provider>
    </Canvas>
  )
}
