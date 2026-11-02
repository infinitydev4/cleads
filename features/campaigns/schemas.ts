import { z } from "zod"
import { isDayKey } from "@/lib/crm/day"

export const CAMPAIGN_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED"] as const
export type CampaignStatusValue = (typeof CAMPAIGN_STATUSES)[number]

const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null)
const day = z.string().refine(isDayKey, "Date invalide").nullish().transform((v) => v ?? null)
const goal = z.number().int().min(1, "Un objectif vaut au moins 1").max(1_000_000).nullish().transform((v) => v ?? null)

const fields = {
  name: z.string().trim().min(2, "Donnez un nom à la campagne (2 caractères au moins)").max(80, "80 caractères au plus"),
  description: optionalText(1000),
  sector: optionalText(100),
  area: optionalText(120),
  ownerId: z.string().min(1).nullish().transform((v) => v ?? null),
  startsOn: day,
  endsOn: day,
  goalLeads: goal,
  goalMeetings: goal,
  /** E25: the active offer the campaign leads with. */
  offerId: z.string().min(1).nullish().transform((v) => v ?? null),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
}

const datesInOrder = (v: { startsOn?: string | null; endsOn?: string | null }) => !v.startsOn || !v.endsOn || v.endsOn >= v.startsOn
const datesMessage = { message: "La fin de la campagne doit suivre son début", path: ["endsOn"] }

export const createCampaignSchema = z.object(fields).refine(datesInOrder, datesMessage)
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>

/** Every field optional; `archived` archives or restores. */
export const updateCampaignSchema = z
  .object({
    name: fields.name.optional(),
    description: fields.description.optional(),
    sector: fields.sector.optional(),
    area: fields.area.optional(),
    ownerId: z.string().min(1).nullable().optional(),
    startsOn: z.string().refine(isDayKey, "Date invalide").nullable().optional(),
    endsOn: z.string().refine(isDayKey, "Date invalide").nullable().optional(),
    goalLeads: z.number().int().min(1).max(1_000_000).nullable().optional(),
    goalMeetings: z.number().int().min(1).max(1_000_000).nullable().optional(),
    offerId: z.string().min(1).nullable().optional(),
    status: z.enum(CAMPAIGN_STATUSES).optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Aucun changement demandé" })
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>

export { datesInOrder }
