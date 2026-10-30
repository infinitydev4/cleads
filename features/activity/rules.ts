import { z } from "zod"
import type { CrmRole } from "@/lib/crm/roles"
import { isDayKey } from "@/lib/crm/day"

/** What a call came to. Stable codes: reports count them (E10). */
export const CALL_OUTCOMES = {
  reached: "Joint",
  no_answer: "Pas de réponse",
  voicemail: "Répondeur",
  callback: "À rappeler",
  wrong_number: "Mauvais numéro",
} as const
export type CallOutcome = keyof typeof CALL_OUTCOMES
export const CALL_OUTCOME_CODES = Object.keys(CALL_OUTCOMES) as [CallOutcome, ...CallOutcome[]]

/** Outcomes after which the person was not (really) tried: no contact is recorded. */
export const NOT_A_CONTACT: readonly CallOutcome[] = ["wrong_number"]

const day = z.string().refine(isDayKey, "Date invalide")

export const followUpSchema = z.object({ dueDay: day, title: z.string().trim().min(1).max(200).optional() })

export const activitySchema = z
  .object({
    kind: z.enum(["NOTE", "CALL"]),
    body: z.string().trim().max(4000).optional(),
    outcome: z.enum(CALL_OUTCOME_CODES).optional(),
    /** Whole minutes, 0 to 8 hours. */
    durationMin: z.number().int().min(0).max(480).optional(),
    followUp: followUpSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "NOTE" && !v.body) ctx.addIssue({ code: "custom", message: "Écrivez quelque chose", path: ["body"] })
    if (v.kind === "CALL" && !v.body && !v.outcome) ctx.addIssue({ code: "custom", message: "Indiquez le résultat de l’appel", path: ["outcome"] })
    if (v.kind === "NOTE" && (v.outcome || v.durationMin != null || v.followUp)) ctx.addIssue({ code: "custom", message: "Une note n’a ni résultat, ni durée, ni relance", path: ["kind"] })
  })
export type ActivityInput = z.infer<typeof activitySchema>

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Donnez un titre à la tâche").max(200),
  dueDay: day.nullable().optional(),
  assigneeId: z.string().min(1).nullable().optional(),
})
export type CreateTaskInput = z.infer<typeof createTaskSchema>

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    dueDay: day.nullable(),
    assigneeId: z.string().min(1).nullable(),
    done: z.boolean(),
  })
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Aucun changement demandé" })
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>

/** Roles that can carry a task. A viewer cannot. */
export const TASK_ASSIGNEE_ROLES = ["OWNER", "MANAGER", "SDR", "CLOSER"] as const satisfies readonly CrmRole[]

interface Person {
  id: string
  role: CrmRole
}

/**
 * Who may be given a task. Managers and owners hand tasks to anyone; everyone else to themselves or to the people who
 * hold the fiche (its owner, the owner of its open opportunity): a SDR asking the closer to call back, nothing wider.
 */
export function canAssignTaskTo(actor: Person, assigneeId: string | null, holders: (string | null)[]): boolean {
  if (assigneeId === null || assigneeId === actor.id) return true
  if (actor.role === "OWNER" || actor.role === "MANAGER") return true
  return holders.includes(assigneeId)
}

/** Who may change or drop a task: its assignee, its author, and anyone who may write the fiche. */
export function canChangeTask(actor: Person, task: { assigneeId: string | null; createdById: string | null }, canWriteLead: boolean): boolean {
  if (actor.role === "VIEWER") return false
  return task.assigneeId === actor.id || task.createdById === actor.id || canWriteLead
}

/** Deleting is narrower than changing: the author and managers. */
export function canDeleteTask(actor: Person, task: { createdById: string | null }): boolean {
  return actor.role === "OWNER" || actor.role === "MANAGER" || task.createdById === actor.id
}
