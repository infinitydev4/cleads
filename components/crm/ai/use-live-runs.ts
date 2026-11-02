"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { listenToRuns } from "./run-events"

/**
 * Keeps a page's AI runs fresh while some are in progress: the worker announces each change on the member's private
 * Pusher channel and the page reloads its data; without Pusher (or while it connects) the page polls every 10 seconds.
 */
export function useLiveRuns(userId: string, active: boolean) {
  const router = useRouter()

  useEffect(() => {
    if (!active) return
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    let connected = false
    const refresh = () => {
      if (refreshTimer) return
      refreshTimer = setTimeout(() => {
        refreshTimer = null
        router.refresh()
      }, 400)
    }

    const stop = listenToRuns(userId, refresh, () => (connected = true))
    const poll = setInterval(() => {
      if (!connected) router.refresh()
    }, 10_000)

    return () => {
      clearInterval(poll)
      if (refreshTimer) clearTimeout(refreshTimer)
      stop()
    }
  }, [active, userId, router])
}
