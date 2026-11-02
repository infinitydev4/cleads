"use client"

/**
 * Listens to the AI run updates the worker announces on a member's private Pusher channel (lib/ai/realtime.ts):
 * `onRun` gets each event, `onConnected` says when the subscription holds. Returns the function that stops listening.
 * Without the Pusher settings it does nothing, and the callers keep polling.
 */
export function listenToRuns(userId: string, onRun: (event: { id?: string; agentId?: string; status?: string }) => void, onConnected?: () => void): () => void {
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
    channel.bind("ai-run", onRun)
    disconnect = () => pusher.disconnect()
  })
  return () => {
    cancelled = true
    disconnect?.()
  }
}
