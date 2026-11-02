import { useState, useEffect } from "react"
import type PusherClient from "pusher-js"
import { useSession } from "next-auth/react"
import type { NotificationEvent } from "@/lib/ai/realtime"

export interface Notification {
  id: string
  type: string
  title: string
  message: string
  createdAt: string
  read: boolean
}

/**
 * Hands each new notification to `onNote`. The server publishes them on the member's private channel, named after
 * their id (lib/ai/realtime.ts), the only one /api/pusher/auth allows: a channel named after the email was refused
 * on every page and would never have received anything.
 */
export function listenToNotifications(pusher: Pick<PusherClient, "subscribe">, userId: string, onNote: (note: Notification) => void) {
  pusher.subscribe(`private-user-${userId}`).bind("notification", (event: NotificationEvent) => onNote({ ...event, read: false }))
}

export function useNotifications() {
  const { data: session } = useSession()
  const userId = session?.user?.id
  const [notifications, setNotifications] = useState<Notification[]>([])
  const unreadCount = notifications.filter((n) => !n.read).length

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    let disconnect: (() => void) | null = null
    // What came live on this subscription: the list fetched below may have been read just before they were written.
    const arrived = new Set<string>()

    // The list works without live updates: only those need the Pusher settings. Without them (or if Pusher fails to
    // start) the list stays and the page never breaks: every CRM page mounts this hook.
    void (async () => {
      try {
        const response = await fetch("/api/notifications")
        if (!response.ok) throw new Error("Erreur lors de la récupération des notifications")
        const listed: Notification[] = await response.json()
        if (cancelled) return
        setNotifications((shown) => [...shown.filter((n) => arrived.has(n.id) && !listed.some((l) => l.id === n.id)), ...listed])
      } catch (error) {
        console.error("Erreur:", error)
      }
    })()

    const key = process.env.NEXT_PUBLIC_PUSHER_KEY
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER
    if (key && cluster) {
      import("pusher-js")
        .then(({ default: Pusher }) => {
          if (cancelled) return
          const pusher = new Pusher(key, { cluster, channelAuthorization: { endpoint: "/api/pusher/auth", transport: "ajax" } })
          disconnect = () => pusher.disconnect()
          listenToNotifications(pusher, userId, (note) => {
            arrived.add(note.id)
            // The list already holds it when it was read after the row was written.
            setNotifications((shown) => (shown.some((n) => n.id === note.id) ? shown : [note, ...shown]))
          })
        })
        .catch((error) => console.error("[PUSHER]", error))
    }

    return () => {
      cancelled = true
      disconnect?.()
    }
  }, [userId])

  const markAsRead = async (notificationId: string) => {
    try {
      await fetch(`/api/notifications/${notificationId}/read`, {
        method: "PUT",
      })
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId ? { ...n, read: true } : n
        )
      )
    } catch (error) {
      console.error("Erreur:", error)
    }
  }

  const markAllAsRead = async () => {
    try {
      await fetch("/api/notifications/read-all", {
        method: "PUT",
      })
      setNotifications(prev =>
        prev.map(n => ({ ...n, read: true }))
      )
    } catch (error) {
      console.error("Erreur:", error)
    }
  }

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
  }
}
