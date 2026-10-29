import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: { include: ["tests/**/*.test.ts", "**/*.test.ts"], exclude: ["node_modules/**", ".next/**"] },
})
