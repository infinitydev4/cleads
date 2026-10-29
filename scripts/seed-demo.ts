/**
 * Loads fictitious CRM data (companies, leads, deals, meetings) for development.
 *
 *   npm run db:seed-demo                # adds demo data for the first workspace
 *   npm run db:seed-demo -- --reset     # removes the demo data
 *
 * Refuses to touch a database that is not on this machine, unless --force is given.
 */
import { PrismaClient } from "@prisma/client"
import { resetDemo, seedDemo } from "../features/demo/seed"

async function main() {
  const args = process.argv.slice(2)
  const url = process.env.DATABASE_URL ?? ""
  const host = (() => {
    try {
      return new URL(url).hostname
    } catch {
      return ""
    }
  })()
  if (!["localhost", "127.0.0.1", "::1"].includes(host) && !args.includes("--force")) {
    throw new Error(`DATABASE_URL pointe vers « ${host || "?"} » : données de démonstration refusées hors de cette machine (--force pour passer outre).`)
  }
  const prisma = new PrismaClient()
  try {
    const workspace = await prisma.workspace.findFirstOrThrow({ orderBy: { createdAt: "asc" } })
    if (args.includes("--reset")) {
      console.log("Supprimé :", await resetDemo(prisma, workspace.id))
      return
    }
    const staff = await prisma.user.findMany({ where: { workspaceId: workspace.id, active: true, role: { in: ["OWNER", "MANAGER", "SDR", "CLOSER"] } }, select: { id: true, role: true } })
    console.log("Créé :", await seedDemo(prisma, { workspaceId: workspace.id, staff }))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error.message ?? error)
  process.exit(1)
})
