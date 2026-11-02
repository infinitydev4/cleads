"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useFrame, type ThreeEvent } from "@react-three/fiber"
import * as THREE from "three"
import { characterFor, type CharacterId } from "@/features/hq/characters"
import { ZONES, type ZoneId } from "@/features/hq/zones"
import type { HqMember, HqOverview } from "@/features/hq/types"
import { useHq, useHqStore, selectZone } from "../store"
import { Character, SeatChair } from "./characters"
import { Block, Desk, GlassWall, Plant, Screen, ServerRack, Tile, cylinder, rounded } from "./kit"
import { HQ_HALF, PLOT_HALF, PLOT_HEIGHT, FLOOR_Y, PLOT_Y, SEATS, towardsCentre, zoneCenter, type Seat } from "./layout"
import { materials } from "./materials"
import { Prop } from "./props"
import { calendarTexture, campaignTexture, chartTexture, donutTexture, iconTexture, kanbanTexture, logoTexture, scoreTexture, type IconKind } from "./textures"

/** The character standing for a space when nobody of the team sits there: its "operator". */
const OPERATOR: Record<ZoneId, CharacterId> = {
  sources: "dev",
  qualification: "closer",
  coordination: "manager",
  outreach: "closer",
  pipeline: "manager",
  analytics: "dev",
  meetings: "community",
  campaigns: "community",
}

/** The Meshy models face +z; these turns put each one the right way round in the scene. */
const DESK_YAW = Math.PI
const TOWARDS_CAMERA = Math.PI / 4

/** A texture rebuilt only when its data key changes, and freed when replaced. */
function useCanvasTexture(make: () => THREE.Texture, key: string) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the data the picture depends on
  const texture = useMemo(() => make(), [key])
  useEffect(() => () => texture.dispose(), [texture])
  return texture
}

function clickHandler(onClick: () => void) {
  return (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return
    e.stopPropagation()
    onClick()
  }
}

/** Meshy desk (screen and keyboard on it), sized 1.5 m wide; the person sits on its -z side. */
function DeskProp({ position }: { position: [number, number, number] }) {
  return <Prop name="desk" fit={{ width: 1.5 }} position={position} rotation={DESK_YAW} fallback={<Desk />} />
}

function PlantProp({ position, height = 1.05 }: { position: [number, number, number]; height?: number }) {
  return <Prop name="plant" fit={{ height }} position={position} rotation={position[0] * 1.7} fallback={<Plant scale={height} />} />
}

/** The raised ivory floor of a space: clicking anything on it opens the space. */
function Plot({ id, children }: { id: ZoneId; children: React.ReactNode }) {
  const store = useHqStore()
  const selected = useHq((s) => s.selection?.kind === "zone" && s.selection.id === id)
  const [x, z] = zoneCenter(id)
  const m = materials()
  return (
    <group
      position={[x, 0, z]}
      onClick={clickHandler(() => selectZone(store, id))}
      onPointerOver={(e) => { e.stopPropagation(); store.set({ hovered: id }); document.body.style.cursor = "pointer" }}
      onPointerOut={() => { if (store.get().hovered === id) store.set({ hovered: null }); document.body.style.cursor = "" }}
    >
      <mesh geometry={rounded(PLOT_HALF * 2, PLOT_HEIGHT, PLOT_HALF * 2, 0.12)} material={m.ceramic} position={[0, FLOOR_Y + PLOT_HEIGHT / 2, 0]} receiveShadow castShadow />
      <mesh geometry={rounded(PLOT_HALF * 2 - 0.5, 0.012, PLOT_HALF * 2 - 0.5, 0.2)} material={selected ? m.selected : m.ivory} position={[0, PLOT_Y + 0.006, 0]} receiveShadow />
      {children}
    </group>
  )
}

/** People at their desks: members first, then the operator on the first seat if the space is empty. */
function People({ zone, desks = true }: { zone: ZoneId | "hq"; desks?: boolean }) {
  const store = useHqStore()
  const members = useHq((s) => s.overview.members)
  const selection = useHq((s) => s.selection)
  const hovered = useHq((s) => s.hovered)
  const reducedMotion = useHq((s) => s.reducedMotion)
  const here = members.filter((m) => m.station === zone)
  const showOperator = zone !== "hq" && here.length === 0
  return (
    <>
      {SEATS[zone].map((seat: Seat, i) => {
        const member: HqMember | undefined = here.find((m) => m.seat === i)
        const occupied = !!member || (showOperator && i === 0)
        const character = member ? member.character : zone !== "hq" ? OPERATOR[zone] : characterFor({ id: String(i), role: "SDR" })
        const standing = seat.pose === "stand"
        // A standing seat goes to someone who can talk standing; the others sit on a chair there.
        const seated = !standing || !["community", "manager"].includes(character)
        const desk = !standing && desks && (zone !== "hq" || occupied)
        return (
          <group key={i} position={[seat.x, PLOT_Y, seat.z]} rotation-y={seat.rot}>
            {desk && <DeskProp position={[0, 0, 0.66]} />}
            {/* An empty desk keeps its chair. */}
            {desk && !occupied && <SeatChair seat={0.48} />}
            {occupied && (
              <Character
                character={character}
                pose={member?.status === "meeting" || standing ? "talk" : "sit"}
                seated={seated}
                position={[0, 0.005, 0]}
                rotation={0}
                phase={i + (member ? member.id.length : 3)}
                status={member ? member.status : null}
                highlighted={member ? (selection?.kind === "member" && selection.id === member.id) || hovered === member.id : false}
                reducedMotion={reducedMotion}
                onSelect={member ? () => store.set({ selection: { kind: "member", id: member.id }, focus: zone === "hq" ? "hq" : (zone as ZoneId) }) : zone !== "hq" ? () => selectZone(store, zone as ZoneId) : () => store.set({ selection: { kind: "hq" }, focus: "hq" })}
                onHover={member ? (over) => store.set({ hovered: over ? member.id : null }) : undefined}
              />
            )}
          </group>
        )
      })}
    </>
  )
}

function SourcesProps({ s }: { s: HqOverview["signals"] }) {
  const busy = s.searchesRunning > 0
  const racks: [number, number, number][] = [[-3.2, -2.6, 0], [-2.1, -2.6, 0], [-1.0, -2.6, 0], [-3.3, -1.3, Math.PI / 2], [-3.3, -0.2, Math.PI / 2]]
  return (
    <>
      {racks.map(([x, z, r], i) => (
        <Prop key={i} name="rack" fit={{ height: 2.0 }} position={[x, PLOT_Y, z]} rotation={r} fallback={<ServerRack busy={busy} phase={i} />} />
      ))}
      <DataCore position={[1.3, PLOT_Y, -1.7]} active={busy} />
      <PlantProp position={[3.3, PLOT_Y, -3.2]} />
    </>
  )
}

/** A turning neon wireframe cube over an ivory plinth: data coming in (faster while a search runs). */
function DataCore({ position, active }: { position: [number, number, number]; active: boolean }) {
  const ref = useRef<THREE.Group>(null)
  const reducedMotion = useHq((s) => s.reducedMotion)
  const m = materials()
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(0.8, 0.8, 0.8)), [])
  useFrame((_, dt) => {
    if (ref.current && !reducedMotion) {
      ref.current.rotation.y += dt * (active ? 1.1 : 0.3)
      ref.current.rotation.x += dt * (active ? 0.4 : 0.1)
    }
  })
  return (
    <group position={position}>
      <mesh geometry={cylinder(0.32, 0.44, 0.9, 32)} material={m.ceramic} position={[0, 0.45, 0]} castShadow />
      <mesh geometry={cylinder(0.33, 0.33, 0.04, 32)} material={m.neon} position={[0, 0.92, 0]} />
      <group ref={ref} position={[0, 1.75, 0]}>
        <lineSegments geometry={edges}>
          <lineBasicMaterial color={m.neon.color} toneMapped={false} />
        </lineSegments>
        <mesh material={m.neon}>
          <icosahedronGeometry args={[0.16, 1]} />
        </mesh>
      </group>
    </group>
  )
}

function QualificationProps({ hot }: { hot: number }) {
  const dial = useCanvasTexture(() => scoreTexture(hot), String(hot))
  const m = materials()
  return (
    <>
      <mesh position={[-2.6, PLOT_Y + 1.7, -2.6]} rotation-y={Math.PI / 4}>
        <circleGeometry args={[0.8, 48]} />
        <meshBasicMaterial map={dial} toneMapped={false} />
      </mesh>
      <mesh position={[-2.6, PLOT_Y + 1.7, -2.6]} rotation-y={Math.PI / 4} material={m.neon}>
        <ringGeometry args={[0.8, 0.86, 64]} />
      </mesh>
      <mesh position={[-2.6, PLOT_Y + 0.45, -2.6]} geometry={cylinder(0.05, 0.05, 0.9)} material={m.ivory} />
      <PlantProp position={[-3.3, PLOT_Y, 3.1]} />
      <PlantProp position={[3.4, PLOT_Y, 3.2]} height={0.85} />
    </>
  )
}

function CoordinationProps({ weekly }: { weekly: number[] }) {
  const m = materials()
  const board = useCanvasTexture(() => chartTexture(weekly), weekly.join(","))
  return (
    <>
      {/* Meeting table (Meshy) with the team round it, and the board they look at. */}
      <Prop name="table" fit={{ height: 0.76 }} position={[0.1, PLOT_Y, 0.1]} rotation={Math.PI / 4} fallback={<Block size={[2.6, 0.08, 1.3]} position={[0, 0.74, 0]} material={m.ceramic} />} />
      <Screen width={2.4} height={1.4} texture={board} position={[-2.2, PLOT_Y + 1.55, -2.2]} rotation={Math.PI / 4} />
      <Block size={[0.12, 1.0, 0.12]} position={[-2.2, PLOT_Y + 0.5, -2.2]} material={m.ivory} />
      <PlantProp position={[3.2, PLOT_Y, -3.2]} />
    </>
  )
}

function OutreachProps({ channels }: { channels: Record<IconKind, boolean> }) {
  const tiles = useMemo(() => (["email", "linkedin", "phone", "whatsapp"] as IconKind[]).map((k) => ({ k, t: iconTexture(k, !channels[k]) })), [channels])
  useEffect(() => () => tiles.forEach(({ t }) => t.dispose()), [tiles])
  const group = useRef<THREE.Group>(null)
  const reducedMotion = useHq((s) => s.reducedMotion)
  useFrame(({ clock }) => {
    if (!group.current || reducedMotion) return
    group.current.children.forEach((c, i) => {
      c.position.y = 2.05 + Math.sin(clock.elapsedTime * 1.4 + i) * 0.08
    })
  })
  const m = materials()
  return (
    <>
      <group ref={group} position={[-0.4, PLOT_Y, -0.9]}>
        {tiles.map(({ k, t }, i) => <Tile key={k} texture={t} position={[-1.6 + i * 0.95 * Math.SQRT1_2, 2.05, 1.0 - i * 0.95 * Math.SQRT1_2]} size={0.72} />)}
      </group>
      <Block size={[3.6, 0.08, 0.5]} position={[-0.9, PLOT_Y + 1.2, -0.4]} material={m.ceramic} />
      <Block size={[3.4, 0.03, 0.04]} position={[-0.9, PLOT_Y + 1.16, -0.14]} material={m.neon} shadow={false} />
      <PlantProp position={[3.2, PLOT_Y, -3.1]} />
    </>
  )
}

function PipelineProps({ stages }: { stages: number[] }) {
  const board = useCanvasTexture(() => kanbanTexture(stages), stages.join(","))
  const m = materials()
  return (
    <>
      <Screen width={2.8} height={1.6} texture={board} position={[-1.6, PLOT_Y + 1.55, -2.4]} rotation={Math.PI / 4} />
      <Block size={[0.12, 0.9, 0.12]} position={[-1.6, PLOT_Y + 0.45, -2.4]} material={m.ivory} />
      <PlantProp position={[3.1, PLOT_Y, -2.9]} />
      <PlantProp position={[-3.3, PLOT_Y, 3.0]} height={0.85} />
    </>
  )
}

function AnalyticsProps({ weekly, conversion }: { weekly: number[]; conversion: number | null }) {
  const chart = useCanvasTexture(() => chartTexture(weekly), weekly.join(","))
  const donut = useCanvasTexture(() => donutTexture(conversion), String(conversion))
  const m = materials()
  return (
    <>
      <Screen width={2.6} height={1.5} texture={chart} position={[-1.5, PLOT_Y + 1.6, -1.5]} rotation={Math.PI / 4} />
      <Screen width={1.1} height={1.1} texture={donut} position={[0.9, PLOT_Y + 1.4, -2.9]} rotation={Math.PI / 4} />
      <Block size={[3.4, 0.7, 0.8]} position={[-0.8, PLOT_Y + 0.35, -1.6]} material={m.ceramic} />
      <Block size={[3.2, 0.03, 0.04]} position={[-0.8, PLOT_Y + 0.62, -1.18]} material={m.neon} shadow={false} />
      <PlantProp position={[3.2, PLOT_Y, 3.0]} />
    </>
  )
}

function MeetingsProps({ next7 }: { next7: number }) {
  const cal = useCanvasTexture(() => calendarTexture(next7), String(next7))
  const m = materials()
  return (
    <>
      {/* Reception counter (Meshy) facing the visitors, and the week planner behind it. */}
      <Prop name="reception" fit={{ height: 1.1 }} position={[0.9, PLOT_Y, 0.9]} rotation={TOWARDS_CAMERA} fallback={<Block size={[2.4, 1.0, 0.7]} position={[0, 0.5, 0]} material={m.ceramic} />} />
      <Screen width={1.6} height={1.6} texture={cal} position={[-2.0, PLOT_Y + 1.55, -2.0]} rotation={Math.PI / 4} />
      <Block size={[0.12, 0.8, 0.12]} position={[-2.0, PLOT_Y + 0.4, -2.0]} material={m.ivory} />
      {/* Waiting chairs. */}
      {[[-3.1, 1.0], [-3.1, 2.0]].map(([x, z], i) => (
        <group key={i} position={[x, PLOT_Y, z]} rotation-y={Math.PI / 2}>
          <SeatChair seat={0.46} />
        </group>
      ))}
      <PlantProp position={[3.3, PLOT_Y, -3.2]} />
    </>
  )
}

function CampaignsProps({ sizes }: { sizes: number[] }) {
  const wall = useCanvasTexture(() => campaignTexture(sizes), sizes.join(","))
  const m = materials()
  return (
    <>
      <Screen width={2.8} height={1.7} texture={wall} position={[-1.4, PLOT_Y + 1.65, -1.4]} rotation={Math.PI / 4} />
      <Block size={[0.12, 0.8, 0.12]} position={[-1.4, PLOT_Y + 0.4, -1.4]} material={m.ivory} />
      {/* A neon megaphone, the campaigns' sign. */}
      <group position={[2.4, PLOT_Y + 2.0, -2.4]} rotation={[0, Math.PI / 4, -0.4]}>
        <mesh material={m.ceramic} castShadow>
          <coneGeometry args={[0.38, 0.75, 32, 1, true]} />
        </mesh>
        <mesh material={m.neon} position={[0, -0.38, 0]} rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.38, 0.025, 10, 48]} />
        </mesh>
      </group>
      <PlantProp position={[-3.2, PLOT_Y, 3.1]} />
      <PlantProp position={[3.3, PLOT_Y, 3.3]} height={0.85} />
    </>
  )
}

/** The building's wall sign: the logo on a transparent background, a little in front of the wall, with a neon line. */
function WallSign({ position, rotation, width }: { position: [number, number, number]; rotation: number; width: number }) {
  const [logo, setLogo] = useState<{ map: THREE.Texture; aspect: number } | null>(null)
  const m = materials()
  useEffect(() => {
    let alive = true
    let t: THREE.Texture | null = null
    logoTexture().then((tex) => {
      t = tex
      const img = tex.image as HTMLCanvasElement
      if (alive) setLogo({ map: tex, aspect: img.height / img.width })
      else tex.dispose()
    }).catch(() => undefined)
    return () => {
      alive = false
      t?.dispose()
    }
  }, [])
  return (
    <group position={position} rotation-y={rotation}>
      {logo && (
        <mesh position={[0, 0, 0.03]} renderOrder={1}>
          <planeGeometry args={[width, width * logo.aspect]} />
          <meshStandardMaterial map={logo.map} transparent roughness={0.45} metalness={0} polygonOffset polygonOffsetFactor={-2} depthWrite={false} />
        </mesh>
      )}
      <mesh position={[0, -width * 0.16, 0.02]} material={m.neon}>
        <boxGeometry args={[width * 0.86, 0.03, 0.02]} />
      </mesh>
    </group>
  )
}

/** The lounge of the building: two Meshy sofas face to face round a low table. */
function Lounge() {
  const m = materials()
  return (
    <group position={[0.7, PLOT_Y, 0.5]} rotation-y={Math.PI / 4}>
      <mesh geometry={rounded(3.8, 0.02, 2.9, 0.4)} material={m.sand} position={[0, 0.01, 0]} receiveShadow />
      {/* The meeting table's design at coffee-table height. */}
      <Prop
        name="table"
        fit={{ height: 0.4 }}
        fallback={
          <>
            <Block size={[1.1, 0.34, 0.6]} position={[0, 0.17, 0]} material={m.ceramic} />
            <Block size={[1.0, 0.02, 0.5]} position={[0, 0.35, 0]} material={m.neonSoft} shadow={false} />
          </>
        }
      />
      {[-1, 1].map((side) => (
        <Prop
          key={side}
          name="sofa"
          fit={{ width: 2.2 }}
          position={[0, 0, side * 1.15]}
          rotation={side > 0 ? Math.PI : 0}
          fallback={<Block size={[2.2, 0.45, 0.8]} position={[0, 0.22, 0]} material={m.ceramic} radius={0.12} />}
        />
      ))}
    </group>
  )
}

/** The Cleads building in the middle: logo walls, glass on the near sides, the lounge. Clicking it gives the overview. */
function Headquarters() {
  const store = useHqStore()
  const selected = useHq((s) => s.selection?.kind === "hq")
  const m = materials()
  const h = HQ_HALF
  const wall = 2.7
  return (
    <group
      onClick={clickHandler(() => store.set({ selection: { kind: "hq" }, focus: "hq" }))}
      onPointerOver={(e) => { e.stopPropagation(); store.set({ hovered: "hq" }); document.body.style.cursor = "pointer" }}
      onPointerOut={() => { if (store.get().hovered === "hq") store.set({ hovered: null }); document.body.style.cursor = "" }}
    >
      <mesh geometry={rounded(h * 2, PLOT_HEIGHT, h * 2, 0.12)} material={m.ceramic} position={[0, FLOOR_Y + PLOT_HEIGHT / 2, 0]} receiveShadow />
      <mesh geometry={rounded(h * 2 - 0.6, 0.012, h * 2 - 0.6, 0.2)} material={selected ? m.selected : m.ivoryWarm} position={[0, PLOT_Y + 0.006, 0]} receiveShadow />
      {/* Solid walls on the far sides, each with its sign, set away from the glass so nothing hides it. */}
      <Block size={[h * 2, wall, 0.24]} position={[0, PLOT_Y + wall / 2, -h + 0.12]} material={m.ceramic} />
      <Block size={[0.24, wall, h * 2]} position={[-h + 0.12, PLOT_Y + wall / 2, 0]} material={m.ceramic} />
      <Block size={[h * 2 - 0.3, 0.05, 0.05]} position={[0.15, PLOT_Y + wall - 0.12, -h + 0.27]} material={m.neon} shadow={false} />
      <Block size={[0.05, 0.05, h * 2 - 0.3]} position={[-h + 0.27, PLOT_Y + wall - 0.12, 0.15]} material={m.neon} shadow={false} />
      <WallSign position={[-0.4, PLOT_Y + 1.55, -h + 0.24]} rotation={0} width={4.2} />
      <WallSign position={[-h + 0.24, PLOT_Y + 1.55, -0.4]} rotation={Math.PI / 2} width={4.2} />
      <GlassWall from={[h - 0.1, -h + 0.3]} to={[h - 0.1, -1.4]} y={PLOT_Y} height={2.2} />
      <GlassWall from={[h - 0.1, 1.4]} to={[h - 0.1, h - 0.3]} y={PLOT_Y} height={2.2} />
      <GlassWall from={[-h + 0.3, h - 0.1]} to={[-1.4, h - 0.1]} y={PLOT_Y} height={2.2} />
      <GlassWall from={[1.4, h - 0.1]} to={[h - 0.3, h - 0.1]} y={PLOT_Y} height={2.2} />
      {/* Warm ceiling strips that light up at night. */}
      {[-2.6, 0, 2.6].map((x) => <Block key={x} size={[1.6, 0.04, 0.12]} position={[x, PLOT_Y + wall - 0.35, -h + 0.32]} material={m.lamp} shadow={false} />)}
      <People zone="hq" />
      <Lounge />
      <PlantProp position={[3.9, PLOT_Y, -3.9]} height={1.3} />
      <PlantProp position={[-3.9, PLOT_Y, 3.9]} height={1.3} />
    </group>
  )
}

/** Every space, each fed with the live figures it shows. */
export function Zones() {
  const signals = useHq((s) => s.overview.signals)
  const conversion = useHq((s) => s.overview.conversion)
  const campaigns = useHq((s) => s.overview.campaigns)
  const weeklyLeads = useMemo(() => signals.weekly.map((w) => w.leads), [signals.weekly])
  const weeklyMeetings = useMemo(() => signals.weekly.map((w) => w.meetings), [signals.weekly])
  const open = useMemo(() => (["QUALIFIED", "MEETING_SET", "PROPOSAL", "NEGOTIATION"] as const).map((k) => signals.dealsByStage[k]), [signals.dealsByStage])
  const sizes = useMemo(() => campaigns.filter((c) => c.status === "ACTIVE").map((c) => c.leads), [campaigns])
  const channels = useMemo(() => ({ email: signals.mailboxesActive > 0, phone: true, linkedin: false, whatsapp: false }), [signals.mailboxesActive])
  const recent = useHq((s) => s.overview.recentLeads)
  const hot = useMemo(() => (recent.length ? recent.reduce((n, l) => n + l.score, 0) / recent.length : 0), [recent])

  const props: Record<ZoneId, React.ReactNode> = {
    sources: <SourcesProps s={signals} />,
    qualification: <QualificationProps hot={hot} />,
    coordination: <CoordinationProps weekly={weeklyMeetings} />,
    outreach: <OutreachProps channels={channels} />,
    pipeline: <PipelineProps stages={open} />,
    analytics: <AnalyticsProps weekly={weeklyLeads} conversion={conversion} />,
    meetings: <MeetingsProps next7={signals.meetingsNext7} />,
    campaigns: <CampaignsProps sizes={sizes} />,
  }
  return (
    <>
      {ZONES.map((z) => (
        <Plot key={z.id} id={z.id}>
          {props[z.id]}
          <People zone={z.id} desks={z.id !== "coordination"} />
          <DoorMarker id={z.id} />
        </Plot>
      ))}
      <Headquarters />
    </>
  )
}

/** A small neon light on the side of each space that faces the circuit. */
function DoorMarker({ id }: { id: ZoneId }) {
  const [dx, dz] = towardsCentre(id)
  const m = materials()
  const corner = Math.abs(dx) > 0.2 && Math.abs(dz) > 0.2
  const d = corner ? PLOT_HALF * Math.SQRT2 - 0.5 : PLOT_HALF - 0.25
  return <mesh geometry={cylinder(0.16, 0.16, 0.03, 32)} material={m.neon} position={[dx * d, PLOT_Y + 0.02, dz * d]} />
}
