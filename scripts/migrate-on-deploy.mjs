// Vercel build step (package.json "vercel-build"): the production deployment applies the migrations; a preview applies
// them only to its own database, once MIGRATE_PREVIEW_DATABASE=1 says the preview's DATABASE_URL is not production's.
// A pull request never changes the production database (docs/crm-v1/MIGRATION-VERCEL.md).
/* eslint-disable no-console */
import { execSync } from "node:child_process"

const env = process.env.VERCEL_ENV ?? "local"
if (env === "production" || (env === "preview" && process.env.MIGRATE_PREVIEW_DATABASE === "1")) {
  execSync("npx prisma migrate deploy", { stdio: "inherit" })
} else {
  console.log(`[migrate-on-deploy] ${env} : aucune migration appliquée.`)
}
