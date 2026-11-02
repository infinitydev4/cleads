import Pusher from "pusher"
import type { Notification } from "@prisma/client"

/**
 * Live updates on a member's private channel. AI runs (E18): the worker tells the person a run acts for that it moved,
 * and the page reloads its figures. Notifications: the bell shows a new one at once. Without Pusher settings nothing is
 * sent: run pages fall back to polling, and the bell to the list it loads with the page.
 */
export const userChannel = (userId: string) => `private-user-${userId}`
export const RUN_EVENT = "ai-run"
export const NOTIFICATION_EVENT = "notification"

/** A member may only listen to their own private channel. */
export const canSubscribe = (userId: string, channelName: string) => channelName === userChannel(userId)

let client: Pusher | null | undefined

function pusherClient(): Pusher | null {
  if (client !== undefined) return client
  const appId = process.env.NEXT_PUBLIC_PUSHER_APP_ID
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY
  const secret = process.env.PUSHER_SECRET
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER
  client = appId && key && secret && cluster ? new Pusher({ appId, key, secret, cluster, useTLS: true }) : null
  return client
}

export interface RunUpdate {
  id: string
  agentId: string
  status: string
  requestedById: string | null
  leadId: string | null
}

/** Never throws: a live update that fails only delays the page's next refresh. */
export async function publishRunUpdate(run: RunUpdate): Promise<void> {
  const pusher = pusherClient()
  if (!pusher || !run.requestedById) return
  try {
    await pusher.trigger(userChannel(run.requestedById), RUN_EVENT, { id: run.id, agentId: run.agentId, status: run.status, leadId: run.leadId })
  } catch (error) {
    console.warn("[AI_REALTIME]", error instanceof Error ? error.message : error)
  }
}

/** A new notification as the bell lists it, without extra data: Pusher refuses events over 10 KB. */
export interface NotificationEvent {
  id: string
  type: string
  title: string
  message: string
  createdAt: string
}

/**
 * Puts new notifications in their owners' bells without a reload. Call it once the rows are committed, so that a bell
 * never shows one that was rolled back. Never throws: a notification missed live is still listed at the next page load.
 */
export async function publishNotifications(notes: Pick<Notification, "id" | "userId" | "type" | "title" | "message" | "createdAt">[]): Promise<void> {
  const pusher = pusherClient()
  if (!pusher || !notes.length) return
  try {
    await Promise.all(
      notes.map((n) => {
        const event: NotificationEvent = { id: n.id, type: n.type, title: n.title, message: n.message, createdAt: n.createdAt.toISOString() }
        return pusher.trigger(userChannel(n.userId), NOTIFICATION_EVENT, event)
      })
    )
  } catch (error) {
    console.warn("[NOTIFICATIONS_REALTIME]", error instanceof Error ? error.message : error)
  }
}
