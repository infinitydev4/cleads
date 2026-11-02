// Bundles the AI worker into worker/dist (docs/crm-v1/WORKER-IA.md). Prisma stays external: the image generates its
// client for its own platform.
import { execSync } from "node:child_process"
import { build } from "esbuild"

const version = process.env.WORKER_VERSION || execSync("git rev-parse --short HEAD").toString().trim()

await build({
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
  external: ["@prisma/client", ".prisma/client"],
  define: { "process.env.WORKER_VERSION": JSON.stringify(version) },
  // Some bundled CommonJS dependencies call require() on Node built-ins.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  logLevel: "info",
})
