import { cn } from "@/lib/utils"
import type { Priority, SiteState } from "@/features/leads/types"

/**
 * The closer's desk (9 November 2026): the two signs a row and a fiche share. Each one has a colour, a shape and a word,
 * so it reads without the colour (features/leads/insights.ts decides them).
 */
export const SITE_LABELS: Record<SiteState, { label: string; hint: string }> = {
  none: { label: "Aucun site", hint: "Ni site ni page de réservation : un site vitrine se vend tout seul." },
  social: { label: "Réseaux seulement", hint: "Une page Facebook, Instagram ou d’annuaire, pas de vrai site : le site vitrine reste à vendre." },
  weak: { label: "À améliorer", hint: "L’audit IA lui trouve beaucoup à gagner : lenteur, mobile, conversion." },
  ok: { label: "Correct", hint: "Le site tient la route : vendre la visibilité (SEO, publicités, IA)." },
  unknown: { label: "Non vérifié", hint: "Pas encore d’audit : lance-le depuis la fiche." },
}

export const PRIORITY_LABELS: Record<Priority, { label: string; hint: string }> = {
  1: { label: "À appeler en premier", hint: "Rappel du jour, réponse reçue, signal récent ou fiche forte jamais appelée." },
  2: { label: "Bonne fiche", hint: "Rien d’urgent : à appeler dans la journée." },
  3: { label: "Peut attendre", hint: "Pas de téléphone, fiche faible ou hors jeu." },
}

export function SiteIndicator({ state, score, className }: { state: SiteState; score?: number | null; className?: string }) {
  const meta = SITE_LABELS[state]
  return (
    <span className={cn("inline-flex items-center gap-2 whitespace-nowrap text-xs font-semibold", className)} title={score != null ? `${meta.hint} Score de l’audit : ${score}/100.` : meta.hint}>
      <span
        aria-hidden="true"
        className={cn(
          "h-2.5 w-2.5 shrink-0",
          state === "none" && "rounded-full bg-destructive ring-[3px] ring-destructive-subtle",
          (state === "weak" || state === "social") && "rounded-[2px] bg-warning ring-[3px] ring-warning-subtle",
          state === "ok" && "rounded-full bg-success ring-[3px] ring-success-subtle",
          state === "unknown" && "rounded-full border-2 border-muted-foreground/60"
        )}
      />
      <span className={cn(state === "none" && "text-destructive-text", (state === "weak" || state === "social") && "text-warning", state === "ok" && "text-success", state === "unknown" && "text-muted-foreground")}>{meta.label}</span>
    </span>
  )
}

/** `silent` when the label is written next to it: a screen reader then hears it once. */
export function PriorityBadge({ priority, silent = false, className }: { priority: Priority; silent?: boolean; className?: string }) {
  const meta = PRIORITY_LABELS[priority]
  return (
    <span
      title={`${meta.label} : ${meta.hint}`}
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-md px-1.5 text-xs font-extrabold tabular-nums",
        priority === 1 && "bg-warning-subtle text-warning",
        priority === 2 && "bg-info-subtle text-info",
        priority === 3 && "bg-secondary text-muted-foreground",
        className
      )}
    >
      <span aria-hidden="true">P{priority}</span>
      {!silent && <span className="sr-only">{meta.label}</span>}
    </span>
  )
}
