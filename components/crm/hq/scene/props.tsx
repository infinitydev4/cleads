"use client"

import { Component, Suspense, useLayoutEffect, useMemo, useRef, type ReactNode } from "react"
import { useGLTF } from "@react-three/drei"
import * as THREE from "three"
import measures from "./props.json"
import { Desk, Plant } from "./kit"
import { neonUniform } from "./materials"

/**
 * The props made with Meshy (scripts/build-props.mjs): trees, plants and the Cleads furniture, ivory with neon lime.
 * Each one is sized in metres from its measured footprint. Where the furniture is painted lime (strips, rings,
 * status lights), the paint becomes light: a few lines added to its shader read the colour of the texture and make
 * the lime parts emit, more at night. A prop that is not built yet, or fails to load, shows its fallback.
 */
export const PROPS = {
  tree: { neon: false },
  plant: { neon: false },
  desk: { neon: true },
  chair: { neon: false },
  sofa: { neon: false },
  reception: { neon: true },
  rack: { neon: true },
  lamp: { neon: true },
  table: { neon: true },
} as const
export type PropName = keyof typeof PROPS

type Measure = { size: [number, number, number]; seat?: number }
const MEASURES = measures as unknown as Partial<Record<PropName, Measure>>
export const hasProp = (name: PropName) => !!MEASURES[name]
export const measureOf = (name: PropName) => MEASURES[name]
const file = (name: PropName) => `/3d/props/${name}.glb`

export function preloadProps() {
  for (const name of Object.keys(PROPS) as PropName[]) if (hasProp(name)) useGLTF.preload(file(name), false, true)
}

/** GLSL: the lime parts of the texture emit `emission`, an expression of `neonTexel` and `limeness`. */
export const neonChunk = (emission: string) => /* glsl */ `
#include <emissivemap_fragment>
#ifdef USE_MAP
  vec4 neonTexel = texture2D( map, vMapUv );
  float limeness = smoothstep( 0.28, 0.55, neonTexel.g - neonTexel.b ) * smoothstep( -0.05, 0.12, neonTexel.g - neonTexel.r );
  totalEmissiveRadiance += ${emission};
#endif
`
const NEON_CHUNK = neonChunk("neonTexel.rgb * limeness * uNeon")

/** Once per material: shadows, a touch more studio reflection, and the neon for the furniture that has some. */
function prepare(root: THREE.Object3D, neon: boolean) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = true
    const material = mesh.material as THREE.MeshStandardMaterial
    if (material.userData.hqReady) return
    material.userData.hqReady = true
    material.envMapIntensity = 0.95
    if (neon) {
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uNeon = neonUniform
        shader.fragmentShader = `uniform float uNeon;\n${shader.fragmentShader.replace("#include <emissivemap_fragment>", NEON_CHUNK)}`
      }
      material.customProgramCacheKey = () => "hq-neon"
      material.needsUpdate = true
    }
  })
  return root
}

class PropBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.warn("[hq] prop unavailable, using the simple shape", error)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** How much to scale a prop so it measures `fit` (the first dimension given wins, uniform scale). */
function scaleFor(name: PropName, fit: Fit) {
  const m = MEASURES[name]!
  if (fit.width) return fit.width / m.size[0]
  if (fit.depth) return fit.depth / m.size[2]
  if (fit.height) return fit.height / m.size[1]
  return 1
}

export interface Fit {
  width?: number
  height?: number
  depth?: number
}

function Model({ name, fit, stretchTo }: { name: PropName; fit: Fit; stretchTo?: number }) {
  const { scene } = useGLTF(file(name), false, true)
  const model = useMemo(() => prepare(scene.clone(true), PROPS[name].neon), [scene, name])
  const s = scaleFor(name, fit)
  // A desk keeps its width and gets exactly the height people sit at.
  const sy = stretchTo ? stretchTo / MEASURES[name]!.size[1] : s
  return <primitive object={model} scale={[s, sy, s]} />
}

export function Prop({ name, fit, stretchTo, position, rotation = 0, fallback = null }: { name: PropName; fit: Fit; stretchTo?: number; position?: [number, number, number]; rotation?: number; fallback?: ReactNode }) {
  if (!hasProp(name)) return <group position={position} rotation-y={rotation}>{fallback}</group>
  return (
    <group position={position} rotation-y={rotation}>
      <PropBoundary fallback={fallback}>
        <Suspense fallback={fallback}>
          <Model name={name} fit={fit} stretchTo={stretchTo} />
        </Suspense>
      </PropBoundary>
    </group>
  )
}

export interface Placement {
  position: [number, number, number]
  rotation?: number
  height: number
}

function InstancedModel({ name, items }: { name: PropName; items: Placement[] }) {
  const { scene } = useGLTF(file(name), false, true)
  const parts = useMemo(() => {
    const root = prepare(scene.clone(true), PROPS[name].neon)
    root.updateMatrixWorld(true)
    const out: { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[] = []
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) out.push({ geometry: mesh.geometry, material: mesh.material as THREE.Material, matrix: mesh.matrixWorld.clone() })
    })
    return out
  }, [scene, name])
  return (
    <>
      {parts.map((p, i) => (
        <PartInstances key={i} part={p} name={name} items={items} />
      ))}
    </>
  )
}

function PartInstances({ part, name, items }: { part: { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }; name: PropName; items: Placement[] }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    items.forEach((it, i) => {
      const s = it.height / MEASURES[name]!.size[1]
      q.setFromAxisAngle(up, it.rotation ?? 0)
      m.compose(new THREE.Vector3(...it.position), q, new THREE.Vector3(s, s, s)).multiply(part.matrix)
      mesh.setMatrixAt(i, m)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [items, part, name])
  return <instancedMesh ref={ref} args={[part.geometry, part.material, items.length]} castShadow receiveShadow />
}

/** Many copies of one prop (trees, plants) in a draw call per part. */
export function PropInstances({ name, items, fallback = null }: { name: PropName; items: Placement[]; fallback?: ReactNode }) {
  if (!hasProp(name) || items.length === 0) return <>{fallback}</>
  return (
    <PropBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <InstancedModel name={name} items={items} />
      </Suspense>
    </PropBoundary>
  )
}

/** The Meshy models face +z; this turn puts the desk with its screen away from the person, who sits on its -z side. */
const DESK_YAW = Math.PI

/** Meshy desk (screen and keyboard on it), sized 1.5 m wide; the person sits on its -z side. */
export function DeskProp({ position }: { position: [number, number, number] }) {
  return <Prop name="desk" fit={{ width: 1.5 }} position={position} rotation={DESK_YAW} fallback={<Desk />} />
}

export function PlantProp({ position, height = 1.05 }: { position: [number, number, number]; height?: number }) {
  return <Prop name="plant" fit={{ height }} position={position} rotation={position[0] * 1.7} fallback={<Plant scale={height} />} />
}
