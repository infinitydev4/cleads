// Migration to Vercel: the scheduled tasks never run twice. Vercel Cron (GET) works only once CRON_RUNNER=vercel; on
// Vercel, a POST (Netlify's functions) does nothing. No database: every case stops before the task.
import { afterEach, describe, expect, it } from "vitest"
import * as mailbox from "@/app/api/cron/mailbox-poll/route"
import * as sequences from "@/app/api/cron/sequence-run/route"
import * as reminders from "@/app/api/cron/meeting-reminders/route"

const call = (secret: string) => ({ headers: { authorization: `Bearer ${secret}` } })
const saved = { ...process.env }

describe.each([
  ["mailbox-poll", mailbox],
  ["sequence-run", sequences],
  ["meeting-reminders", reminders],
])("/api/cron/%s", (path, route) => {
  const req = (method: string, secret = "s3cret") => new Request(`https://cleads.fr/api/cron/${path}`, { method, ...call(secret) })
  afterEach(() => {
    process.env = { ...saved }
  })

  it("refuses a wrong secret in GET and POST", async () => {
    process.env.CRON_SECRET = "s3cret"
    expect((await route.GET(req("GET", "nope"))).status).toBe(401)
    expect((await route.POST(req("POST", "nope"))).status).toBe(401)
  })

  it("waits for CRON_RUNNER=vercel before working in GET", async () => {
    process.env.CRON_SECRET = "s3cret"
    delete process.env.CRON_RUNNER
    expect((await route.GET(req("GET"))).status).toBe(202)
  })

  it("ignores a POST on Vercel", async () => {
    process.env.CRON_SECRET = "s3cret"
    process.env.VERCEL = "1"
    expect((await route.POST(req("POST"))).status).toBe(202)
  })
})
