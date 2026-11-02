"use client"

import { useEffect, useState } from "react"
import type { AgentRunStatus } from "@prisma/client"
import { ACTIVE_STATUSES } from "@/features/ai/labels"
import type { RunStatusView } from "@/features/ai/runs"

/**
 * Where a run the copilot handed to a specialist stands (E24). The worker announces each change on the person's private
 * Pusher channel; without Pusher, or while it connects, the card polls every 5 seconds until the run ends.
 */
export function useRunStatus(runId: string | null, userId: string | null): RunStatusView | null {
  const [view, setView] = useState<RunStatusView | null>(null)

  useEffect(() => {
    if (!runId) return
    let cancelled = false
    let connected = false
    let disconnect: (() => void) | null = null
    const active = (status: AgentRunStatus | undefined) => !status || ACTIVE_STATUSES.includes(status)

    const load = async () => {
      try {
        const res = await fetch(`/api/ai/runs/${runId}?view=status`)
        if (!res.ok) return
        const next = (await res.json()) as RunStatusView
        if (!cancelled) setView(next)
        if (!active(next.status)) stop()
      } catch {
        // The next tick tries again.
      }
    }
    const poll = setInterval(() => {
      if (!connected) void load()
    }, 5_000)
    const stop = () => {
      clearInterval(poll)
      disconnect?.()
      disconnect = null
    }

    void load()
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER
    if (key && cluster && userId) {
      void import("pusher-js").then(({ default: Pusher }) => {
        if (cancelled) return
        const pusher = new Pusher(key, { cluster, channelAuthorization: { endpoint: "/api/pusher/auth", transport: "ajax" } })
        const channel = pusher.subscribe(`private-user-${userId}`)
        channel.bind("pusher:subscription_succeeded", () => (connected = true))
        channel.bind("ai-run", (e: { id?: string }) => {
          if (e?.id === runId) void load()
        })
        disconnect = () => pusher.disconnect()
      })
    }
    return () => {
      cancelled = true
      stop()
    }
  }, [runId, userId])

  return view
}
