/** Docker HEALTHCHECK: asks the worker's loopback endpoint whether its claim loop is alive. */
const port = process.env.WORKER_HEALTH_PORT ?? "8090"

try {
  const res = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(4_000) })
  process.exit(res.ok ? 0 : 1)
} catch {
  process.exit(1)
}

export {}
