import http from "node:http"
import os from "node:os"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { registerAgentHandler, registerTaskHandler } from "@/features/ai/handlers"
import { SKILL_TEST, runSkillTest } from "@/features/ai/skill-test"
import { runWriter } from "@/features/email-draft/handler"
import { runOfferPitch } from "@/features/offer-pitch/handler"
import { runReplyTriage } from "@/features/reply-triage/handler"
import { runAudit } from "@/features/prospect-audit/handler"
import { runDesigner } from "@/features/studio/handler"
import { runStrategist } from "@/features/strategy/handler"
import { runQualifier } from "@/features/relevance/handler"
import { EVALUATION, runEvaluation } from "@/features/quality/run"
import { MISSION_ACTION, registerMissionTools, runMissionAction } from "@/features/missions/task"
import { browserRenderer } from "./browser"
import { AgentWorker, DEFAULT_PER_AGENT } from "./runner"
import { errorFields, log } from "./log"
// Agents register their handler here as their epic ships (E20 to E25).
registerAgentHandler("auditor", (job) => runAudit(job))
registerAgentHandler("offers", (job) => runOfferPitch(job))
registerAgentHandler("writer", (job) => runWriter(job))
registerAgentHandler("replies", (job) => runReplyTriage(job))
// E23: the Designer web renders its pages in the image's Chromium (worker/browser.ts).
const renderer = browserRenderer()
registerAgentHandler("designer", (job) => runDesigner(job, { renderer }))
registerAgentHandler("strategist", (job) => runStrategist(job))
registerAgentHandler("qualifier", (job) => runQualifier(job))
registerTaskHandler(SKILL_TEST, (job) => runSkillTest(job))
// E27: evaluations measure any agent, its pages rendered in the same browser as the Studio's.
registerTaskHandler(EVALUATION, (job) => runEvaluation(job, { renderer }))
// E28: missions advance in this worker; their contact actions run here once a person approved them.
registerMissionTools()
registerTaskHandler(MISSION_ACTION, (job) => runMissionAction(job))

/** Entry point of the AI worker container (docs/crm-v1/WORKER-IA.md). */
const env = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL manquant"),
    WORKER_ID: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "WORKER_ID : minuscules, chiffres et tirets")
      .default(os.hostname().toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40)),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(3),
    WORKER_HEALTH_PORT: z.coerce.number().int().min(1024).max(65535).default(8090),
  })
  .parse(process.env)

const worker = new AgentWorker({
  id: env.WORKER_ID,
  version: process.env.WORKER_VERSION ?? "dev",
  concurrency: env.WORKER_CONCURRENCY,
  perAgent: DEFAULT_PER_AGENT,
  pollIdleMs: 3_000,
  pollBusyMs: 500,
  maintenanceMs: 30_000,
  beatMs: 15_000,
  missionConcurrency: 2,
  // E30: watches of the BODACC, the morning sweep and the annuaire lookups.
  signalsEveryMs: 60_000,
})

try {
  await prisma.$queryRaw`SELECT 1`
} catch (error) {
  log("error", "database unreachable", errorFields(error))
  process.exit(1)
}

worker.start()
log("info", "worker started", { id: env.WORKER_ID, version: worker.health().version, concurrency: env.WORKER_CONCURRENCY })

// Loopback only: the container's health check and nothing else.
const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    const health = worker.health()
    res.writeHead(health.ok ? 200 : 503, { "content-type": "application/json" })
    res.end(JSON.stringify(health))
    return
  }
  res.writeHead(404).end()
})
server.listen(env.WORKER_HEALTH_PORT, "127.0.0.1")

let stopping = false
async function shutdown(signal: string) {
  if (stopping) return
  stopping = true
  log("info", "shutting down", { signal, running: worker.size })
  server.close()
  await worker.stop(25_000)
  await prisma.$disconnect()
  process.exit(0)
}
process.on("SIGTERM", () => void shutdown("SIGTERM"))
process.on("SIGINT", () => void shutdown("SIGINT"))
process.on("unhandledRejection", (error) => log("error", "unhandled rejection", errorFields(error)))
