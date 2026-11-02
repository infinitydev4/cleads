import type { AuditStatus } from "@prisma/client"
import type { Area, Severity } from "./schemas"

/** Words shown for prospect audits; safe to import from the browser. */
export const AREA_LABELS: Record<Area, string> = {
  technique: "Technique",
  vitesse: "Vitesse",
  mobile: "Mobile",
  seoLocal: "SEO local",
  geo: "GEO",
  conversion: "Conversion",
  presence: "Présence",
  image: "Image",
}

export const AREA_HINTS: Record<Area, string> = {
  technique: "HTTPS, redirections, balises, sitemap",
  vitesse: "Performance PageSpeed sur mobile et ordinateur",
  mobile: "Affichage et vitesse sur téléphone",
  seoLocal: "Fiche Google, avis, cohérence des coordonnées, données LocalBusiness",
  geo: "Ce qu’un moteur IA comprend du site",
  conversion: "Promesse, preuves, appels à l’action",
  presence: "Réseaux sociaux et outils de mesure",
  image: "Modernité et cohérence visuelle, d’après les captures",
}

export const SEVERITY_LABELS: Record<Severity, string> = { high: "Fort impact", medium: "Impact moyen", low: "Faible impact" }
export const SEVERITY_TONE: Record<Severity, "destructive" | "warning" | "neutral"> = { high: "destructive", medium: "warning", low: "neutral" }

export const AUDIT_STATUS_LABELS: Record<AuditStatus, string> = { COMPLETE: "Complet", PARTIAL: "Partiel" }

/** What a weak online presence means for the agency: the lower the audit's score, the more there is to propose. */
export function potentialOf(score: number | null): { level: "high" | "medium" | "low"; label: string } | null {
  if (score == null) return null
  if (score < 50) return { level: "high", label: "Potentiel élevé" }
  if (score < 70) return { level: "medium", label: "Potentiel moyen" }
  return { level: "low", label: "Potentiel faible" }
}
