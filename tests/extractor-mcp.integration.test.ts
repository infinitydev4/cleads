// E18: agents reach Cleads Extractor over MCP, read-only. Runs against a REAL Extractor (mock source, in-memory store)
// and a disposable database:
//   TEST_DATABASE_URL=postgresql://... [EXTRACTOR_BIN=/path/to/cleads-extractor] npx vitest run tests/extractor-mcp.integration.test.ts
// Skipped when the extractor binary or the database is not available.
import { spawn, type ChildProcess } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { resetDatabase } from "./helpers/reset-db"

const url = process.env.TEST_DATABASE_URL
const bin = process.env.EXTRACTOR_BIN ?? path.resolve(__dirname, "../../cleads-extractor/bin/cleads-extractor")
const suite = url && existsSync(bin) ? describe : describe.skip

const PORT = 19000 + Math.floor(Math.random() * 1000)
const KEY = "crm-mcp-test-key-0123456789abcdef"
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

suite("Extractor over MCP for agents", () => {
  let proc: ChildProcess
  let prisma: typeof import("@/lib/prisma").prisma
  let runs: typeof import("@/features/ai/runs")
  let mcp: typeof import("@/features/ai/extractor-mcp")
  type U = import("@/lib/auth/guard").CurrentUser
  const u: Record<string, U> = {}
  const ws = "ws_default"

  beforeAll(async () => {
    proc = spawn(bin, [], {
      env: { ...process.env, APP_ENV: "development", PORT: String(PORT), API_KEYS: `crm:${KEY}`, ENABLE_MOCK_SOURCE: "true", ENABLE_GMAPS_SCRAPING: "false", ENABLE_OSM: "false", ENABLE_SIRENE: "false", ENRICH_ENABLED: "false", GEOCODER: "none", LOG_LEVEL: "error", DATABASE_URL: "" },
      stdio: "ignore",
    })
    const end = Date.now() + 30_000
    while (!(await fetch(`http://127.0.0.1:${PORT}/readyz`).then((r) => r.ok).catch(() => false))) {
      if (Date.now() > end) throw new Error("timeout waiting for the extractor")
      await sleep(300)
    }
    process.env.DATABASE_URL = url
    process.env.EXTRACTOR_URL = `http://127.0.0.1:${PORT}`
    process.env.EXTRACTOR_API_KEY = KEY
    delete process.env.EXTRACTOR_MCP_URL
    prisma = (await import("@/lib/prisma")).prisma
    runs = await import("@/features/ai/runs")
    mcp = await import("@/features/ai/extractor-mcp")
  }, 60_000)

  afterAll(async () => {
    proc?.kill()
    await prisma?.$disconnect()
  })

  beforeEach(async () => {
    await resetDatabase(prisma)
    for (const [key, role] of [["sdr", "SDR"], ["closer", "CLOSER"]] as const) {
      const x = await prisma.user.create({ data: { email: `${key}@mcp.test`, name: key, role, workspaceId: ws } })
      u[key] = { id: x.id, workspaceId: ws, name: key, email: x.email!, image: null, role }
    }
  })

  it("offers only the read-only tools of the allow list, and records each call", async () => {
    const ctx = await runs.startRun(u.sdr, { agentId: "strategist", status: "RUNNING" })
    const { tools, close } = await mcp.openExtractorTools({ run: ctx })
    try {
      const names = Object.keys(tools)
      expect(names).toContain("list_sectors")
      expect(names.every((n) => (mcp.EXTRACTOR_READ_TOOLS as readonly string[]).includes(n))).toBe(true)
      expect(names).not.toContain("create_extraction_job")
      expect(names).not.toContain("cancel_job")
      const out = await tools.list_sectors.execute!({}, { toolCallId: "t1", messages: [] } as never)
      expect(JSON.stringify(out)).toMatch(/plomb|restaurant|sector|secteur/i)
    } finally {
      await close()
    }
    const step = await prisma.agentStep.findFirstOrThrow({ where: { runId: ctx.id } })
    expect(step).toMatchObject({ type: "TOOL", name: "extractor.list_sectors" })
  })

  it("gives nothing to a person without the right to search, or to a scheduled run", async () => {
    const closer = await runs.startRun(u.closer, { agentId: "copilot", status: "RUNNING" })
    expect(Object.keys((await mcp.openExtractorTools({ run: closer })).tools)).toEqual([])
    const system = await runs.startSystemRun(ws, { agentId: "qualifier", status: "RUNNING" })
    expect(Object.keys((await mcp.openExtractorTools({ run: system })).tools)).toEqual([])
  })

  it("prefers the worker's local address when it is set", () => {
    process.env.EXTRACTOR_MCP_URL = "http://api:8080/mcp"
    expect(mcp.extractorMcpUrl()).toBe("http://api:8080/mcp")
    delete process.env.EXTRACTOR_MCP_URL
    expect(mcp.extractorMcpUrl()).toBe(`http://127.0.0.1:${PORT}/mcp`)
  })
})
