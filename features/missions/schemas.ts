import { z } from "zod"

/**
 * A mission's plan as the copilot writes it (E28, docs/crm-v1/AGENTS-IA.md §17), and the requests about a mission.
 * Shared by the server and the panel.
 *
 * A step runs one action of the catalogue. Its input may cite what an earlier step produced, `{ "$ref": "s2.searchId" }`,
 * and a step may loop (`forEach`) over a short list written in the plan, over a list an earlier step produced
 * (`"s1.targetIds"`), or over the items of an earlier loop (`"s2"`): inside a loop, `{ "$ref": "item" }` is the current
 * item, and a reference to a step of the same loop is that item's. The steps run in order, each once the previous one
 * is over.
 */
export const MAX_STEPS = 10
/** Items of a loop written in the plan, or taken from a list (some actions allow more, features/missions/actions.ts). */
export const LOOP_MAX = 5

export const STEP_ID = /^s([1-9]|10)$/
export const REF = /^s([1-9]|10)\.[a-zA-Z]{2,24}$/

export const planStepSchema = z.object({
  id: z.string().regex(STEP_ID, "id d'étape : s1, s2… dans l'ordre"),
  action: z.string().min(2).max(48),
  input: z.record(z.string(), z.unknown()).default({}),
  forEach: z
    .union([z.string().max(40), z.array(z.string().trim().min(1).max(120)).min(1).max(LOOP_MAX)])
    .optional()
    .describe(`Boucle : une liste écrite (${LOOP_MAX} éléments au plus), "s1.targetIds" (une liste d'une étape), ou "s2" (les éléments de la boucle de s2)`),
})

/** In Paris time; between 6 h and 21 h, never inside a change of time. */
export const recurrenceSchema = z.object({
  frequency: z.enum(["daily", "weekly"]),
  days: z.array(z.number().int().min(1).max(7)).min(1).max(7).optional().describe("Jours, 1 = lundi … 7 = dimanche (hebdomadaire ; lundi par défaut)"),
  hour: z.number().int().min(6).max(21).describe("Heure de Paris, de 6 à 21"),
  minute: z.union([z.literal(0), z.literal(15), z.literal(30), z.literal(45)]).optional(),
})

export const planSchema = z.object({
  title: z.string().trim().min(3).max(80),
  steps: z.array(planStepSchema).min(1).max(MAX_STEPS),
  recurrence: recurrenceSchema.optional(),
})

export type PlanInput = z.input<typeof planSchema>
export type Plan = z.infer<typeof planSchema>
export type PlanStep = z.infer<typeof planStepSchema>
export type Recurrence = z.infer<typeof recurrenceSchema>
export type ApprovalLevel = "auto" | "confirm" | "explicit"

/** A step as stored once checked: its words for the person and the click it needs. */
export interface CheckedStep extends PlanStep {
  text: string
  level: ApprovalLevel
}

export interface CheckedPlan extends Omit<Plan, "steps"> {
  steps: CheckedStep[]
}

/** What a person does with a mission. `capEur`: a higher cap, given a second time (D32). */
export const missionRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), capEur: z.number().min(0).max(100).optional() }),
  z.object({ action: z.literal("refuse") }),
  z.object({ action: z.literal("pause") }),
  z.object({ action: z.literal("resume"), capEur: z.number().min(0).max(100).optional() }),
  z.object({ action: z.literal("cancel") }),
])
export type MissionRequest = z.infer<typeof missionRequestSchema>

export const scheduleRequestSchema = z.object({ action: z.enum(["pause", "resume", "stop"]) })
export type ScheduleRequest = z.infer<typeof scheduleRequestSchema>
