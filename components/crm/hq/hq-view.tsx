"use client"

import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import { ambienceAt } from "@/features/hq/ambience"
import { ZONES, zoneById } from "@/features/hq/zones"
import type { HqOverview } from "@/features/hq/types"
import type { PeriodDays } from "@/features/metrics/definitions"
import { api } from "@/app/(crm)/app/leads/api"
import { clearSelection, createHqStore, HqStoreContext, selectZone, useHq, type HqStore } from "./store"
import { AmbienceControl, FocusBar, PeriodControl, SceneControls, readAmbience } from "./hud/controls"
import { DetailPanel } from "./hud/detail-panel"
import { ModuleWindow, useWindowLinks } from "./hud/module-window"
import { CampaignsCard, Journey, KpiStrip } from "./hud/parts"
import { SceneLabels } from "./hud/scene-labels"

/** The 3D code is a separate download: the 2D CRM never loads three.js. */
const HqCanvas = dynamic(() => import("./scene/hq-canvas"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center">
      <p className="flex items-center gap-2 rounded-full bg-card/90 px-4 py-2 text-sm font-medium shadow-pop"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Construction du QG…</p>
    </div>
  ),
})

const REFRESH_MS = 60_000
const TOUR_MS = 7_000

function hasWebGL() {
  try {
    const c = document.createElement("canvas")
    return !!(c.getContext("webgl2") || c.getContext("webgl"))
  } catch {
    return false
  }
}

/** If the scene breaks (driver, memory), the HUD keeps working and says so. */
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error("[hq] the 3D scene stopped", error)
  }
  render() {
    return this.state.failed ? <NoScene reason="La scène 3D s’est arrêtée sur cet appareil." /> : this.props.children
  }
}

function NoScene({ reason }: { reason: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center p-6">
      <div className="max-w-sm rounded-2xl bg-card p-5 text-center shadow-pop">
        <p className="font-semibold">{reason}</p>
        <p className="mt-1 text-sm text-muted-foreground">Les chiffres et les panneaux restent disponibles ; la vue 2D contient tout le CRM.</p>
        <Link href="/app" data-hq-leave className="mt-3 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Vue 2D</Link>
      </div>
    </div>
  )
}

/** Keyboard: 1-8 spaces, ← → next / previous, Échap back, + − zoom, 0 whole site. */
function useShortcuts(store: HqStore) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return
      if (store.get().covered || document.querySelector("[role=dialog]")) return
      const s = store.get()
      const zone = ZONES.find((z) => z.key === e.key)
      if (zone) {
        selectZone(store, zone.id)
        return
      }
      const index = s.focus && s.focus !== "hq" ? ZONES.findIndex((z) => z.id === s.focus) : -1
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const next = ZONES[(index + (e.key === "ArrowRight" ? 1 : -1) + ZONES.length) % ZONES.length]
        selectZone(store, index === -1 && e.key === "ArrowLeft" ? ZONES[ZONES.length - 1].id : next.id)
        e.preventDefault()
      } else if (e.key === "Escape") {
        if (s.selection?.kind === "lead" || s.selection?.kind === "member") store.set({ selection: s.focus && s.focus !== "hq" ? { kind: "zone", id: s.focus } : null })
        else clearSelection(store)
      } else if (e.key === "+" || e.key === "=") store.set({ command: { kind: "zoomIn", at: Date.now() } })
      else if (e.key === "-") store.set({ command: { kind: "zoomOut", at: Date.now() } })
      else if (e.key === "0") {
        clearSelection(store)
        store.set({ command: { kind: "reset", at: Date.now() } })
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [store])
}

/** Says what the camera now frames, for screen readers. */
function Announcer() {
  const focus = useHq((s) => s.focus)
  const zones = useHq((s) => s.overview.zones)
  const text = !focus ? "Vue d’ensemble du QG." : focus === "hq" ? "Bâtiment central : l’équipe et les derniers prospects." : `${zoneById(focus)!.label}${zones[focus].badge ? ` : ${zones[focus].badge}` : ""}.`
  return <p className="sr-only" aria-live="polite">{text}</p>
}

/** The scene and its HUD, out of reach (focus, screen readers) while a window covers them. */
function Behind({ children }: { children: ReactNode }) {
  const covered = useHq((s) => s.covered)
  return <div className="absolute inset-0" inert={covered}>{children}</div>
}

function Scene({ store }: { store: HqStore }) {
  const [webgl, setWebgl] = useState<boolean | null>(null)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- WebGL can only be probed in the browser
  useEffect(() => setWebgl(hasWebGL()), [])
  const light = useHq((s) => s.light)
  return (
    <div className="absolute inset-0 transition-[background] duration-1000" style={{ background: `linear-gradient(180deg, ${light.backgroundTop} 0%, ${light.backgroundBottom} 100%)` }}>
      {webgl === false ? <NoScene reason="Votre navigateur n’affiche pas la 3D (WebGL indisponible)." /> : webgl && <SceneBoundary><HqCanvas store={store} /></SceneBoundary>}
    </div>
  )
}

export function HqView({ initial }: { initial: HqOverview }) {
  const store = useMemo(
    () =>
      createHqStore({
        overview: initial,
        days: initial.days,
        selection: null,
        focus: null,
        hovered: null,
        ambience: "auto",
        // Server and first browser render must agree: a fixed daylight, then the device's clock once mounted.
        light: ambienceAt(new Date(0), "day"),
        tour: false,
        reducedMotion: false,
        lowPower: false,
        covered: false,
        command: null,
      }),
    // The store lives as long as the page; later data arrives through refresh().
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )
  const loading = useRef(false)

  const refresh = useCallback(async (days?: PeriodDays) => {
    if (loading.current) return
    loading.current = true
    try {
      const d = days ?? store.get().days
      const overview = await api<HqOverview>(`/api/hq?days=${d}`)
      store.set({ overview, days: d })
    } catch {
      // A missed refresh is not worth an alert: the next one comes in a minute.
    } finally {
      loading.current = false
    }
  }, [store])

  // Browser-only settings: reduced motion, saved day / night choice, the clock.
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const ambience = readAmbience()
    store.set({ reducedMotion: media.matches, ambience, light: ambienceAt(new Date(), ambience) })
    const onMotion = () => store.set({ reducedMotion: media.matches })
    media.addEventListener("change", onMotion)
    const clock = setInterval(() => store.set((s) => ({ light: ambienceAt(new Date(), s.ambience) })), 60_000)
    const stop = store.subscribe(() => {
      const s = store.get()
      const next = ambienceAt(new Date(), s.ambience)
      if (next.night !== s.light.night || next.lightColor !== s.light.lightColor) store.set({ light: next })
    })
    return () => {
      media.removeEventListener("change", onMotion)
      clearInterval(clock)
      stop()
      // Leaving the view while hovering something must not leave a hand cursor on the 2D pages.
      document.body.style.cursor = ""
    }
  }, [store])

  // Fresh figures every minute while the tab is visible, and right away when it comes back.
  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && refresh()
    const id = setInterval(tick, REFRESH_MS)
    document.addEventListener("visibilitychange", tick)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [refresh])

  // Guided visit: the next space every few seconds, until a key, a click or "Quitter".
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    const sync = () => {
      const on = store.get().tour
      if (on && !timer) {
        timer = setInterval(() => {
          const s = store.get()
          const i = s.focus && s.focus !== "hq" ? ZONES.findIndex((z) => z.id === s.focus) : -1
          selectZone(store, ZONES[(i + 1) % ZONES.length].id)
        }, TOUR_MS)
      } else if (!on && timer) {
        clearInterval(timer)
        timer = null
      }
    }
    const stop = store.subscribe(sync)
    return () => {
      stop()
      if (timer) clearInterval(timer)
    }
  }, [store])

  useShortcuts(store)
  useWindowLinks()
  const onWindowClosed = useCallback(() => void refresh(), [refresh])

  return (
    <HqStoreContext.Provider value={store}>
      <div className="absolute inset-0 overflow-hidden">
        <h1 className="sr-only">Vue 3D du CRM</h1>
        <Behind>
          <Scene store={store} />
          <SceneLabels />
          <Announcer />
          {/* HUD: the container lets clicks through to the scene; each card takes them back. */}
          <div className="pointer-events-none absolute inset-0 flex flex-col gap-3 p-3 sm:p-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1"><KpiStrip /></div>
              <div className="hidden shrink-0 flex-col items-end gap-2 md:flex">
                <AmbienceControl />
                <PeriodControl onChange={(d) => { store.set({ days: d }); void refresh(d) }} />
              </div>
            </div>
            <div className="flex min-h-0 flex-1 gap-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex justify-center"><FocusBar /></div>
                <div className="mt-auto hidden flex-wrap items-end gap-3 lg:flex">
                  <div className="w-full max-w-[640px]"><Journey /></div>
                </div>
              </div>
              <div className="hidden shrink-0 flex-col gap-3 sm:flex">
                <SceneControls />
              </div>
              <div className="flex w-full max-w-[360px] shrink-0 flex-col gap-3 max-sm:absolute max-sm:inset-x-3 max-sm:bottom-3 max-sm:max-h-[48%] max-sm:max-w-none">
                <div className="min-h-0 flex-1"><DetailPanel onChanged={() => void refresh()} /></div>
                <div className="hidden xl:block"><CampaignsCard /></div>
              </div>
            </div>
          </div>
        </Behind>
        {/* Every CRM page the view opens: over the scene, in the same address (lib/crm/hq-window.ts). */}
        <Suspense><ModuleWindow onClosed={onWindowClosed} /></Suspense>
      </div>
    </HqStoreContext.Provider>
  )
}
