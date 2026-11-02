// Notifications from the contact form and the appointments (lib/notifications.ts). Needs a disposable PostgreSQL with
// the migrations applied (never your development database):
//   TEST_DATABASE_URL=postgresql://… npx vitest run tests/notifications.integration.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { publishNotifications } from "@/lib/ai/realtime"
import { resetDatabase } from "./helpers/reset-db"

// What would reach the bells live is recorded: Pusher itself is never set up in tests.
vi.mock("@/lib/ai/realtime", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/ai/realtime")>()), publishNotifications: vi.fn(async () => {}) }))

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

suite("notifications (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let lib: typeof import("@/lib/notifications")
  let userId: string

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    prisma = (await import("@/lib/prisma")).prisma
    lib = await import("@/lib/notifications")
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })
  beforeEach(async () => {
    await resetDatabase(prisma)
    userId = (await prisma.user.create({ data: { email: "owner@notifications.test", name: "owner", role: "OWNER", workspaceId: "ws_default" } })).id
    vi.mocked(publishNotifications).mockClear()
  })

  it("reach the bell live, unless the person turned push off", async () => {
    // No settings saved yet: the defaults apply, and push is on by default.
    const note = await lib.notifications.contactForm(userId, { name: "Jeanne Martin", email: "jeanne@example.test", subject: "Devis", message: "Bonjour" })
    expect(vi.mocked(publishNotifications)).toHaveBeenCalledWith([note])

    await prisma.notificationSettings.create({ data: { userId, push: false, email: false } })
    await lib.sendNotification({ userId, type: "system_update", title: "Mise à jour système", message: "Rien à faire." })
    expect(vi.mocked(publishNotifications)).toHaveBeenCalledTimes(1)
    expect(await prisma.notification.count({ where: { userId } })).toBe(2)
  })
})
