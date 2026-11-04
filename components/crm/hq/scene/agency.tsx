"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import type { AgentId } from "@/features/ai/agents"
import { CONTROL_ROOM, type AgentState } from "@/features/hq/agency"
import type { AgentPulse, StudioPulse } from "@/features/hq/types"
import { openHqWindow } from "@/lib/crm/hq-window"
import { COPILOT_EVENT } from "@/components/crm/copilot/copilot"
import { selectAgent, selectZone, useHq, useHqStore, type HqStore } from "../store"
import { Android } from "./android"
import { useAgentsAtWork } from "./circuits"
import { Block, clickHandler, cylinder, rounded, useCanvasTexture } from "./kit"
import { CONSOLE, CONTROL_ROOM_RADIUS, CONTROL_ROOM_SEATS, CORE_HEIGHT, DESIGNER_SEAT, FLOOR_Y, GALLERY_FRAMES, GALLERY_WALL, PLOT_HALF, PLOT_Y, TOTEM } from "./layout"
import { materials, neonColor } from "./materials"
import { DeskProp, PlantProp } from "./props"
import { agentPanelTexture, framedThumbTexture, pageWireTexture, totemTexture } from "./textures"

/**
 * The AI wing of the QG (E26). "Agents IA" is a control room: the copilot's holographic core in the middle, the six
 * specialists round it at a hexagonal console, each with a holographic panel and the light of its state; data flows
 * from the agents at work into the core. "Studio Web" is the designer's atelier: the latest mock-ups hang on a gallery
 * wall (their real first screens), and the page being generated builds up on a holographic canvas. Both stand on a
 * floor of navy glass with a grid of light. Everything shown comes from the agency's pulse (features/hq/agency.ts).
 */

const useAgent = (id: AgentId) => useHq((s) => s.overview.agency?.agents.find((a) => a.id === id) ?? null)
const useShownAgent = (id: AgentId) => useHq((s) => (s.selection?.kind === "agent" && s.selection.id === id) || s.hovered === `agent:${id}`)

/** A success to greet: the id of a run that has just ended well. */
const greetOf = (pulse: AgentPulse | null) => (pulse?.lastDone?.ok ? pulse.lastDone.runId : null)

function hover(store: HqStore, key: string, over: boolean) {
  if (over) store.set({ hovered: key })
  else if (store.get().hovered === key) store.set({ hovered: null })
}

// ---------------------------------------------------------------------------------------------------------------
// The floor of the wing
// ---------------------------------------------------------------------------------------------------------------

const GRID_VERTEX = /* glsl */ `
  varying vec2 vPos;
  void main() {
    vPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const GRID_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uLevel;
  uniform float uWave;
  uniform vec3 uColor;
  varying vec2 vPos;
  // Hairlines every "step" metres. They fade out as they get denser than the pixels (seen from afar, a grid becomes a
  // tinted sheet otherwise). Edges are never equal (undefined in GLSL): fwidth gets a floor.
  float lines(vec2 p, float step) {
    vec2 f = max(fwidth(p), vec2(0.0001));
    vec2 d = abs(fract(p / step + 0.5) - 0.5) * step;
    vec2 l = 1.0 - smoothstep(vec2(0.0), f * 1.2, d);
    float density = max(f.x, f.y) / step;
    return max(l.x, l.y) * (1.0 - smoothstep(0.04, 0.16, density));
  }
  void main() {
    float r = length(vPos);
    float grid = lines(vPos, 1.0);
    // A soft pool of light under the middle of the space.
    float pool = 1.0 - smoothstep(0.0, 3.2, r);
    // While agents work, a thin ring of light leaves the centre every few seconds.
    float front = fract(uTime * 0.16) * 5.0;
    float wave = uWave * (1.0 - smoothstep(0.0, 0.18, abs(r - front))) * (1.0 - smoothstep(3.0, 4.6, r));
    // The grid fades towards the edge of the plot: an inlay of light, not a sheet.
    float edge = 1.0 - smoothstep(3.0, 3.95, max(abs(vPos.x), abs(vPos.y)));
    float a = (grid * 0.32 + pool * 0.07 + wave * 0.38) * uLevel * edge;
    gl_FragColor = vec4(uColor * a, 1.0);
  }
`

/** Advances the grid; kept out of the component because it writes shader uniforms every frame. */
function gridTick(material: THREE.ShaderMaterial, dt: number, level: number, wave: number) {
  material.uniforms.uTime.value += dt
  material.uniforms.uLevel.value = level
  material.uniforms.uWave.value = wave
}

/** How busy a space of the wing is: agents at work in the control room, a page being made in the Studio. */
function useBusy(zone: "agents" | "studio") {
  const working = useAgentsAtWork()
  const making = useHq((s) => (s.overview.agency?.studio?.building ?? 0) + (s.overview.agency?.agents.find((a) => a.id === "designer")?.running ?? 0))
  return zone === "agents" ? working : making
}

/** The navy glass floor of a space of the wing and its grid of light (brighter at night, selected, or at work). */
export function LabFloor({ zone, selected }: { zone: "agents" | "studio"; selected: boolean }) {
  const m = materials()
  const night = useHq((s) => s.light.night)
  const reducedMotion = useHq((s) => s.reducedMotion)
  const working = useBusy(zone)
  const grid = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uLevel: { value: 0.6 }, uWave: { value: 0 }, uColor: { value: neonColor(1) } },
        vertexShader: GRID_VERTEX,
        fragmentShader: GRID_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    []
  )
  useEffect(() => () => grid.dispose(), [grid])
  useFrame((_, dt) => gridTick(grid, reducedMotion ? 0 : dt, (0.5 + 0.7 * night) * (selected ? 1.35 : 1), reducedMotion ? 0 : Math.min(1, working / 2)))
  const size = PLOT_HALF * 2 - 0.5
  return (
    <>
      <mesh geometry={rounded(size, 0.012, size, 0.2)} material={selected ? m.labSelected : m.lab} position={[0, PLOT_Y + 0.006, 0]} receiveShadow />
      <mesh rotation-x={-Math.PI / 2} position={[0, PLOT_Y + 0.014, 0]} material={grid} renderOrder={1}>
        <planeGeometry args={[size, size]} />
      </mesh>
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// "Agents IA": the control room
// ---------------------------------------------------------------------------------------------------------------

/** A ring with one flat side per post, between two apothems, extruded upwards. */
function hexRing(inner: number, outer: number, height: number, bevel = 0.015) {
  const half = Math.PI / CONTROL_ROOM_SEATS.length
  const corners = (apothem: number) =>
    CONTROL_ROOM_SEATS.map((s) => {
      const a = s.angle + half
      const r = apothem / Math.cos(half)
      // Drawn in the shape's plane, which becomes the floor once turned (its y is the world's -z).
      return new THREE.Vector2(Math.cos(a) * r, -Math.sin(a) * r)
    })
  const shape = new THREE.Shape(corners(outer))
  shape.holes.push(new THREE.Path(corners(inner)))
  const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 1 })
  g.rotateX(-Math.PI / 2)
  return g
}

/** The console the agents work at: a glazed top on a recessed navy body, a lime line along its front. */
function Console() {
  const m = materials()
  const top = useMemo(() => hexRing(CONSOLE.inner, CONSOLE.outer, 0.05), [])
  const body = useMemo(() => hexRing(CONSOLE.inner + 0.1, CONSOLE.outer - 0.32, CONSOLE.height - 0.08, 0), [])
  const line = useMemo(() => hexRing(CONSOLE.outer - 0.01, CONSOLE.outer + 0.012, 0.018, 0), [])
  useEffect(
    () => () => {
      top.dispose()
      body.dispose()
      line.dispose()
    },
    [top, body, line]
  )
  return (
    <group position-y={PLOT_Y}>
      <mesh geometry={body} material={m.navy} position-y={0.01} castShadow receiveShadow />
      <mesh geometry={top} material={m.ceramic} position-y={CONSOLE.height - 0.065} castShadow receiveShadow />
      <mesh geometry={line} material={m.neon} position-y={CONSOLE.height - 0.075} />
    </group>
  )
}

/** Light of the core for this frame; kept out of the component because it moves and scales scene objects. */
function spin(shell: THREE.Object3D, rings: THREE.Object3D[], orb: THREE.Object3D, t: number, dt: number, speed: number, beat: number) {
  shell.rotation.y += dt * speed
  shell.rotation.x += dt * speed * 0.35
  rings[0].rotation.set(Math.PI / 2 + Math.sin(t * 0.4) * 0.3, 0, t * speed * 0.8)
  rings[1].rotation.set(Math.PI / 2.6, t * speed * 1.1, Math.PI / 5)
  orb.scale.setScalar(beat)
}

/** The copilot: a holographic core on its plinth. It turns faster and beats harder as more agents work; a click opens it. */
function Core() {
  const store = useHqStore()
  const m = materials()
  const working = useAgentsAtWork()
  const reducedMotion = useHq((s) => s.reducedMotion)
  const shown = useShownAgent("copilot")
  const shell = useRef<THREE.LineSegments>(null)
  const ringA = useRef<THREE.Mesh>(null)
  const ringB = useRef<THREE.Mesh>(null)
  const orb = useRef<THREE.Mesh>(null)
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.56, 1)), [])
  const beam = useMemo(() => new THREE.MeshBasicMaterial({ color: neonColor(0.35), transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }), [])
  useEffect(
    () => () => {
      edges.dispose()
      beam.dispose()
    },
    [edges, beam]
  )
  useFrame(({ clock }, dt) => {
    if (!shell.current || !ringA.current || !ringB.current || !orb.current) return
    const speed = reducedMotion ? 0 : 0.25 + 0.35 * Math.min(working, 4)
    const beat = reducedMotion ? 1 : 1 + (0.06 + 0.05 * Math.min(working, 4)) * Math.sin(clock.elapsedTime * (2 + working))
    spin(shell.current, [ringA.current, ringB.current], orb.current, clock.elapsedTime, dt, speed, beat)
  })
  const open = () => {
    selectAgent(store, "copilot", "agents")
    window.dispatchEvent(new Event(COPILOT_EVENT))
  }
  return (
    <group
      position={[0, PLOT_Y, 0]}
      onClick={clickHandler(open)}
      onPointerOver={(e) => {
        e.stopPropagation()
        hover(store, "agent:copilot", true)
        document.body.style.cursor = "pointer"
      }}
      onPointerOut={() => {
        hover(store, "agent:copilot", false)
        document.body.style.cursor = ""
      }}
    >
      <mesh geometry={cylinder(0.5, 0.62, 0.9, 40)} material={m.ceramic} position-y={0.45} castShadow receiveShadow />
      <mesh material={m.neon} position-y={0.91} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.5, 0.022, 10, 56]} />
      </mesh>
      {/* The projector's beam, from the plinth to the hologram. */}
      <mesh geometry={cylinder(0.36, 0.1, CORE_HEIGHT - 0.95, 40, true)} material={beam} position-y={0.92 + (CORE_HEIGHT - 0.95) / 2} />
      <group position-y={CORE_HEIGHT}>
        <lineSegments ref={shell} geometry={edges}>
          <lineBasicMaterial color={neonColor(1.6)} toneMapped={false} />
        </lineSegments>
        <mesh ref={orb} material={m.neon}>
          <icosahedronGeometry args={[0.2, 2]} />
        </mesh>
        <mesh ref={ringA} material={m.neonSoft}>
          <torusGeometry args={[0.8, 0.012, 8, 72]} />
        </mesh>
        <mesh ref={ringB} material={m.neonSoft}>
          <torusGeometry args={[0.68, 0.012, 8, 72]} />
        </mesh>
        {/* What the pointer hits: the hologram itself is too thin to aim at. */}
        <mesh>
          <sphereGeometry args={[0.9, 12, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      </group>
      {shown && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.02} material={m.neon}>
          <ringGeometry args={[0.78, 0.88, 56]} />
        </mesh>
      )}
    </group>
  )
}

/** How bright a post's panel shines (HDR: above 1, the bloom makes it glow). */
const PANEL_GLOW: Record<AgentState, number> = { working: 1.9, waiting: 1.7, queued: 1.25, idle: 0.95, off: 0.5 }

/** One post of the control room: the agent facing the core, and its holographic panel above the console. */
function Station({ index }: { index: number }) {
  const store = useHqStore()
  const id = CONTROL_ROOM[index]
  const seat = CONTROL_ROOM_SEATS[index]
  const pulse = useAgent(id)
  const state: AgentState = pulse?.state ?? "idle"
  const shown = useShownAgent(id)
  const panel = useCanvasTexture(() => agentPanelTexture(id, state), `${id}:${state}`)
  const glow = useMemo(() => new THREE.Color(1, 1, 1).multiplyScalar(PANEL_GLOW[state]), [state])
  // The panel stands over the console, between the agent and the core, turned towards the agent.
  const panelZ = CONTROL_ROOM_RADIUS - (CONSOLE.inner + CONSOLE.outer) / 2
  return (
    <group position={[seat.x, PLOT_Y, seat.z]} rotation-y={seat.rot}>
      <Android state={state} greet={greetOf(pulse)} phase={index * 1.7} highlighted={shown} onSelect={() => selectAgent(store, id, "agents")} onHover={(over) => hover(store, `agent:${id}`, over)} />
      <group position={[0, CONSOLE.height + 0.3, panelZ]} rotation-y={Math.PI}>
        <mesh rotation-x={-0.16} renderOrder={3}>
          <planeGeometry args={[0.72, 0.45]} />
          <meshBasicMaterial map={panel} color={glow} transparent side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

const PER_POST = 4
const streamDummy = new THREE.Object3D()

/** Places the packets of data; kept out of the component because it writes the instances' matrices. */
function placePackets(mesh: THREE.InstancedMesh, busy: boolean[], time: number) {
  CONTROL_ROOM_SEATS.forEach((seat, k) => {
    const from = new THREE.Vector3(seat.x, 0, seat.z).multiplyScalar((CONTROL_ROOM_RADIUS - 0.9) / CONTROL_ROOM_RADIUS)
    for (let p = 0; p < PER_POST; p++) {
      const i = k * PER_POST + p
      if (!busy[k]) {
        streamDummy.scale.setScalar(0)
      } else {
        const t = (time * 0.45 + p / PER_POST + k * 0.13) % 1
        streamDummy.position.set(from.x * (1 - t), CONSOLE.height + 0.45 + (CORE_HEIGHT - CONSOLE.height - 0.45) * t + Math.sin(Math.PI * t) * 0.3, from.z * (1 - t))
        streamDummy.scale.setScalar(0.6 + 0.6 * Math.sin(Math.PI * t))
      }
      streamDummy.updateMatrix()
      mesh.setMatrixAt(i, streamDummy.matrix)
    }
  })
  mesh.instanceMatrix.needsUpdate = true
}

/** Packets of light flowing from each agent at work into the core. */
function DataStreams() {
  const agents = useHq((s) => s.overview.agency?.agents)
  const reducedMotion = useHq((s) => s.reducedMotion)
  const busy = useMemo(() => CONTROL_ROOM.map((id) => (agents?.find((a) => a.id === id)?.running ?? 0) > 0), [agents])
  const mesh = useRef<THREE.InstancedMesh>(null)
  const dot = useMemo(() => new THREE.IcosahedronGeometry(0.035, 1), [])
  useEffect(() => () => dot.dispose(), [dot])
  useFrame(({ clock }) => {
    if (mesh.current) placePackets(mesh.current, busy, reducedMotion ? 0.3 : clock.elapsedTime)
  })
  return <instancedMesh ref={mesh} args={[dot, materials().neon, CONTROL_ROOM.length * PER_POST]} position-y={PLOT_Y} frustumCulled={false} />
}

/** "Agents IA": the copilot's core, the console and the six posts. */
export function ControlRoom() {
  return (
    <>
      <Core />
      <Console />
      {CONTROL_ROOM.map((_, i) => (
        <Station key={i} index={i} />
      ))}
      <DataStreams />
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// "Studio Web": the atelier
// ---------------------------------------------------------------------------------------------------------------

/** The picture of a mock-up, loaded once from the Studio's protected route (it checks the right to see the fiche). */
function useThumb(url: string | null) {
  const [loaded, setLoaded] = useState<{ url: string; image: HTMLImageElement } | null>(null)
  useEffect(() => {
    if (!url) return
    let alive = true
    const image = new Image()
    image.decoding = "async"
    image.src = url
    image
      .decode()
      .then(() => alive && setLoaded({ url, image }))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [url])
  return loaded && loaded.url === url ? loaded.image : null
}

/** A frame of the gallery: a click opens the mock-up's page in a window of the view. */
function Frame({ site, position, yaw }: { site: StudioPulse["latest"][number] | null; position: [number, number, number]; yaw: number }) {
  const m = materials()
  const [over, setOver] = useState(false)
  const image = useThumb(site?.thumb ?? null)
  const caption = site ? site.name : "Prochaine maquette"
  const picture = useCanvasTexture(() => framedThumbTexture(image, caption), `${site?.id ?? "empty"}:${site?.version ?? 0}:${image ? "1" : "0"}:${caption}`)
  return (
    <group position={position} rotation-y={yaw}>
      <group
        position-z={over ? 0.07 : 0}
        onClick={site ? clickHandler(() => openHqWindow(`/app/studio/${site.id}`)) : undefined}
        onPointerOver={
          site
            ? (e) => {
                e.stopPropagation()
                setOver(true)
                document.body.style.cursor = "pointer"
              }
            : undefined
        }
        onPointerOut={
          site
            ? () => {
                setOver(false)
                document.body.style.cursor = ""
              }
            : undefined
        }
      >
        <mesh geometry={rounded(1.86, 1.28, 0.06, 0.03)} material={m.navy} castShadow />
        <mesh position-z={0.032}>
          <planeGeometry args={[1.76, 1.18]} />
          <meshBasicMaterial map={picture} toneMapped={false} />
        </mesh>
        <mesh material={over ? m.neon : m.neonSoft} position={[0, -0.7, 0.02]}>
          <boxGeometry args={[over ? 1.7 : 1.1, 0.025, 0.02]} />
        </mesh>
      </group>
    </group>
  )
}

/** The gallery wall: an L of glazed ceramic on the plot's far sides (they face the camera), a lime line on top. */
function GalleryWall() {
  const m = materials()
  const { inset, height, thickness } = GALLERY_WALL
  const length = inset * 2 + thickness
  return (
    <>
      <Block size={[length, height, thickness]} position={[0, PLOT_Y + height / 2, -inset]} material={m.ceramic} />
      <Block size={[thickness, height, length]} position={[-inset, PLOT_Y + height / 2, 0]} material={m.ceramic} />
      <Block size={[length - 0.3, 0.04, 0.04]} position={[0.15, PLOT_Y + height - 0.1, -inset + thickness / 2 + 0.02]} material={m.neon} shadow={false} />
      <Block size={[0.04, 0.04, length - 0.3]} position={[-inset + thickness / 2 + 0.02, PLOT_Y + height - 0.1, 0.15]} material={m.neon} shadow={false} />
    </>
  )
}

const CANVAS_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const CANVAS_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uReveal;
  uniform float uLevel;
  uniform vec3 uScanColor;
  varying vec2 vUv;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    float edge = 1.0 - uReveal;
    float shown = step(edge, vUv.y);
    // A bright line where the page is being drawn, only while it is.
    float scan = (1.0 - smoothstep(0.0, 0.012, abs(vUv.y - edge))) * step(0.001, uReveal) * step(uReveal, 0.999);
    gl_FragColor = vec4(t.rgb * uLevel * shown + uScanColor * scan, max(t.a * shown, scan));
  }
`

/** Reveals the page; kept out of the component because it writes shader uniforms every frame. */
function canvasTick(material: THREE.ShaderMaterial, reveal: number, level: number) {
  material.uniforms.uReveal.value = reveal
  material.uniforms.uLevel.value = level
}

/** The designer's holographic canvas: while a page is generated, it builds up from the top, again and again. */
function HoloCanvas({ building, attention }: { building: boolean; attention: boolean }) {
  const night = useHq((s) => s.light.night)
  const reducedMotion = useHq((s) => s.reducedMotion)
  const page = useMemo(() => pageWireTexture(), [])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uMap: { value: page }, uReveal: { value: 1 }, uLevel: { value: 1 }, uScanColor: { value: neonColor(2.6) } },
        vertexShader: CANVAS_VERTEX,
        fragmentShader: CANVAS_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [page]
  )
  useEffect(
    () => () => {
      material.dispose()
      page.dispose()
    },
    [material, page]
  )
  const beacon = useRef<THREE.Mesh>(null)
  const amber = useMemo(() => new THREE.Color("#f0b44a").multiplyScalar(1.6), [])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    // Five seconds to draw the page, one to look at it.
    const reveal = building && !reducedMotion ? Math.min(1, (t % 6) / 5) : 1
    canvasTick(material, reveal, (building ? 1.5 : 0.75) * (0.8 + 0.6 * night))
    if (beacon.current && !reducedMotion) beacon.current.rotation.y = t * 1.6
  })
  return (
    <group>
      <mesh material={material} renderOrder={3}>
        <planeGeometry args={[0.96, 1.2]} />
      </mesh>
      {/* A brief waits for a person: an amber marker above the canvas. */}
      {attention && (
        <mesh ref={beacon} position-y={0.82}>
          <octahedronGeometry args={[0.08, 0]} />
          <meshBasicMaterial color={amber} toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}

/** The designer at work: desk, android, and the canvas the page is drawn on. */
function DesignerDesk({ studio }: { studio: StudioPulse | null }) {
  const store = useHqStore()
  const pulse = useAgent("designer")
  const shown = useShownAgent("designer")
  const seat = DESIGNER_SEAT
  return (
    <group position={[seat.x, PLOT_Y, seat.z]} rotation-y={seat.rot}>
      <DeskProp position={[0, 0, 0.66]} />
      <Android state={pulse?.state ?? "idle"} greet={greetOf(pulse)} phase={2.3} highlighted={shown} onSelect={() => selectAgent(store, "designer", "studio")} onHover={(over) => hover(store, "agent:designer", over)} />
      <group position={[0, 1.62, 1.5]} rotation-y={Math.PI}>
        <HoloCanvas building={(studio?.building ?? 0) > 0 || pulse?.state === "working"} attention={(studio?.briefs ?? 0) > 0} />
      </group>
    </group>
  )
}

/** "Studio Web": the gallery of the latest mock-ups and the designer's desk. */
export function Atelier() {
  const studio = useHq((s) => s.overview.agency?.studio ?? null)
  return (
    <>
      <GalleryWall />
      {GALLERY_FRAMES.map(([x, z, yaw], i) => (
        <Frame key={i} site={studio?.latest[i] ?? null} position={[x, PLOT_Y + 1.42, z]} yaw={yaw} />
      ))}
      <DesignerDesk studio={studio} />
      <PlantProp position={[3.3, PLOT_Y, -3.25]} />
      <PlantProp position={[-3.3, PLOT_Y, 3.3]} height={0.85} />
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// The totem at the entrance of the wing
// ---------------------------------------------------------------------------------------------------------------

/** "Agence IA": a navy totem between the two avenues, turned to the camera; a click opens the control room. */
export function Totem() {
  const store = useHqStore()
  const m = materials()
  const sign = useMemo(() => totemTexture(), [])
  useEffect(() => () => sign.dispose(), [sign])
  return (
    <group position={[TOTEM[0], FLOOR_Y, TOTEM[1]]} rotation-y={Math.PI / 4} onClick={clickHandler(() => selectZone(store, "agents"))}>
      <mesh geometry={rounded(0.64, 2.5, 0.16, 0.05)} material={m.navy} position-y={1.25} castShadow receiveShadow />
      <mesh position={[0, 1.32, 0.082]}>
        <planeGeometry args={[0.52, 1.56]} />
        <meshBasicMaterial map={sign} toneMapped={false} />
      </mesh>
      <mesh material={m.neon} position={[0, 0.04, 0]}>
        <boxGeometry args={[0.74, 0.03, 0.26]} />
      </mesh>
    </group>
  )
}
