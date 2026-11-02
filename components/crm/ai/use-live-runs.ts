"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

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
    let disconnect: (() => void) | null = null
    let cancelled = false
    const refresh = () => {
      if (refreshTimer) return
      refreshTimer = setTimeout(() => {
        refreshTimer = null
        router.refresh()
      }, 400)
    }

    const key = process.env.NEXT_PUBLIC_PUSHER_KEY
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER
    if (key && cluster) {
      void import("pusher-js").then(({ default: Pusher }) => {
        if (cancelled) return
        const pusher = new Pusher(key, { cluster, channelAuthorization: { endpoint: "/api/pusher/auth", transport: "ajax" } })
        const channel = pusher.subscribe(`private-user-${userId}`)
        channel.bind("pusher:subscription_succeeded", () => (connected = true))
        channel.bind("ai-run", refresh)
        disconnect = () => pusher.disconnect()
      })
    }
    const poll = setInterval(() => {
      if (!connected) router.refresh()
    }, 10_000)

    return () => {
      cancelled = true
      clearInterval(poll)
      if (refreshTimer) clearTimeout(refreshTimer)
      disconnect?.()
    }
  }, [active, userId, router])
}
