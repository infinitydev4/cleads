import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    // The database suites share one disposable database: run files one after another.
    fileParallelism: false,
    include: ["tests/**/*.test.ts", "**/*.test.ts"], exclude: ["node_modules/**", ".next/**"] },
})
