import type { BadgeProps } from "@/components/ui/badge"

type Tone = NonNullable<BadgeProps["variant"]>
export interface StatusMeta {
  label: string
  tone: Tone
}

/** Single source for how a status looks everywhere (lists, cards, timeline). */
export const leadStatus = {
  NEW: { label: "Nouveau", tone: "info" },
  CONTACTED: { label: "Contacté", tone: "neutral" },
  REPLIED: { label: "A répondu", tone: "warning" },
  QUALIFIED: { label: "Qualifié", tone: "success" },
  DISQUALIFIED: { label: "Non qualifié", tone: "outline" },
  DO_NOT_CONTACT: { label: "Ne pas contacter", tone: "destructive" },
} as const satisfies Record<string, StatusMeta>

export const dealStage = {
  QUALIFIED: { label: "Qualifié", tone: "info" },
  MEETING_SET: { label: "RDV planifié", tone: "warning" },
  PROPOSAL: { label: "Proposition", tone: "neutral" },
  NEGOTIATION: { label: "Négociation", tone: "neutral" },
  WON: { label: "Gagné", tone: "success" },
  LOST: { label: "Perdu", tone: "destructive" },
} as const satisfies Record<string, StatusMeta>

export const meetingStatus = {
  SCHEDULED: { label: "Planifié", tone: "info" },
  CONFIRMED: { label: "Confirmé", tone: "success" },
  COMPLETED: { label: "Terminé", tone: "neutral" },
  NO_SHOW: { label: "Absent", tone: "destructive" },
  CANCELED: { label: "Annulé", tone: "outline" },
  RESCHEDULED: { label: "Reporté", tone: "warning" },
} as const satisfies Record<string, StatusMeta>

export type StatusMap = Record<string, StatusMeta>
