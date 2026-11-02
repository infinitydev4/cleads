"use client"

import { useEffect, useMemo, useRef } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { AdaptiveDpr, useProgress } from "@react-three/drei"
import * as THREE from "three"
import { HqStoreContext, useHq, useHqStore, type HqStore } from "../store"
import { CameraRig } from "./camera-rig"
import { preloadCharacters } from "./characters"
import { Look } from "./effects"
import { LabelProjector, SelectionBrackets, ViewOffset } from "./labels"
import { CAMERA_FOV, OVERVIEW, PLATFORM_CENTER } from "./layout"
import { applyNight } from "./materials"
import { preloadProps } from "./props"
import { World } from "./world"
import { Zones } from "./zones"

/** Where the sun aims: the middle of the platform, so its shadows cover the AI wing as well (E26). */
const SUN_TARGET = new THREE.Vector3(PLATFORM_CENTER[0], 0, PLATFORM_CENTER[1])

/** Sun (or moon), sky light and glow, from the ambience computed by the view (features/hq/ambience.ts). */
function Lights() {
  const light = useHq((s) => s.light)
  const lowPower = useHq((s) => s.lowPower)
  const invalidate = useThree((s) => s.invalidate)
  const direction = useMemo(() => new THREE.Vector3(...light.lightDirection).normalize().multiplyScalar(60).add(SUN_TARGET), [light.lightDirection])
  // The light's target must be in the scene for its matrix to follow.
  const target = useMemo(() => {
    const o = new THREE.Object3D()
    o.position.copy(SUN_TARGET)
    return o
  }, [])
  useEffect(() => {
    applyNight(light.night)
    invalidate()
  }, [light.night, invalidate])
  return (
    <>
      <hemisphereLight args={[light.skyColor, light.groundColor, light.hemiIntensity * 0.42]} />
      <primitive object={target} />
      <directionalLight
        target={target}
        position={direction}
        color={light.lightColor}
        intensity={light.lightIntensity}
        castShadow={!lowPower}
        shadow-mapSize={[lowPower ? 1024 : 2048, lowPower ? 1024 : 2048]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.025}
        shadow-camera-left={-36}
        shadow-camera-right={36}
        shadow-camera-top={36}
        shadow-camera-bottom={-36}
        shadow-camera-near={1}
        shadow-camera-far={160}
      />
    </>
  )
}

interface Sample {
  /** When the models finished loading (elapsed time), 0 while some are still coming. */
  settled: number
  start: number
  frames: number
  slow: number
  done: boolean
}

/** One frame of measure (writes the sample): true once two 4-second windows in a row ran below 30 fps. */
function tooSlow(sample: Sample, t: number, dt: number) {
  // A pause (hidden tab, a shader compiling) is not slowness: start a new window.
  if (dt > 0.5 || document.hidden) {
    sample.start = 0
    sample.frames = 0
    return false
  }
  if (!sample.start) sample.start = t
  sample.frames++
  if (t - sample.start < 4) return false
  sample.slow = sample.frames / (t - sample.start) < 30 ? sample.slow + 1 : 0
  sample.start = t
  sample.frames = 0
  return sample.slow >= 2
}

/**
 * Switches to the light rendering when the device really cannot keep up. Judged only once every model has arrived and
 * a few quiet seconds have passed: loading and compiling shaders make the first seconds slow on any device, and a
 * false alarm would take the shadows away from a machine that can afford them. Acts once: after that, or once the
 * light rendering has been chosen by hand, the gauge button decides.
 */
function QualityGuard() {
  const store = useHqStore()
  const sample = useRef<Sample>({ settled: 0, start: 0, frames: 0, slow: 0, done: false })
  useFrame(({ clock }, dt) => {
    const s = sample.current
    const { lowPower, reducedMotion, covered } = store.get()
    if (lowPower) s.done = true
    // Under a window the scene draws only on demand: no frame rate to measure.
    if (s.done || reducedMotion || covered) return
    if (useProgress.getState().active) {
      s.settled = 0
      return
    }
    if (!s.settled) s.settled = clock.elapsedTime
    if (clock.elapsedTime - s.settled < 5) return
    if (tooSlow(s, clock.elapsedTime, dt)) {
      s.done = true
      store.set({ lowPower: true })
    }
  })
  return null
}

/**
 * Compiles every shader as soon as the models are in (in parallel where the browser can), instead of stalling the
 * first frames that show them. Again after switching quality, which changes the shaders.
 */
function Precompile() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const loaded = useProgress((s) => !s.active && s.loaded > 0)
  const lowPower = useHq((s) => s.lowPower)
  useEffect(() => {
    if (!loaded) return
    // A moment for the models that just arrived to be mounted in the scene.
    const id = setTimeout(() => void gl.compileAsync(scene, camera).catch(() => undefined), 250)
    return () => clearTimeout(id)
  }, [loaded, lowPower, gl, scene, camera])
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
  // Under a window the scene rests: a frame only when something changes, the GPU is left to the page.
  const covered = useHq((s) => s.covered)
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
      frameloop={reducedMotion || covered ? "demand" : "always"}
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
        <Precompile />
        <AdaptiveDpr />
      </HqStoreContext.Provider>
    </Canvas>
  )
}
