import { z } from "zod"
import { HOOK_KEYS, HOOK_MAX_LENGTH, WAVE_SIZES } from "./rules"

export const waveSourceSchema = z.discriminatedUnion("kind", [z.object({ kind: z.literal("campaign"), campaignId: z.string().min(1) }), z.object({ kind: z.literal("pool") })])
export type WaveSource = z.infer<typeof waveSourceSchema>

export const hookModeSchema = z.enum(["auto", ...HOOK_KEYS])
const formatSchema = z.enum(["meet", "phone"])

export const launchWaveSchema = z.object({
  source: waveSourceSchema,
  size: z.number().int().refine((n) => (WAVE_SIZES as readonly number[]).includes(n), "Taille de vague invalide"),
  hookMode: hookModeSchema.default("auto"),
  hostId: z.string().min(1).optional(),
  meetingFormat: formatSchema.optional(),
})
export type LaunchWaveInput = z.infer<typeof launchWaveSchema>

export const previewWaveSchema = z.object({ source: waveSourceSchema, hookMode: hookModeSchema.default("auto") })

export const waveActionSchema = z.object({ status: z.enum(["RUNNING", "PAUSED", "CANCELED"]) })

const hookText = z
  .string()
  .trim()
  .min(20, "Une accroche d’au moins 20 caractères")
  .max(HOOK_MAX_LENGTH, `Au plus ${HOOK_MAX_LENGTH} caractères`)
  .refine((t) => !/\{(?!entreprise\}|metier\}|ville\}|probleme\})[^}]*\}/.test(t), "Variables possibles : {entreprise}, {metier}, {ville}, {probleme}")

export const settingsSchema = z
  .object({
    paused: z.boolean(),
    phoneNumberId: z.string().max(120),
    voiceId: z.string().max(120),
    hostId: z.string().max(60),
    meetingFormat: formatSchema,
    monthlyCapCents: z.number().int().min(0, "Pas de plafond négatif").max(100_000, "Au plus 1 000 € par mois"),
    hooks: z.object(Object.fromEntries(HOOK_KEYS.map((k) => [k, hookText.optional()])) as Record<(typeof HOOK_KEYS)[number], z.ZodOptional<typeof hookText>>),
  })
  .partial()
export type SettingsInput = z.infer<typeof settingsSchema>

// The agent's tools: what ElevenLabs posts back during a call.
export const slotsToolSchema = z.object({ call_token: z.string().min(10).max(80) })
export const bookToolSchema = slotsToolSchema.extend({ starts_at: z.string().min(10).max(40).refine((s) => !Number.isNaN(Date.parse(s)), "starts_at invalide"), email: z.string().max(254).nullish() })
export const callbackToolSchema = slotsToolSchema.extend({ when: z.string().trim().min(1).max(200), day: z.string().max(10).nullish(), who: z.string().max(80).nullish() })
