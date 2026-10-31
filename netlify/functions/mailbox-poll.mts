/** Every 5 minutes: asks the app to read replies and bounces in the prospecting mailboxes (docs/crm-v1/EMAILING.md). */
/* eslint-disable no-console */
const handler = async () => {
  const base = process.env.URL
  const secret = process.env.CRON_SECRET
  if (!base || !secret) {
    console.error("[mailbox-poll] URL or CRON_SECRET missing")
    return
  }
  const res = await fetch(`${base.replace(/\/$/, "")}/api/cron/mailbox-poll`, { method: "POST", headers: { authorization: `Bearer ${secret}` } })
  console.log("[mailbox-poll]", res.status, await res.text())
}

export default handler

export const config = { schedule: "*/5 * * * *" }
