"use client"

import { createContext, useContext, useSyncExternalStore } from "react"
import { isAgentId, type AgentId } from "@/features/ai/agents"
import type { Ambience, AmbienceMode } from "@/features/hq/ambience"
import type { HqOverview } from "@/features/hq/types"
import type { ZoneId } from "@/features/hq/zones"
import type { PeriodDays } from "@/features/metrics/definitions"

/**
 * State shared by the 3D scene and its HUD. A tiny external store rather than a library: React reads it with
 * useSyncExternalStore, the Canvas (another React root) gets it through the context bridge of React Three Fiber.
 */
export type Selection = { kind: "zone"; id: ZoneId } | { kind: "member"; id: string } | { kind: "lead"; id: string } | { kind: "agent"; id: AgentId } | { kind: "hq" } | null
export type CameraCommand = "zoomIn" | "zoomOut" | "rotateLeft" | "rotateRight" | "reset"

export interface HqState {
  overview: HqOverview
  days: PeriodDays
  selection: Selection
  /** What the camera frames: a space, the central building, or the whole platform (null). */
  focus: ZoneId | "hq" | null
  hovered: string | null
  ambience: AmbienceMode
  /** Lights and sky for the current minute and mode (features/hq/ambience.ts). */
  light: Ambience
  /** Visit every space in turn (← → to move, Échap to leave). */
  tour: boolean
  reducedMotion: boolean
  /** Lower quality: fewer pixels, no shadows. Set once by the quality guard when the device cannot keep up, or by hand. */
  lowPower: boolean
  /** A CRM page is open in a window over the scene (hud/module-window.tsx): the scene rests, its keys and HUD are off. */
  covered: boolean
  /** Bumped on each camera button press; the rig acts on the change. */
  command: { kind: CameraCommand; at: number } | null
}

export function createHqStore(initial: HqState) {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    /** DOM labels the scene positions every frame (not state: they move 60 times a second). */
    labels: new Map<string, HTMLElement>(),
    get: () => state,
    set(patch: Partial<HqState> | ((s: HqState) => Partial<HqState>)) {
      const next = typeof patch === "function" ? patch(state) : patch
      state = { ...state, ...next }
      listeners.forEach((l) => l())
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
export type HqStore = ReturnType<typeof createHqStore>

export const HqStoreContext = createContext<HqStore | null>(null)

export function useHqStore(): HqStore {
  const store = useContext(HqStoreContext)
  if (!store) throw new Error("useHqStore outside HqStoreContext")
  return store
}

/** `useHq((s) => s.selection)`: re-renders when that value changes. Selectors must return stored values, not new objects. */
export function useHq<T>(selector: (s: HqState) => T): T {
  const store = useHqStore()
  return useSyncExternalStore(store.subscribe, () => selector(store.get()), () => selector(store.get()))
}

/** Common moves, so the scene and the HUD behave the same way. */
export function selectZone(store: HqStore, id: ZoneId) {
  store.set({ selection: { kind: "zone", id }, focus: id })
}
export function clearSelection(store: HqStore) {
  store.set({ selection: null, focus: null, tour: false })
}
/** The agent under the pointer or selected (E26): hovered agents are keyed "agent:<id>". */
export function shownAgent(s: HqState): AgentId | null {
  const id = s.selection?.kind === "agent" ? s.selection.id : s.hovered?.startsWith("agent:") ? s.hovered.slice(6) : null
  return id && isAgentId(id) ? id : null
}

/** An agent of the AI wing (E26): the camera frames its space, the panel shows the agent. */
export function selectAgent(store: HqStore, id: AgentId, zone: ZoneId) {
  store.set({ selection: { kind: "agent", id }, focus: zone, tour: false })
}
