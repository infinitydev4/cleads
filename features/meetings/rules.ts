import { z } from "zod"
import type { MeetingOutcome, MeetingStatus, MeetingType } from "@prisma/client"
import { isDayKey } from "@/lib/crm/day"
import { LOST_REASONS } from "@/features/pipeline/rules"

export const MEETING_TYPES = ["DISCOVERY", "DEMO", "FOLLOW_UP"] as const satisfies readonly MeetingType[]
export const MEETING_TYPE_LABELS: Record<MeetingType, string> = { DISCOVERY: "Découverte", DEMO: "Démonstration", FOLLOW_UP: "Suivi" }
export const OUTCOMES = ["QUALIFIED", "FOLLOW_UP", "LOST"] as const satisfies readonly MeetingOutcome[]
export const OUTCOME_LABELS: Record<MeetingOutcome, string> = { QUALIFIED: "Qualifié, on avance", FOLLOW_UP: "À relancer", LOST: "Perdu" }

/** A meeting is "active" until it is closed one way or another. */
export const ACTIVE_STATUSES = ["SCHEDULED", "CONFIRMED"] as const satisfies readonly MeetingStatus[]
export const isActive = (status: MeetingStatus) => (ACTIVE_STATUSES as readonly string[]).includes(status)

/** The person who booked can change or cancel up to this long before the start; after that they write or call. */
export const GUEST_CHANGE_LIMIT_MIN = 120

export type MeetingAction = "confirm" | "cancel" | "reschedule" | "complete" | "no_show"

/**
 * What may be done to a meeting in its current state. Returns the reason in French when it may not.
 * Closing (complete / no-show) is only possible once the meeting has started: a result is a fact, not a plan.
 */
export function checkMeetingAction(meeting: { status: MeetingStatus; startsAt: Date }, action: MeetingAction, now: Date): string | null {
  if (!isActive(meeting.status)) return "Ce rendez-vous est déjà clos."
  const started = meeting.startsAt.getTime() <= now.getTime()
  switch (action) {
    case "confirm":
      return meeting.status === "CONFIRMED" ? "Ce rendez-vous est déjà confirmé." : started ? "Ce rendez-vous a commencé : indiquez son résultat." : null
    case "cancel":
      return null
    case "reschedule":
      return started ? "Ce rendez-vous est passé : indiquez son résultat, puis planifiez-en un autre si besoin." : null
    case "complete":
    case "no_show":
      return started ? null : "Ce rendez-vous n’a pas encore eu lieu."
  }
}

/** May the guest still change this meeting by their link? */
export function guestMayChange(meeting: { status: MeetingStatus; startsAt: Date }, now: Date): string | null {
  if (!isActive(meeting.status)) return "Ce rendez-vous n’est plus actif."
  if (meeting.startsAt.getTime() - now.getTime() < GUEST_CHANGE_LIMIT_MIN * 60_000) return "Le rendez-vous est trop proche pour être modifié en ligne : écrivez-nous ou appelez-nous."
  return null
}

const text = (max: number) => z.string().trim().max(max)

export const bookMeetingSchema = z.object({
  leadId: z.string().min(1),
  hostId: z.string().min(1),
  startsAt: z.iso.datetime(),
  type: z.enum(MEETING_TYPES).default("DISCOVERY"),
  videoUrl: z.union([z.literal(""), z.url({ protocol: /^https?$/ })]).optional(),
  notes: text(2000).optional(),
  /** Place the meeting outside the open hours (the host's own calendar still cannot overlap). Managers, owners and the host only. */
  override: z.boolean().optional(),
  notifyGuest: z.boolean().default(true),
})
export type BookMeetingInput = z.infer<typeof bookMeetingSchema>

export const publicBookingSchema = z.object({
  startsAt: z.iso.datetime(),
  name: text(120).min(2, "Indiquez votre nom."),
  email: z.email("Adresse email invalide.").max(254),
  phone: text(40).optional(),
  company: text(160).optional(),
  message: text(1000).optional(),
  consent: z.literal(true, { error: "Acceptez d’être recontacté au sujet de ce rendez-vous." }),
  /** Honeypot: invisible to people, filled by robots. */
  website: z.string().max(200).optional(),
})
export type PublicBookingInput = z.infer<typeof publicBookingSchema>

export const meetingActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm") }),
  z.object({ action: z.literal("cancel"), reason: text(300).optional() }),
  z.object({ action: z.literal("reschedule"), startsAt: z.iso.datetime(), override: z.boolean().optional() }),
  z.object({ action: z.literal("no_show") }),
  z.object({
    action: z.literal("complete"),
    outcome: z.enum(OUTCOMES, { error: "Choisissez le résultat du rendez-vous." }),
    notes: text(2000).optional(),
    /** Required when the outcome is "Perdu": the same reasons as the pipeline, so reports can count them. */
    lostReason: z.enum(LOST_REASONS).optional(),
    lostDetail: text(300).optional(),
    /** Calendar day of the follow-up task when the outcome is "À relancer". */
    followUpDay: z.string().refine(isDayKey, "Date de relance invalide.").optional(),
  }),
])
export type MeetingActionInput = z.infer<typeof meetingActionSchema>

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const RESERVED_SLUGS = ["gerer", "api", "admin", "app", "auth", "dashboard", "new"]

export const profileSchema = z.object({
  slug: z.string().trim().toLowerCase().min(3, "Au moins 3 caractères.").max(40).regex(SLUG_RE, "Lettres minuscules, chiffres et tirets seulement.").refine((s) => !RESERVED_SLUGS.includes(s), "Ce nom est réservé."),
  enabled: z.boolean(),
  timezone: z.string().min(1),
  durationMin: z.number().int().min(10).max(240),
  bufferMin: z.number().int().min(0).max(120),
  minNoticeMin: z.number().int().min(0).max(20160),
  horizonDays: z.number().int().min(1).max(120),
  videoUrl: z.union([z.literal(""), z.url({ protocol: /^https?$/ })]).optional(),
  intro: text(500).optional(),
})
export type ProfileInput = z.infer<typeof profileSchema>

export const availabilitySchema = z.object({
  hostId: z.string().optional(),
  windows: z.array(z.object({ weekday: z.number().int().min(0).max(6), startMinute: z.number().int(), endMinute: z.number().int() })).max(21),
  exceptions: z
    .array(z.object({ date: z.string().refine(isDayKey, "Date invalide."), available: z.boolean(), startMinute: z.number().int().nullable().optional(), endMinute: z.number().int().nullable().optional(), reason: text(120).optional() }))
    .max(200),
  profile: profileSchema,
})
export type AvailabilityInput = z.infer<typeof availabilitySchema>
