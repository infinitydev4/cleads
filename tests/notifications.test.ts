// Live notifications: the bell listens where the server publishes. Pusher is a fake: nothing leaves the machine.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { listenToNotifications } from "@/hooks/useNotifications"
import { NOTIFICATION_EVENT, canSubscribe, userChannel, type NotificationEvent } from "@/lib/ai/realtime"

const trigger = vi.hoisted(() => vi.fn())
vi.mock("pusher", () => ({ default: class { trigger = trigger } }))

describe("the bell", () => {
  it("listens on the member's own channel, to the event the server publishes", () => {
    const bind = vi.fn((_event: string, _handler: (e: NotificationEvent) => void) => {})
    const subscribe = vi.fn((_channel: string) => ({ bind }))
    const onNote = vi.fn()
    listenToNotifications({ subscribe } as never, "u1", onNote)

    // A channel named after the email was refused by /api/pusher/auth (403 on every page).
    const [channel] = subscribe.mock.calls[0]
    expect(channel).toBe(userChannel("u1"))
    expect(canSubscribe("u1", channel)).toBe(true)
    const [event, handler] = bind.mock.calls[0]
    expect(event).toBe(NOTIFICATION_EVENT)
    handler({ id: "n1", type: "SYSTEM", title: "Maquette ouverte", message: "La maquette de Plomberie Martin vient d’être ouverte.", createdAt: "2026-11-02T21:00:00.000Z" })
    expect(onNote).toHaveBeenCalledWith({ id: "n1", type: "SYSTEM", title: "Maquette ouverte", message: "La maquette de Plomberie Martin vient d’être ouverte.", createdAt: "2026-11-02T21:00:00.000Z", read: false })
  })
})

describe("publishing notifications", () => {
  const note = { id: "n1", userId: "u1", type: "SYSTEM", title: "Budget IA épuisé", message: "Le plafond IA du mois est atteint.", createdAt: new Date("2026-11-02T21:00:00Z") }
  const SETTINGS = { NEXT_PUBLIC_PUSHER_APP_ID: "1", NEXT_PUBLIC_PUSHER_KEY: "key", PUSHER_SECRET: "secret", NEXT_PUBLIC_PUSHER_CLUSTER: "eu" }
  // The Pusher client is built once per process: each case starts from a fresh module.
  const load = async (withPusher: boolean) => {
    for (const [name, value] of Object.entries(SETTINGS)) vi.stubEnv(name, withPusher ? value : "")
    vi.resetModules()
    return import("@/lib/ai/realtime")
  }

  beforeEach(() => {
    trigger.mockReset()
    trigger.mockResolvedValue({})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("sends each one on its owner's channel, as the bell lists it", async () => {
    const { publishNotifications } = await load(true)
    await publishNotifications([note, { ...note, id: "n2", userId: "u2" }])
    const event = { type: "SYSTEM", title: "Budget IA épuisé", message: "Le plafond IA du mois est atteint.", createdAt: "2026-11-02T21:00:00.000Z" }
    expect(trigger.mock.calls).toEqual([
      [userChannel("u1"), NOTIFICATION_EVENT, { id: "n1", ...event }],
      [userChannel("u2"), NOTIFICATION_EVENT, { id: "n2", ...event }],
    ])
  })

  it("never throws, and sends nothing without Pusher or without notifications", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    trigger.mockRejectedValueOnce(new Error("Pusher indisponible"))
    await expect((await load(true)).publishNotifications([note])).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith("[NOTIFICATIONS_REALTIME]", "Pusher indisponible")

    trigger.mockClear()
    await (await load(true)).publishNotifications([])
    await (await load(false)).publishNotifications([note])
    expect(trigger).not.toHaveBeenCalled()
  })
})
