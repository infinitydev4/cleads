/**
 * Copies the old back-office data (clients, appointments, availability) into the CRM model.
 *
 *   npm run db:backfill-legacy                      # dry run: shows what would happen, writes nothing
 *   npm run db:backfill-legacy -- --apply           # does it (one transaction, all or nothing)
 *   options: --host-email=a@b.fr  --timezone=Europe/Paris
 *
 * Safe to run again: only missing records are created. Nothing in the old tables is changed.
 */
import { PrismaClient } from "@prisma/client"
import { runBackfill } from "../features/legacy/backfill"

async function main() {
  const args = process.argv.slice(2)
  const arg = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=")
  const prisma = new PrismaClient()
  try {
    const report = await runBackfill(prisma, { apply: args.includes("--apply"), hostEmail: arg("host-email"), legacyTimezone: arg("timezone") })
    console.log(JSON.stringify(report, null, 2))
    console.log(
      report.ok
        ? report.applied
          ? "\nTerminé : données copiées."
          : "\nSimulation terminée : rien n'a été écrit. Ajoutez --apply pour copier."
        : "\nVérifications en échec : rien n'a été écrit."
    )
    process.exitCode = report.ok ? 0 : 1
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
