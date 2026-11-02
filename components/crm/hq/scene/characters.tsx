"use client"

import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react"
import { useFrame, type ThreeEvent } from "@react-three/fiber"
import { useAnimations, useGLTF } from "@react-three/drei"
import * as THREE from "three"
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js"
import { CHARACTERS, CHARACTER_IDS, type CharacterId } from "@/features/hq/characters"
import { Chair, cylinder, rounded } from "./kit"
import { materials } from "./materials"
import { Prop, hasProp, measureOf } from "./props"

/** The agents' android (E26): not a character members pick, so it is not in features/hq/characters.ts. */
export const ANDROID_FILE = "/3d/characters/android.glb"

/** Meshopt-compressed files (scripts/build-characters.mjs); no Draco, so no decoder fetched from a CDN. */
export function preloadCharacters() {
  for (const id of CHARACTER_IDS) useGLTF.preload(CHARACTERS[id].file, false, true)
  useGLTF.preload(ANDROID_FILE, false, true)
}

export type Pose = "sit" | "talk"
const HEIGHT = 1.72
/** Hip joint to the surface a person sits on (buttocks and thighs). */
const HIP_TO_SEAT = 0.1
/** Seat height a seated pose is brought to, and how far a pose may be raised or lowered to get there. */
const SEAT_TARGET = 0.48
const MAX_LOWER = 0.09
const MAX_RAISE = 0.06

/** The clip a person plays: seated or standing talk only exist for some characters (features/hq/characters.ts). */
export function clipFor(character: CharacterId, pose: Pose, seated: boolean) {
  const talk = CHARACTERS[character].talk
  if (pose === "sit") return "sit"
  if (seated) return talk === "sit_talk" ? "sit_talk" : "sit"
  return talk
}

/**
 * Where the hips are in a clip, relative to the model's own origin. Meshy's seated clips do not keep the hips over
 * the origin (they sit 20 to 60 cm behind it and 15 to 40 cm to one side, depending on the character and the clip):
 * this is what put people beside their chair. Measured on the first frame, with a throwaway mixer.
 */
function hipsOf(model: THREE.Object3D, clip: THREE.AnimationClip | undefined) {
  const hips = model.getObjectByName("Hips")
  if (!hips) return null
  const mixer = new THREE.AnimationMixer(model)
  if (clip) {
    mixer.clipAction(clip).play()
    mixer.setTime(0.05)
  }
  model.updateMatrixWorld(true)
  // Hip position in the space of the model's parent, whatever the scene around it.
  const rel = new THREE.Matrix4().copy(model.matrixWorld).invert().multiply(hips.matrixWorld)
  const p = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().multiplyMatrices(model.matrix, rel))
  mixer.stopAllAction()
  mixer.uncacheRoot(model)
  return p
}

/**
 * Starts a clip at `time`, fading from the one playing (a cut when motion is reduced). Kept out of the component:
 * three.js animation actions are mutable engine objects, made to be driven like this.
 */
function play(next: THREE.AnimationAction, previous: THREE.AnimationAction | null, time: number, still: boolean) {
  next.reset()
  next.time = time
  next.timeScale = still ? 0 : 1
  if (previous && previous !== next && !still) {
    next.fadeIn(0.35).play()
    previous.fadeOut(0.35)
  } else {
    if (previous && previous !== next) previous.stop()
    next.play()
  }
}

/** Turn applied to the Meshy chair so its backrest is behind a person facing +z (set from the generated model). */
export const CHAIR_YAW = 0

/** The chair under a seated person: the Meshy chair scaled so its seat is exactly where the person sits. */
export function SeatChair({ seat }: { seat: number }) {
  const m = measureOf("chair")
  if (!hasProp("chair") || !m?.seat) return <Chair seat={seat} />
  return <Prop name="chair" fit={{ height: (seat / m.seat) * m.size[1] }} rotation={CHAIR_YAW} fallback={<Chair seat={seat} />} />
}

interface ModelProps {
  file: string
  /** The clip to play; a change fades from the previous one. */
  clip: string
  /** The clip whose hips place the person on the seat (default: the one played), so a gesture does not move them. */
  fitClip?: string
  /** Start the clip from its beginning (a gesture) rather than at a point of its loop that depends on `phase`. */
  restart?: boolean
  seated: boolean
  phase: number
  reducedMotion: boolean
  /** Runs once on this person's own copy of the model (the android lights its neon there). Must be stable. */
  prepare?: (model: THREE.Object3D) => void
}

/** A rigged model (a member's character or the agents' android) at its place, playing one of its clips. */
export function SkinnedModel({ file, clip: name, fitClip, restart, seated, phase, reducedMotion, prepare }: ModelProps) {
  const gltf = useGLTF(file, false, true)
  const root = useRef<THREE.Group>(null)
  // One skeleton per person: a shared one would make everybody move the same bones.
  const model = useMemo(() => {
    const c = cloneSkinned(gltf.scene)
    c.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.receiveShadow = true
        // Bind-pose bounds do not follow the animation: never cull a person half out of frame.
        mesh.frustumCulled = false
        // Clicks hit the simple box around the person (HitBox), not 15 000 animated triangles.
        mesh.raycast = () => undefined
      }
    })
    // Size check on the bones, in the rest pose: a skinned mesh's own bounds ignore the armature's scale.
    c.updateMatrixWorld(true)
    const head = c.getObjectByName("head_end") ?? c.getObjectByName("Head")
    if (head) {
      const top = head.getWorldPosition(new THREE.Vector3()).y
      if (top > 0 && Math.abs(top - HEIGHT) / HEIGHT > 0.25) c.scale.multiplyScalar(HEIGHT / top)
    }
    prepare?.(c)
    return c
  }, [gltf.scene, prepare])
  const byName = (n: string | undefined) => (n ? gltf.animations.find((a) => a.name === n) : undefined)
  const clip = byName(name) ?? byName("sit")
  const fitWith = byName(fitClip) ?? clip

  // Put the hips over the origin (the middle of the seat, or the person's spot when standing), at seat height.
  const fit = useMemo(() => {
    const hips = hipsOf(model, fitWith)
    if (!hips) return { x: 0, y: 0, z: 0, seat: SEAT_TARGET }
    const y = seated ? Math.min(MAX_RAISE, Math.max(-MAX_LOWER, SEAT_TARGET + HIP_TO_SEAT - hips.y)) : 0
    return { x: -hips.x, y, z: -hips.z, seat: hips.y + y - HIP_TO_SEAT }
  }, [model, fitWith, seated])

  const { actions } = useAnimations(gltf.animations, root)
  // The action playing now: a new clip fades in over it rather than cutting.
  const playing = useRef<THREE.AnimationAction | null>(null)
  useEffect(() => {
    const action = (clip && actions[clip.name]) ?? Object.values(actions)[0]
    if (!action) return
    play(action, playing.current, restart ? 0 : (phase * 7.3) % Math.max(0.1, action.getClip().duration), reducedMotion)
    playing.current = action
  }, [actions, clip, phase, restart, reducedMotion])
  useEffect(() => {
    const action = playing
    return () => {
      action.current?.stop()
    }
  }, [])

  return (
    <>
      <group ref={root} position={[fit.x, fit.y, fit.z]}>
        <primitive object={model} />
      </group>
      {seated && <SeatChair seat={fit.seat} />}
    </>
  )
}

/** Shown while the model loads, or if it cannot: a simple figure in the same colours, same place. */
function Placeholder({ seated }: { seated: boolean }) {
  const m = materials()
  const y = seated ? 0.45 : 0
  return (
    <group>
      {seated && <Chair seat={SEAT_TARGET} />}
      <mesh geometry={rounded(0.42, 0.62, 0.28, 0.12)} material={m.navy} position={[0, y + 0.95, 0]} castShadow />
      {!seated && <mesh geometry={rounded(0.34, 0.66, 0.22, 0.08)} material={m.ink} position={[0, 0.33, 0]} castShadow />}
      <mesh geometry={cylinder(0.15, 0.15, 0.24, 14)} material={m.ivoryWarm} position={[0, y + 1.42, 0]} castShadow />
    </group>
  )
}

export class LoadBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.warn("[hq] character model unavailable, using the simple figure", error)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** What the pointer hits: an invisible box the size of a seated or standing person (cheap and reliable to pick). */
export function HitBox({ seated }: { seated: boolean }) {
  const h = seated ? 1.45 : 1.85
  return (
    <mesh position={[0, h / 2, 0]}>
      <boxGeometry args={[0.75, h, 0.75]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>
  )
}

const STATUS_COLOR = { meeting: "#f0b44a", online: "#9dff2a", offline: "#9aa3bb" } as const

interface Props {
  character: CharacterId
  pose: Pose
  seated: boolean
  position: [number, number, number]
  rotation: number
  /** Desynchronises the loops so a room does not move in step. */
  phase: number
  status?: "meeting" | "online" | "offline" | null
  highlighted?: boolean
  reducedMotion: boolean
  onSelect?: () => void
  onHover?: (over: boolean) => void
}

/**
 * A person at their place. The origin is the middle of the seat (or the spot where they stand): the model is shifted
 * so the hips of its clip land there, and the chair is drawn under them at the measured height.
 */
export function Character({ character, pose, seated, position, rotation, phase, status, highlighted, reducedMotion, onSelect, onHover }: Props) {
  const dot = useRef<THREE.Mesh>(null)
  const top = seated ? 1.62 : 2.05
  const dotColor = useMemo(() => (status ? new THREE.Color(STATUS_COLOR[status]).multiplyScalar(status === "online" ? 2.2 : 1.4) : null), [status])
  useFrame(({ clock }) => {
    if (dot.current && !reducedMotion) dot.current.position.y = top + Math.sin(clock.elapsedTime * 2 + phase) * 0.04
  })
  const click = (e: ThreeEvent<MouseEvent>) => {
    // A drag of the camera ends with a click: ignore it.
    if (e.delta > 4) return
    e.stopPropagation()
    onSelect?.()
  }
  return (
    <group
      position={position}
      rotation-y={rotation}
      onClick={onSelect ? click : undefined}
      onPointerOver={onSelect ? (e) => { e.stopPropagation(); onHover?.(true); document.body.style.cursor = "pointer" } : undefined}
      onPointerOut={onSelect ? () => { onHover?.(false); document.body.style.cursor = "" } : undefined}
    >
      {onSelect && <HitBox seated={seated} />}
      <LoadBoundary fallback={<Placeholder seated={seated} />}>
        <Suspense fallback={<Placeholder seated={seated} />}>
          <SkinnedModel file={CHARACTERS[character].file} clip={clipFor(character, pose, seated)} seated={seated} phase={phase} reducedMotion={reducedMotion} />
        </Suspense>
      </LoadBoundary>
      {dotColor && (
        <mesh ref={dot} position={[0, top, 0]}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshBasicMaterial color={dotColor} toneMapped={false} />
        </mesh>
      )}
      {highlighted && (
        // A neon ring on the floor under the person shown in the panel (the name label is in the HUD).
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]} material={materials().neon}>
          <ringGeometry args={[0.5, 0.6, 40]} />
        </mesh>
      )}
    </group>
  )
}
