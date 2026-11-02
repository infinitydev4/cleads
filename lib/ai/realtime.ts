import Pusher from "pusher"

/**
 * Live updates of AI runs (E18). The worker tells the person a run acts for that it moved, on their private channel;
 * the page then reloads its figures. Without Pusher settings nothing is sent and pages fall back to polling.
 */
export const userChannel = (userId: string) => `private-user-${userId}`
export const RUN_EVENT = "ai-run"

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
