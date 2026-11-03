"use client"

import { useCallback, useEffect, useState } from "react"
import type { MissionView } from "@/features/missions/labels"
import { listenToMissions } from "./run-events"

/** The mission as its card shows it; "missing" once the person may no longer see it. */
async function fetchMission(missionId: string): Promise<MissionView | "missing" | null> {
  try {
    const res = await fetch(`/api/ai/missions/${missionId}`)
    if (res.status === 404 || res.status === 403) return "missing"
    return res.ok ? ((await res.json()) as MissionView) : null
  } catch {
    // The next tick tries again.
    return null
  }
}

/**
 * Where a mission stands (E28), kept fresh: the worker announces each pass and each run of the mission on the
 * person's private channel; without Pusher, or while it connects, the card polls every 5 seconds while the mission runs.
 */
export function useMission(missionId: string, userId: string | null, initial: MissionView | null = null) {
  const [view, setView] = useState<MissionView | null>(initial)
  const [missing, setMissing] = useState(false)

  /** After the person acted on the card. */
  const reload = useCallback(async () => {
    const next = await fetchMission(missionId)
    if (next === "missing") setMissing(true)
    else if (next) setView(next)
  }, [missionId])

  const live = view ? view.status === "RUNNING" || view.status === "PROPOSED" : true
  const seeded = !!initial
  useEffect(() => {
    let cancelled = false
    let connected = false
    const load = async () => {
      const next = await fetchMission(missionId)
      if (cancelled) return
      if (next === "missing") setMissing(true)
      else if (next) setView(next)
    }
    if (!seeded) void load()
    // This mission's own news, or any run's (its steps hand work to specialists).
    const stop = userId ? listenToMissions(userId, (e) => (e?.id === missionId || e?.agentId ? void load() : undefined), () => (connected = true)) : () => undefined
    const poll = live ? setInterval(() => !connected && void load(), 5_000) : null
    return () => {
      cancelled = true
      stop()
      if (poll) clearInterval(poll)
    }
  }, [missionId, userId, live, seeded])

  return { view, setView, reload, missing }
}
