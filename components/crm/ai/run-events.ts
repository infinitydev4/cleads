"use client"

type Listener = (event: { id?: string; agentId?: string; status?: string }) => void

/**
 * Listens to the updates the worker announces on a member's private Pusher channel (lib/ai/realtime.ts): `onEvent`
 * gets each one, `onConnected` says when the subscription holds. Returns the function that stops listening. Without
 * the Pusher settings it does nothing, and the callers keep polling.
 */
function listen(userId: string, events: readonly string[], onEvent: Listener, onConnected?: () => void): () => void {
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER
  if (!key || !cluster) return () => undefined
  let cancelled = false
  let disconnect: (() => void) | null = null
  void import("pusher-js").then(({ default: Pusher }) => {
    if (cancelled) return
    const pusher = new Pusher(key, { cluster, channelAuthorization: { endpoint: "/api/pusher/auth", transport: "ajax" } })
    const channel = pusher.subscribe(`private-user-${userId}`)
    if (onConnected) channel.bind("pusher:subscription_succeeded", onConnected)
    for (const event of events) channel.bind(event, onEvent)
    disconnect = () => pusher.disconnect()
  })
  return () => {
    cancelled = true
    disconnect?.()
  }
}

/** AI runs (E18). */
export const listenToRuns = (userId: string, onRun: Listener, onConnected?: () => void) => listen(userId, ["ai-run"], onRun, onConnected)

/** Missions (E28), and the runs they hand work to. */
export const listenToMissions = (userId: string, onEvent: Listener, onConnected?: () => void) => listen(userId, ["ai-mission", "ai-run"], onEvent, onConnected)
