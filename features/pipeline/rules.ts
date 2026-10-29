import { z } from "zod"
import type { DealStage } from "@prisma/client"
import { scopeOf } from "@/lib/rbac"
import type { CrmRole } from "@/lib/crm/roles"

/** Order of the pipeline, left to right. WON and LOST end it. */
export const STAGES = ["QUALIFIED", "MEETING_SET", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const satisfies readonly DealStage[]
export const OPEN_STAGES = ["QUALIFIED", "MEETING_SET", "PROPOSAL", "NEGOTIATION"] as const satisfies readonly DealStage[]
export const isOpen = (stage: DealStage) => (OPEN_STAGES as readonly string[]).includes(stage)

/** Roles that can hold an opportunity. SDRs hand opportunities over, they do not carry them. */
export const DEAL_OWNER_ROLES = ["OWNER", "MANAGER", "CLOSER"] as const

// The reasons are fixed so that reports can count them; "Autre" takes a free detail.
export const LOST_REASONS = ["Budget insuffisant", "Choix d’un concurrent", "Mauvais moment, reporté", "Plus de réponse", "Pas de besoin réel", "Autre"] as const
export const DISQUALIFY_REASONS = ["Hors cible", "Pas de budget", "Pas de besoin", "Mauvais interlocuteur", "Entreprise fermée ou en difficulté", "Déjà client ou concurrent", "Autre"] as const

export const qualificationSchema = z.object({
  need: z.string().trim().max(1000).optional(),
  budget: z.enum(["unknown", "none", "yes"]).optional(),
  budgetAmountCents: z.number().int().min(0).max(100_000_000_00).optional(),
  authority: z.enum(["unknown", "decision_maker", "influencer", "user"]).optional(),
  timing: z.enum(["unknown", "now", "1_3_months", "3_6_months", "later"]).optional(),
  notes: z.string().trim().max(2000).optional(),
})
export type Qualification = z.infer<typeof qualificationSchema> & {
  disqualification?: { reason: string; detail?: string }
  updatedAt?: string
  updatedById?: string
}

export const QUALIFICATION_LABELS = {
  budget: { unknown: "Budget inconnu", none: "Pas de budget", yes: "Budget confirmé" },
  authority: { unknown: "Rôle inconnu", decision_maker: "Décideur", influencer: "Influenceur", user: "Utilisateur" },
  timing: { unknown: "Échéance inconnue", now: "Tout de suite", "1_3_months": "1 à 3 mois", "3_6_months": "3 à 6 mois", later: "Plus tard" },
} as const

export type RuleViolation = { code: "forbidden" | "invalid"; message: string }

interface Move {
  actor: { id: string; role: CrmRole }
  deal: { ownerId: string | null; stage: DealStage }
  to: DealStage
  lostReason?: string | null
}

/**
 * Who may move an opportunity where. Closers move their own, managers and owners any; SDRs and viewers none (an SDR
 * hands over by qualifying). A closed opportunity (won or lost) is reopened by a manager only, and losing needs a reason.
 * Returns null when the move is allowed (or is no move).
 */
export function checkDealMove({ actor, deal, to, lostReason }: Move): RuleViolation | null {
  const scope = scopeOf(actor.role, "deal:move")
  if (!scope) return { code: "forbidden", message: "Votre rôle ne déplace pas les opportunités : le closer ou un manager s’en charge." }
  if (scope === "own" && deal.ownerId !== actor.id) return { code: "forbidden", message: "Cette opportunité ne vous est pas attribuée." }
  if (deal.stage === to) return null
  if (!isOpen(deal.stage) && scope !== "all") return { code: "forbidden", message: "Seul un manager rouvre une opportunité gagnée ou perdue." }
  if (to === "LOST" && !lostReason?.trim()) return { code: "invalid", message: "Indiquez pourquoi l’opportunité est perdue." }
  return null
}

/** Who may give an opportunity to someone: managers and owners anyone; others only keep it. */
export function checkDealAssign(actor: { id: string; role: CrmRole }, deal: { ownerId: string | null }, newOwnerId: string | null): RuleViolation | null {
  if (newOwnerId === deal.ownerId) return null
  const scope = scopeOf(actor.role, "deal:move")
  if (scope === "all") return null
  return { code: "forbidden", message: "Seul un manager attribue une opportunité à quelqu’un." }
}
