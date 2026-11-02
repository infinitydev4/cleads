import { randomUUID } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { LeadError } from "@/features/leads/errors"
import { parseRoleModels, type RoleModels } from "./models"
import { utc } from "./sql"
import type { TokenUsage } from "./pricing"
import { publishNotifications } from "./realtime"

/**
 * AI spending caps (D22, docs/crm-v1/AGENTS-IA.md §6). A run holds its own cap while it is active; the month's commitment
 * is what was recorded (AiUsage) plus what active runs still hold, so the caps hold whatever runs in parallel.
 * Amounts are micro-euros.
 */
export const BUDGET_DEFAULTS = { monthlyCapMicros: 100_000_000, userDailyCapMicros: 5_000_000, eurPerUsd: 0.92 } as const
export const ALERT_THRESHOLDS = [50, 80, 100] as const
export const ACTIVE_RUN_STATUSES = ["QUEUED", "RUNNING", "WAITING_APPROVAL"] as const
/** Usage key of runs nobody asked for (scheduled work): no personal quota. */
export const SYSTEM_USER = "system"

type Db = Prisma.TransactionClient | typeof prisma

export interface AiSettings {
  monthlyCapMicros: number
  userDailyCapMicros: number
  eurPerUsd: number
  roleModels: RoleModels
}

const toSettings = (row: { monthlyCapMicros: number; userDailyCapMicros: number; eurPerUsd: number; roleModels: unknown } | null | undefined): AiSettings => ({
  monthlyCapMicros: row?.monthlyCapMicros ?? BUDGET_DEFAULTS.monthlyCapMicros,
  userDailyCapMicros: row?.userDailyCapMicros ?? BUDGET_DEFAULTS.userDailyCapMicros,
  eurPerUsd: row?.eurPerUsd ?? BUDGET_DEFAULTS.eurPerUsd,
  roleModels: parseRoleModels(row?.roleModels),
})

/** The workspace's settings, or the defaults while nothing was saved. */
export async function getAiSettings(workspaceId: string, db: Db = prisma): Promise<AiSettings> {
  return toSettings(await db.aiSetting.findUnique({ where: { workspaceId } }))
}

export const monthStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
export const dayStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
export const monthKey = (now: Date) => now.toISOString().slice(0, 7)

export const microsToEur = (micros: number) => micros / 1_000_000
export const eurToMicros = (eur: number) => Math.round(eur * 1_000_000)
const eur = (micros: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Math.max(micros, 0) / 1_000_000)

export interface Commitments {
  /** Recorded this month, workspace-wide. */
  monthSpent: number
  /** Still held by active runs, workspace-wide. */
  monthHeld: number
  /** Recorded today for this person. */
  userSpentToday: number
  /** Still held by this person's active runs. */
  userHeld: number
}

export async function commitments(db: Db, workspaceId: string, userKey: string, now = new Date()): Promise<Commitments> {
  const personal = userKey !== SYSTEM_USER
  const [month, held, today, userHeld] = await Promise.all([
    db.aiUsage.aggregate({ where: { workspaceId, day: { gte: monthStart(now) } }, _sum: { costMicros: true } }),
    db.agentRun.aggregate({ where: { workspaceId, status: { in: [...ACTIVE_RUN_STATUSES] } }, _sum: { reservedMicros: true } }),
    personal ? db.aiUsage.aggregate({ where: { workspaceId, userKey, day: dayStart(now) }, _sum: { costMicros: true } }) : null,
    personal ? db.agentRun.aggregate({ where: { workspaceId, requestedById: userKey, status: { in: [...ACTIVE_RUN_STATUSES] } }, _sum: { reservedMicros: true } }) : null,
  ])
  return {
    monthSpent: month._sum.costMicros ?? 0,
    monthHeld: held._sum.reservedMicros ?? 0,
    userSpentToday: today?._sum.costMicros ?? 0,
    userHeld: userHeld?._sum.reservedMicros ?? 0,
  }
}

/** Creates the workspace's settings row with the defaults if it does not exist yet; safe when called concurrently. */
export async function ensureAiSetting(db: Db, workspaceId: string): Promise<void> {
  await db.$executeRaw`INSERT INTO "AiSetting" ("id", "workspaceId", "updatedAt") VALUES (${randomUUID()}, ${workspaceId}, ${utc(new Date())}) ON CONFLICT ("workspaceId") DO NOTHING`
}

/**
 * Checks that a new run can hold `capMicros`, or refuses with the reason. Call it inside the transaction that creates
 * the run: it locks the workspace's AiSetting row first, so concurrent starts are counted one after the other.
 */
export async function reserveBudget(tx: Prisma.TransactionClient, input: { workspaceId: string; userKey: string; capMicros: number; now?: Date }): Promise<AiSettings> {
  const now = input.now ?? new Date()
  await ensureAiSetting(tx, input.workspaceId)
  const [row] = await tx.$queryRaw<{ monthlyCapMicros: number; userDailyCapMicros: number; eurPerUsd: number; roleModels: unknown }[]>`
    SELECT "monthlyCapMicros", "userDailyCapMicros", "eurPerUsd", "roleModels" FROM "AiSetting" WHERE "workspaceId" = ${input.workspaceId} FOR UPDATE`
  const settings = toSettings(row)
  const c = await commitments(tx, input.workspaceId, input.userKey, now)

  const monthLeft = settings.monthlyCapMicros - c.monthSpent - c.monthHeld
  if (input.capMicros > monthLeft) {
    throw new LeadError(
      "budget_exceeded",
      `Le budget IA du mois ne suffit plus : il reste ${eur(monthLeft)} sur ${eur(settings.monthlyCapMicros)}, cette action peut coûter jusqu'à ${eur(input.capMicros)}. Le propriétaire peut relever le plafond dans Réglages › IA.`,
      429,
      { scope: "month", remainingMicros: Math.max(monthLeft, 0) }
    )
  }
  if (input.userKey !== SYSTEM_USER) {
    const dayLeft = settings.userDailyCapMicros - c.userSpentToday - c.userHeld
    if (input.capMicros > dayLeft) {
      throw new LeadError(
        "budget_exceeded",
        `Votre quota IA du jour est atteint : il reste ${eur(dayLeft)} sur ${eur(settings.userDailyCapMicros)}, cette action peut coûter jusqu'à ${eur(input.capMicros)}. Il se renouvelle demain.`,
        429,
        { scope: "day", remainingMicros: Math.max(dayLeft, 0) }
      )
    }
  }
  return settings
}

/**
 * Records a cost against a run in one statement: adds it to the cost, takes it from the hold, and returns the new
 * step's index, so parallel steps never share an index.
 */
export async function chargeRun(db: Db, runId: string, micros: number): Promise<{ index: number; costMicros: number; capMicros: number }> {
  const [row] = await db.$queryRaw<{ stepCount: number; costMicros: number; capMicros: number }[]>`
    UPDATE "AgentRun"
       SET "costMicros" = "costMicros" + ${micros}, "reservedMicros" = GREATEST("reservedMicros" - ${micros}, 0), "stepCount" = "stepCount" + 1, "updatedAt" = ${utc(new Date())}
     WHERE "id" = ${runId}
 RETURNING "stepCount", "costMicros", "capMicros"`
  if (!row) throw new LeadError("not_found", "Exécution introuvable", 404)
  return { index: row.stepCount, costMicros: row.costMicros, capMicros: row.capMicros }
}

/** Adds one call to the day's usage row, in one statement. */
export async function addUsage(
  db: Db,
  input: { workspaceId: string; userKey: string; agentId: string; model: string; usage: TokenUsage; micros: number; now?: Date }
): Promise<void> {
  const day = dayStart(input.now ?? new Date())
  const u = input.usage
  await db.$executeRaw`
    INSERT INTO "AiUsage" ("id", "workspaceId", "day", "userKey", "agentId", "model", "calls", "inputTokens", "outputTokens", "cachedInputTokens", "costMicros")
    VALUES (${randomUUID()}, ${input.workspaceId}, ${utc(day)}::date, ${input.userKey}, ${input.agentId}, ${input.model}, 1, ${u.inputTokens}, ${u.outputTokens}, ${u.cacheReadTokens}, ${input.micros})
    ON CONFLICT ("workspaceId", "day", "userKey", "agentId", "model") DO UPDATE SET
      "calls" = "AiUsage"."calls" + 1,
      "inputTokens" = "AiUsage"."inputTokens" + EXCLUDED."inputTokens",
      "outputTokens" = "AiUsage"."outputTokens" + EXCLUDED."outputTokens",
      "cachedInputTokens" = "AiUsage"."cachedInputTokens" + EXCLUDED."cachedInputTokens",
      "costMicros" = "AiUsage"."costMicros" + EXCLUDED."costMicros"`
}

const sentAlerts = (alerts: unknown, key: string): number[] => {
  const list = alerts && typeof alerts === "object" && !Array.isArray(alerts) ? (alerts as Record<string, unknown>)[key] : null
  return Array.isArray(list) ? list.filter((n): n is number => typeof n === "number") : []
}

/**
 * Tells the owners, once per month and per threshold, when recorded spend crosses 50, 80 and 100 % of the cap.
 * Returns the thresholds notified now. A failure never breaks the call that triggered it.
 */
export async function checkBudgetAlerts(workspaceId: string, now = new Date()): Promise<number[]> {
  try {
    const key = monthKey(now)
    const sent = await prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ monthlyCapMicros: number; alerts: unknown }[]>`
        SELECT "monthlyCapMicros", "alerts" FROM "AiSetting" WHERE "workspaceId" = ${workspaceId} FOR UPDATE`
      if (!row || row.monthlyCapMicros <= 0) return null
      const spent = (await tx.aiUsage.aggregate({ where: { workspaceId, day: { gte: monthStart(now) } }, _sum: { costMicros: true } }))._sum.costMicros ?? 0
      const percent = (spent / row.monthlyCapMicros) * 100
      const already = sentAlerts(row.alerts, key)
      const crossed = ALERT_THRESHOLDS.filter((t) => percent >= t && !already.includes(t))
      if (!crossed.length) return null
      const top = crossed[crossed.length - 1]
      // Only the current month is kept: older keys are dropped.
      await tx.aiSetting.update({ where: { workspaceId }, data: { alerts: { [key]: [...already, ...crossed] } } })
      const owners = await tx.user.findMany({ where: { workspaceId, role: "OWNER", active: true }, select: { id: true } })
      const notes = await tx.notification.createManyAndReturn({
        data: owners.map((o) => ({
          userId: o.id,
          type: "SYSTEM",
          title: top >= 100 ? "Budget IA épuisé" : `Budget IA : ${top} % atteints`,
          message:
            top >= 100
              ? `Le plafond IA du mois (${eur(row.monthlyCapMicros)}) est atteint : les fonctions IA sont en pause jusqu'au mois prochain, sauf si vous relevez le plafond dans Réglages › IA.`
              : `${eur(spent)} dépensés sur ${eur(row.monthlyCapMicros)} ce mois-ci. Détail dans Réglages › IA.`,
        })),
      })
      return { crossed, notes }
    })
    if (!sent) return []
    await publishNotifications(sent.notes)
    return sent.crossed
  } catch (error) {
    console.error("[AI_BUDGET_ALERT]", error)
    return []
  }
}
