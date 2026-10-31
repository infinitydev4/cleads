/* eslint-disable no-console */
/** Every 5 minutes: asks the app to send the sequence steps that are due (docs/crm-v1/EMAILING.md). */
const handler = async () => {
  const base = process.env.URL
  const secret = process.env.CRON_SECRET
  if (!base || !secret) {
    console.error("[sequence-run] URL or CRON_SECRET missing")
    return
  }
  const res = await fetch(`${base.replace(/\/$/, "")}/api/cron/sequence-run`, { method: "POST", headers: { authorization: `Bearer ${secret}` } })
  console.log("[sequence-run]", res.status, await res.text())
}

export default handler

export const config = { schedule: "*/5 * * * *" }
