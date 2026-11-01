"use client"

import { useLayoutEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { useHq } from "../store"
import { FLOOR_Y, RING, RING_PATH, onRing, spurs } from "./layout"
import { materials, neonColor } from "./materials"

/**
 * The circuit between the spaces, drawn like the traces of a circuit board: an ivory groove with a neon lime core in
 * which pulses of light run towards the spaces. One merged geometry and one shader for every trace; the light is
 * pushed above 1 so the bloom pass makes it glow.
 */

interface Trace {
  from: [number, number]
  to: [number, number]
  /** Distance already travelled at `from`, so the pulses flow continuously from one trace into the next. */
  start: number
  width: number
}

/** The ring (clockwise, continuous distance) and the spurs (from the ring out to each door). */
export function traces(): Trace[] {
  const out: Trace[] = []
  let d = 0
  for (let i = 0; i < RING_PATH.length; i++) {
    const a = RING_PATH[i]
    const b = RING_PATH[(i + 1) % RING_PATH.length]
    out.push({ from: a, to: b, start: d, width: 0.36 })
    d += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  for (const [a, b] of spurs()) out.push({ from: a, to: b, start: 0, width: 0.26 })
  return out
}

/** Quads along each trace, with the distance along it and the side across it as attributes. */
function stripGeometry(list: Trace[], widen = 1) {
  const pos: number[] = []
  const dist: number[] = []
  const side: number[] = []
  const idx: number[] = []
  for (const t of list) {
    const [ax, az] = t.from
    const [bx, bz] = t.to
    const len = Math.hypot(bx - ax, bz - az)
    const nx = (-(bz - az) / len) * (t.width * widen) / 2
    const nz = ((bx - ax) / len) * (t.width * widen) / 2
    // Extend by half a width at both ends so corners close without a gap.
    const ex = ((bx - ax) / len) * (t.width * widen) / 2
    const ez = ((bz - az) / len) * (t.width * widen) / 2
    const base = pos.length / 3
    const corners: [number, number, number, number][] = [
      [ax - ex + nx, az - ez + nz, t.start, -1],
      [ax - ex - nx, az - ez - nz, t.start, 1],
      [bx + ex + nx, bz + ez + nz, t.start + len, -1],
      [bx + ex - nx, bz + ez - nz, t.start + len, 1],
    ]
    for (const [x, z, d, s] of corners) {
      pos.push(x, 0, z)
      dist.push(d)
      side.push(s)
    }
    idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
  // Flat on the floor. Without normals a lit material divides by zero and writes NaN, which the bloom spreads.
  g.setAttribute("normal", new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3))
  g.setAttribute("aDist", new THREE.Float32BufferAttribute(dist, 1))
  g.setAttribute("aSide", new THREE.Float32BufferAttribute(side, 1))
  g.setIndex(idx)
  g.computeBoundingSphere()
  return g
}

const vertex = /* glsl */ `
  attribute float aDist;
  attribute float aSide;
  varying float vDist;
  varying float vSide;
  void main() {
    vDist = aDist;
    vSide = aSide;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragment = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uSpeed;
  uniform vec3 uColor;
  varying float vDist;
  varying float vSide;
  // smoothstep with edge0 > edge1 is undefined in GLSL (NaN on Apple GPUs, which the bloom then spreads): always
  // ascending edges, inverted with 1.0 - when a falling edge is needed.
  void main() {
    float s = clamp(abs(vSide), 0.0, 1.0);
    // A crisp lit tube in the middle and a lime glow falling off across the groove: blended over the floor rather
    // than added to it, so the lime still reads on an ivory floor by day.
    float core = 1.0 - smoothstep(0.2, 0.38, s);
    float halo = 1.0 - smoothstep(0.0, 1.0, s);
    float t = vDist * 0.55 - uTime * uSpeed;
    float f = fract(t);
    // A pulse every ~1.8 m, with a sharp head and a fading tail, and now and then a brighter packet.
    float pulse = smoothstep(0.0, 0.04, f) * (1.0 - smoothstep(0.06, 0.42, f));
    float g = fract(t * 0.2);
    float k = max(0.0, 1.0 - abs(g - 0.5) * 9.0);
    float packet = k * k;
    float energy = 0.7 + 1.1 * pulse + 2.4 * packet;
    float alpha = clamp(core + halo * halo * (0.32 + 0.3 * pulse), 0.0, 1.0);
    gl_FragColor = vec4(uColor * uIntensity * mix(0.55, energy, core), alpha);
  }
`

/** One material per scene: time and intensity are uniforms, updated every frame. */
export function useNeonFlowMaterial(speed = 0.55) {
  return useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uIntensity: { value: 1 }, uSpeed: { value: speed }, uColor: { value: neonColor(1) } },
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    [speed]
  )
}

/** Advances a flow material; kept out of the hook because it writes shader uniforms every frame. */
function tick(material: THREE.ShaderMaterial, dt: number, intensity: number) {
  material.uniforms.uTime.value += dt
  material.uniforms.uIntensity.value = intensity
}

/** Moves the pulses and sets their brightness from the night factor (still when motion is reduced). */
export function useFlow(material: THREE.ShaderMaterial, dayIntensity = 1.4, nightIntensity = 3.4) {
  const night = useHq((s) => s.light.night)
  const reducedMotion = useHq((s) => s.reducedMotion)
  useFrame((_, dt) => tick(material, reducedMotion ? 0 : dt, dayIntensity + (nightIntensity - dayIntensity) * night))
}

/** Light running round the ring: one packet per few emails sent this week (between 6 and 28). */
function Packets() {
  const emails = useHq((s) => s.overview.signals.emails7d)
  const reducedMotion = useHq((s) => s.reducedMotion)
  const count = Math.min(28, 6 + Math.round(emails / 6))
  const mesh = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const capsule = useMemo(() => new THREE.CapsuleGeometry(0.07, 0.5, 4, 8).rotateX(Math.PI / 2), [])
  const place = (t: number) => {
    if (!mesh.current) return
    for (let i = 0; i < count; i++) {
      const u = t + i / count
      const [x, z] = onRing(u)
      const [nx, nz] = onRing(u + 0.002)
      dummy.position.set(x, FLOOR_Y + 0.08, z)
      dummy.rotation.set(0, Math.atan2(nx - x, nz - z), 0)
      dummy.updateMatrix()
      mesh.current.setMatrixAt(i, dummy.matrix)
    }
    mesh.current.instanceMatrix.needsUpdate = true
  }
  useLayoutEffect(() => place(0))
  useFrame(({ clock }) => {
    if (!reducedMotion) place(clock.elapsedTime * 0.01)
  })
  return (
    <instancedMesh key={count} ref={mesh} args={[undefined, materials().neon, count]}>
      <primitive object={capsule} attach="geometry" />
    </instancedMesh>
  )
}

/** A glowing via where traces meet: a disc and a ring that breathes. */
function Via({ x, z, phase }: { x: number; z: number; phase: number }) {
  const ring = useRef<THREE.Mesh>(null)
  const reducedMotion = useHq((s) => s.reducedMotion)
  const m = materials()
  useFrame(({ clock }) => {
    if (ring.current && !reducedMotion) ring.current.scale.setScalar(1 + 0.18 * Math.sin(clock.elapsedTime * 2.2 + phase))
  })
  return (
    <group position={[x, FLOOR_Y + 0.02, z]}>
      <mesh rotation-x={-Math.PI / 2} material={m.sand}>
        <circleGeometry args={[0.62, 40]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.01} material={m.neon}>
        <circleGeometry args={[0.2, 32]} />
      </mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.012} material={m.neonSoft}>
        <ringGeometry args={[0.38, 0.45, 48]} />
      </mesh>
    </group>
  )
}

export function Circuits() {
  const list = useMemo(() => traces(), [])
  const groove = useMemo(() => stripGeometry(list, 2.1), [list])
  const core = useMemo(() => stripGeometry(list, 1), [list])
  const flow = useNeonFlowMaterial()
  useFlow(flow)
  const m = materials()
  const vias: [number, number][] = [[-RING, -RING], [RING, -RING], [RING, RING], [-RING, RING], [RING, 0], [-RING, 0], [0, RING], [0, -RING]]
  return (
    <group>
      {/* The ivory groove the light runs in, a hair above the floor. */}
      <mesh geometry={groove} material={m.sand} position-y={FLOOR_Y + 0.004} receiveShadow />
      <mesh geometry={core} material={flow} position-y={FLOOR_Y + 0.014} renderOrder={2} />
      {vias.map(([x, z], i) => <Via key={i} x={x} z={z} phase={i * 0.9} />)}
      <Packets />
    </group>
  )
}
