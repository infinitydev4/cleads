import http from "node:http"
import os from "node:os"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { registerTaskHandler } from "@/features/ai/handlers"
import { SKILL_TEST, runSkillTest } from "@/features/ai/skill-test"
import { AgentWorker, DEFAULT_PER_AGENT } from "./runner"
import { errorFields, log } from "./log"
// Agents register their handler here as their epic ships (E20 to E25): import "@/features/ai/agents/<agent>/handler".
registerTaskHandler(SKILL_TEST, (job) => runSkillTest(job))

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
