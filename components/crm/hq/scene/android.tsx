"use client"

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useFrame, type ThreeEvent } from "@react-three/fiber"
import * as THREE from "three"
import type { AgentState } from "@/features/hq/agency"
import { useHq } from "../store"
import { ANDROID_FILE, HitBox, LoadBoundary, SkinnedModel } from "./characters"
import { Chair, cylinder, rounded } from "./kit"
import { materials, neonColor } from "./materials"
import { neonChunk } from "./props"

/**
 * An agent of the AI agency (E26): the android made with Meshy (scripts/build-characters.mjs), seated at its post. Its
 * lime strips, eyes and lights are its state: they breathe while it waits for the worker, beat while it works, turn
 * amber when a person has to decide, and go dark when the agent is switched off. A success gets a thumbs-up and a ring
 * of light on the floor.
 */

interface Lights {
  level: number
  /** Share of the level that beats, and how fast (radians per second). */
  pulse: number
  speed: number
  amber: boolean
}

const LIGHTS: Record<AgentState, Lights> = {
  working: { level: 1.5, pulse: 0.45, speed: 5.5, amber: false },
  queued: { level: 0.9, pulse: 0.35, speed: 1.8, amber: false },
  waiting: { level: 1.3, pulse: 0.5, speed: 3.2, amber: true },
  idle: { level: 0.5, pulse: 0.08, speed: 1.2, amber: false },
  off: { level: 0.04, pulse: 0, speed: 0, amber: false },
}
const GREETING = { level: 2.6, pulse: 0.15, speed: 8, amber: false } satisfies Lights
const AMBER = new THREE.Color("#f0b44a").multiplyScalar(1.6)
const GREETING_MS = 3_200

/** The clip for a state: answering questions while it works, a thumbs-up to greet a success, at rest otherwise. */
const clipOf = (state: AgentState, greeting: boolean) => (greeting ? "sit_done" : state === "working" ? "sit_talk" : "sit")

interface NeonUniforms {
  uNeonLevel: { value: number }
  uNeonTint: { value: THREE.Color }
  uNeonTintMix: { value: number }
}

/** Gives every mesh of this android its own copy of the material, whose lime parts emit with this android's uniforms. */
function lightUp(model: THREE.Object3D, u: NeonUniforms, made: THREE.Material[]) {
  model.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const material = (mesh.material as THREE.MeshStandardMaterial).clone()
    material.envMapIntensity = 0.95
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u)
      shader.fragmentShader = `uniform float uNeonLevel;\nuniform vec3 uNeonTint;\nuniform float uNeonTintMix;\n${shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        neonChunk("mix( neonTexel.rgb, uNeonTint, uNeonTintMix ) * limeness * uNeonLevel")
      )}`
    }
    // One program for every android: only the uniforms differ.
    material.customProgramCacheKey = () => "hq-android"
    mesh.material = material
    made.push(material)
  })
}

/**
 * This frame's lights: the strips' level and colour, and the eyes of the stand-in figure. Kept out of the component
 * because it writes shader uniforms and a material every frame.
 */
function shine(u: NeonUniforms, eyes: THREE.MeshBasicMaterial, l: Lights, level: number) {
  u.uNeonLevel.value = level
  u.uNeonTintMix.value = l.amber ? 1 : 0
  eyes.color.copy(l.amber ? AMBER : neonColor(1)).multiplyScalar(Math.max(0.15, level * 1.4))
}

/** Shown while the model loads, or if it cannot: an ivory figure with a navy visor and lime eyes, seated. */
function AndroidFigure({ eyes }: { eyes: THREE.Material }) {
  const m = materials()
  return (
    <group>
      <Chair seat={0.48} />
      <mesh geometry={rounded(0.4, 0.58, 0.26, 0.13)} material={m.ceramic} position={[0, 0.98, 0]} castShadow />
      <mesh geometry={rounded(0.36, 0.14, 0.42, 0.06)} material={m.ceramic} position={[0, 0.56, 0.12]} castShadow />
      <mesh geometry={cylinder(0.05, 0.05, 0.1, 12)} material={m.navy} position={[0, 1.31, 0]} />
      <mesh geometry={rounded(0.28, 0.3, 0.28, 0.12)} material={m.ceramic} position={[0, 1.5, 0]} castShadow />
      <mesh geometry={rounded(0.24, 0.16, 0.04, 0.06)} material={m.navy} position={[0, 1.51, 0.13]} />
      <mesh geometry={rounded(0.15, 0.025, 0.01, 0.01)} material={eyes} position={[0, 1.52, 0.155]} />
    </group>
  )
}

interface Props {
  state: AgentState
  /** A run that has just succeeded: the android greets it once (its id, so each success is greeted once). */
  greet: string | null
  phase: number
  highlighted: boolean
  onSelect: () => void
  onHover: (over: boolean) => void
}

/** An agent at its post. The origin is the middle of its seat, the agent faces +z (towards its console). */
export function Android({ state, greet, phase, highlighted, onSelect, onHover }: Props) {
  const reducedMotion = useHq((s) => s.reducedMotion)
  const night = useHq((s) => s.light.night)
  const uniforms = useMemo<NeonUniforms>(() => ({ uNeonLevel: { value: 0.5 }, uNeonTint: { value: AMBER.clone() }, uNeonTintMix: { value: 0 } }), [])
  const made = useRef<THREE.Material[]>([])
  const prepare = useCallback((model: THREE.Object3D) => lightUp(model, uniforms, made.current), [uniforms])
  useEffect(() => {
    const list = made.current
    return () => list.forEach((m) => m.dispose())
  }, [])

  // The greeting: a thumbs-up and a ring of light, for a few seconds, once per success.
  const [greeting, setGreeting] = useState<string | null>(null)
  useEffect(() => {
    if (!greet) return
    const start = setTimeout(() => setGreeting(greet), 0)
    const end = setTimeout(() => setGreeting(null), GREETING_MS)
    return () => {
      clearTimeout(start)
      clearTimeout(end)
    }
  }, [greet])
  const greetingNow = greeting !== null && greeting === greet

  const eyes = useMemo(() => new THREE.MeshBasicMaterial({ color: neonColor(2), toneMapped: false }), [])
  useEffect(() => () => eyes.dispose(), [eyes])
  const beacon = useRef<THREE.Group>(null)
  const ripple = useRef<THREE.Mesh>(null)
  const rippleStart = useRef<number | null>(null)
  useEffect(() => {
    rippleStart.current = greetingNow ? -1 : null
  }, [greetingNow])

  useFrame(({ clock }) => {
    const l = greetingNow ? GREETING : LIGHTS[state]
    const t = clock.elapsedTime
    const beat = reducedMotion || !l.pulse ? 1 : 1 - l.pulse + l.pulse * (0.5 + 0.5 * Math.sin(t * l.speed + phase))
    // Lime strips glow more at night, like the furniture's neon (materials.ts applyNight).
    shine(uniforms, eyes, l, l.level * beat * (0.65 + 1.5 * night))
    if (beacon.current) {
      beacon.current.visible = state === "waiting"
      if (!reducedMotion) beacon.current.rotation.y = t * 1.6
    }
    const r = ripple.current
    if (r) {
      if (rippleStart.current === -1) rippleStart.current = t
      const age = rippleStart.current === null ? Infinity : t - rippleStart.current
      r.visible = age < 2 && !reducedMotion
      if (r.visible) {
        r.scale.setScalar(0.4 + age * 1.1)
        ;(r.material as THREE.MeshBasicMaterial).opacity = 1 - age / 2
      }
    }
  })

  const click = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return
    e.stopPropagation()
    onSelect()
  }
  const m = materials()
  return (
    <group
      onClick={click}
      onPointerOver={(e) => {
        e.stopPropagation()
        onHover(true)
        document.body.style.cursor = "pointer"
      }}
      onPointerOut={() => {
        onHover(false)
        document.body.style.cursor = ""
      }}
    >
      <HitBox seated />
      <LoadBoundary fallback={<AndroidFigure eyes={eyes} />}>
        <Suspense fallback={<AndroidFigure eyes={eyes} />}>
          <SkinnedModel file={ANDROID_FILE} clip={clipOf(state, greetingNow)} fitClip="sit" restart={greetingNow} seated phase={phase} reducedMotion={reducedMotion || state === "off"} prepare={prepare} />
        </Suspense>
      </LoadBoundary>
      {/* Waiting for a person: an amber beacon turns above the head. */}
      <group ref={beacon} position={[0, 1.98, 0]} visible={false}>
        <mesh rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.16, 0.022, 10, 36]} />
          <meshBasicMaterial color={AMBER} toneMapped={false} />
        </mesh>
        <mesh>
          <octahedronGeometry args={[0.06, 0]} />
          <meshBasicMaterial color={AMBER} toneMapped={false} />
        </mesh>
      </group>
      {/* A success: a ring of light spreads on the floor. */}
      <mesh ref={ripple} rotation-x={-Math.PI / 2} position={[0, 0.02, 0]} visible={false} renderOrder={2}>
        <ringGeometry args={[0.55, 0.62, 48]} />
        <meshBasicMaterial color={neonColor(2.2)} transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>
      {highlighted && (
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]} material={m.neon}>
          <ringGeometry args={[0.5, 0.6, 40]} />
        </mesh>
      )}
    </group>
  )
}
