import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { CurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { LeadError } from "@/features/leads/errors"
import { commitments, ensureAiSetting, eurToMicros, getAiSettings, microsToEur, monthKey, monthStart } from "@/lib/ai/budget"
import { aiConfigured } from "@/lib/ai/gateway"
import { AI_ROLES, ROLES, modelLabel, resolveRole, roleModelsSchema, type AiRole, type RoleModels } from "@/lib/ai/models"
import { formatPrice, priceTable } from "@/lib/ai/pricing"
import { agentLabel } from "./agents"
import { workerStatus, type WorkerStatus } from "./queue"
import { isManager } from "./runs"

/** Réglages › IA: models per role, caps, and the month's consumption (docs/crm-v1/AGENTS-IA.md §5 and §6). */
export interface RoleView {
  id: AiRole
  label: string
  description: string
  kind: "decision" | "language"
  model: string
  modelLabel: string
  isDefault: boolean
  fallbacks: { id: string; label: string }[]
  choices: { id: string; label: string; price: string }[]
}

export interface SpendLine {
  key: string
  label: string
  eur: number
  calls: number
}

export interface AiSettingsView {
  configured: boolean
  canManage: boolean
  roles: RoleView[]
  caps: { monthlyCapEur: number; userDailyCapEur: number; eurPerUsd: number }
  month: {
    key: string
    spentEur: number
    /** Still reserved by runs in progress. */
    heldEur: number
    capEur: number
    percent: number
    byAgent: SpendLine[]
    byModel: SpendLine[]
    /** Owners and managers only. */
    byUser: SpendLine[] | null
  }
  me: { todayEur: number; quotaEur: number }
  /** The AI worker on the VPS (E18): up or not, and the queue. */
  worker: WorkerStatus
}

const add = (map: Map<string, SpendLine>, key: string, label: string, micros: number, calls: number) => {
  const line = map.get(key) ?? { key, label, eur: 0, calls: 0 }
  line.eur += microsToEur(micros)
  line.calls += calls
  map.set(key, line)
}
const sorted = (map: Map<string, SpendLine>) => [...map.values()].sort((a, b) => b.eur - a.eur || b.calls - a.calls)

export async function aiSettingsView(actor: CurrentUser): Promise<AiSettingsView> {
  if (!can(actor.role, "ai:read")) throw new LeadError("forbidden", "Accès refusé", 403)
  const now = new Date()
  const [settings, prices, c, rows, worker] = await Promise.all([
    getAiSettings(actor.workspaceId),
    priceTable(),
    commitments(prisma, actor.workspaceId, actor.id, now),
    prisma.aiUsage.findMany({ where: { workspaceId: actor.workspaceId, day: { gte: monthStart(now) } } }),
    workerStatus(actor.workspaceId, now),
  ])
  const manager = isManager(actor)
  const byAgent = new Map<string, SpendLine>()
  const byModel = new Map<string, SpendLine>()
  const byUser = new Map<string, SpendLine>()
  for (const r of rows) {
    add(byAgent, r.agentId, agentLabel(r.agentId), r.costMicros, r.calls)
    add(byModel, r.model, modelLabel(r.model), r.costMicros, r.calls)
    if (manager) add(byUser, r.userKey, r.userKey, r.costMicros, r.calls)
  }
  if (manager && byUser.size) {
    const users = await prisma.user.findMany({ where: { id: { in: [...byUser.keys()] } }, select: { id: true, name: true, email: true } })
    const names = new Map(users.map((u) => [u.id, u.name ?? u.email ?? "Membre"]))
    for (const line of byUser.values()) line.label = line.key === "system" ? "Tâches planifiées" : (names.get(line.key) ?? "Ancien membre")
  }

  return {
    configured: aiConfigured(),
    canManage: can(actor.role, "ai:manage"),
    roles: AI_ROLES.map((id) => {
      const def = ROLES[id]
      const { model, fallbacks } = resolveRole(id, settings.roleModels)
      return {
        id,
        label: def.label,
        description: def.description,
        kind: def.kind,
        model,
        modelLabel: modelLabel(model),
        isDefault: model === def.default,
        fallbacks: fallbacks.map((m) => ({ id: m, label: modelLabel(m) })),
        choices: def.choices.map((m) => ({ id: m, label: modelLabel(m), price: formatPrice(prices[m]) })),
      }
    }),
    caps: { monthlyCapEur: microsToEur(settings.monthlyCapMicros), userDailyCapEur: microsToEur(settings.userDailyCapMicros), eurPerUsd: settings.eurPerUsd },
    month: {
      key: monthKey(now),
      spentEur: microsToEur(c.monthSpent),
      heldEur: microsToEur(c.monthHeld),
      capEur: microsToEur(settings.monthlyCapMicros),
      percent: settings.monthlyCapMicros > 0 ? Math.min((c.monthSpent / settings.monthlyCapMicros) * 100, 999) : 0,
      byAgent: sorted(byAgent),
      byModel: sorted(byModel),
      byUser: manager ? sorted(byUser) : null,
    },
    me: { todayEur: microsToEur(c.userSpentToday), quotaEur: microsToEur(settings.userDailyCapMicros) },
    worker,
  }
}

const euros = (max: number, label: string) =>
  z.number({ message: `${label} : un montant en euros` }).min(0, `${label} : pas de montant négatif`).max(max, `${label} : ${max} € au plus`)

export const updateAiSettingsSchema = z
  .object({
    roleModels: roleModelsSchema.optional(),
    monthlyCapEur: euros(10_000, "Plafond mensuel").optional(),
    userDailyCapEur: euros(1_000, "Quota quotidien").optional(),
    eurPerUsd: z.number({ message: "Taux : un nombre" }).min(0.5, "Taux entre 0,5 et 2").max(2, "Taux entre 0,5 et 2").optional(),
  })
  .strict()
export type UpdateAiSettingsInput = z.infer<typeof updateAiSettingsSchema>

/** Owner only. Overrides equal to a role's default are dropped, so a later change of default applies. */
export async function updateAiSettings(actor: CurrentUser, input: UpdateAiSettingsInput, ip?: string | null): Promise<AiSettingsView> {
  if (!can(actor.role, "ai:manage")) throw new LeadError("forbidden", "Seul le propriétaire règle l'IA.", 403)
  const before = await getAiSettings(actor.workspaceId)
  const roleModels: RoleModels = { ...before.roleModels, ...input.roleModels }
  for (const role of AI_ROLES) if (roleModels[role] === ROLES[role].default) delete roleModels[role]
  const after = {
    roleModels,
    monthlyCapMicros: input.monthlyCapEur === undefined ? before.monthlyCapMicros : eurToMicros(input.monthlyCapEur),
    userDailyCapMicros: input.userDailyCapEur === undefined ? before.userDailyCapMicros : eurToMicros(input.userDailyCapEur),
    eurPerUsd: input.eurPerUsd ?? before.eurPerUsd,
  }
  await ensureAiSetting(prisma, actor.workspaceId)
  await prisma.aiSetting.update({ where: { workspaceId: actor.workspaceId }, data: { ...after, updatedById: actor.id } })
  await audit({
    action: "ai.settings_updated",
    actorId: actor.id,
    workspaceId: actor.workspaceId,
    entityType: "AiSetting",
    metadata: { before: { ...before }, after },
    ip,
  })
  return aiSettingsView(actor)
}
