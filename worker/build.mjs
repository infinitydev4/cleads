// Bundles the AI worker into worker/dist (docs/crm-v1/WORKER-IA.md). Prisma stays external: the image generates its
// client for its own platform. Playwright and axe-core too (E23): the image installs them, with Chromium.
import { execSync } from "node:child_process"
import { build } from "esbuild"

const version = process.env.WORKER_VERSION || execSync("git rev-parse --short HEAD").toString().trim()

const result = await build({
  entryPoints: { main: "worker/main.ts", healthcheck: "worker/healthcheck.ts" },
  outdir: "worker/dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  legalComments: "none",
  tsconfig: "tsconfig.json",
  external: ["@prisma/client", ".prisma/client", "playwright-core", "axe-core"],
  define: { "process.env.WORKER_VERSION": JSON.stringify(version) },
  // Some bundled CommonJS dependencies call require() on Node built-ins.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  logLevel: "info",
  metafile: true,
})

// The worker runs without Next: bundled, next/server crashes the worker at startup (3 November 2026). A service the
// worker loads must not import the request helpers of lib/auth/guard.ts (lib/auth/errors.ts holds AuthError).
const inputs = result.metafile.inputs
const isNext = (file) => /^node_modules\/next(-auth)?\//.test(file)
const culprits = Object.entries(inputs).filter(([file, info]) => !isNext(file) && info.imports.some((i) => isNext(i.path)))
if (culprits.length) {
  // The way in, from the entry: the import to cut is usually the first service that reaches lib/auth/guard.ts.
  const parent = new Map([["worker/main.ts", null]])
  const queue = ["worker/main.ts"]
  while (queue.length) {
    const file = queue.shift()
    for (const i of inputs[file]?.imports ?? []) {
      if (i.external || parent.has(i.path)) continue
      parent.set(i.path, file)
      queue.push(i.path)
    }
  }
  const chain = (file) => (file ? [...chain(parent.get(file)), file] : [])
  console.error(`Le worker ne doit pas charger Next :\n${culprits.map(([file]) => `- ${chain(file).join(" → ")}`).join("\n")}`)
  process.exit(1)
}
