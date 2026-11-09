// Scheduled tasks (Vercel Cron, GET): they need CRON_SECRET and work only with CRON_RUNNER=vercel. No database: every
// case stops before the task.
import { afterEach, describe, expect, it } from "vitest"
import * as mailbox from "@/app/api/cron/mailbox-poll/route"
import * as sequences from "@/app/api/cron/sequence-run/route"
import * as reminders from "@/app/api/cron/meeting-reminders/route"
import * as calls from "@/app/api/cron/calls-sync/route"

const call = (secret: string) => ({ headers: { authorization: `Bearer ${secret}` } })
const saved = { ...process.env }

describe.each([
  ["mailbox-poll", mailbox],
  ["sequence-run", sequences],
  ["meeting-reminders", reminders],
  ["calls-sync", calls],
])("/api/cron/%s", (path, route) => {
  const req = (secret = "s3cret") => new Request(`https://cleads.fr/api/cron/${path}`, call(secret))
  afterEach(() => {
    process.env = { ...saved }
  })

  it("refuses a wrong secret", async () => {
    process.env.CRON_SECRET = "s3cret"
    expect((await route.GET(req("nope"))).status).toBe(401)
  })

  it("waits for CRON_RUNNER=vercel before working", async () => {
    process.env.CRON_SECRET = "s3cret"
    delete process.env.CRON_RUNNER
    expect((await route.GET(req())).status).toBe(202)
  })

  it("answers GET only: Next.js returns 405 to the other methods", () => {
    expect(Object.keys(route).filter((name) => /^[A-Z]+$/.test(name))).toEqual(["GET"])
  })
})
