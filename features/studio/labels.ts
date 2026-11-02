import type { AgentRunStatus, StudioSiteStatus } from "@prisma/client"
import type { Brief, Collected, Criterion, CtaKind, SectionKind, VersionChecks, VersionScores } from "./schemas"

/** Words and views of the Studio Web (E23); safe to import from the browser. */
export const SECTION_LABELS: Record<SectionKind, string> = {
  hero: "Premier écran",
  services: "Services",
  proof: "Preuves",
  process: "Déroulé",
  about: "À propos",
  area: "Zone d’intervention",
  gallery: "Réalisations",
  faq: "Questions fréquentes",
  contact: "Contact",
}

export const CRITERIA_LABELS: Record<Criterion, string> = {
  hierarchy: "Hiérarchie",
  readability: "Lisibilité",
  contrast: "Contrastes",
  mobile: "Mobile",
  brand: "Fidélité à la marque",
  conversion: "Conversion",
}

/** What each criterion of the critique grid looks at (the critique's prompt and the screen's tooltips). */
export const CRITERIA_HINTS: Record<Criterion, string> = {
  hierarchy: "la promesse se lit en trois secondes, les sections s'enchaînent dans un ordre logique",
  readability: "typographie, tailles, longueur des lignes, espacements réguliers",
  contrast: "le texte et les boutons se lisent sur leur fond (4,5:1 pour le texte courant)",
  mobile: "sur téléphone, tout se lit et se touche au pouce, rien n'est coupé ni ne déborde",
  brand: "logo, couleurs, photos et ton fidèles à l'entreprise",
  conversion: "les appels à l'action se voient, les preuves rassurent, le chemin vers le contact est court",
}

export const CTA_LABELS: Record<CtaKind, string> = { phone: "Appel", email: "Email", booking: "Réservation en ligne" }

/** Where a site stands for the person, from its status and its last run. */
export type StudioState = "briefing" | "brief_failed" | "brief_ready" | "building" | "build_failed" | "ready" | "purged"

export const STATE_LABELS: Record<StudioState, string> = {
  briefing: "Brief en cours",
  brief_failed: "Brief en échec",
  brief_ready: "Brief à relire",
  building: "Génération en cours",
  build_failed: "Génération en échec",
  ready: "Prête",
  purged: "Supprimée",
}

export const STATE_TONE: Record<StudioState, "neutral" | "info" | "warning" | "success" | "destructive"> = {
  briefing: "info",
  brief_failed: "destructive",
  brief_ready: "warning",
  building: "info",
  build_failed: "destructive",
  ready: "success",
  purged: "neutral",
}

const ACTIVE: readonly AgentRunStatus[] = ["QUEUED", "RUNNING", "WAITING_APPROVAL"]

export function stateOf(status: StudioSiteStatus, run: { status: AgentRunStatus } | null, hasVersion: boolean): StudioState {
  const active = !!run && ACTIVE.includes(run.status)
  switch (status) {
    case "PURGED":
      return "purged"
    case "BRIEFING":
      return active ? "briefing" : "brief_failed"
    case "BUILDING":
      if (active) return "building"
      return hasVersion ? "ready" : "build_failed"
    case "BRIEF_READY":
      return "brief_ready"
    default:
      return "ready"
  }
}

/** The steps a run goes through, in order, as the run's history names them. */
export const BRIEF_STEPS = [
  { name: "collect_site", label: "Lecture du site" },
  { name: "prepare_images", label: "Préparation des images" },
  { name: "write_brief", label: "Rédaction du brief" },
] as const
export const BUILD_STEPS = [
  { name: "build_page", label: "Écriture de la page" },
  { name: "render_preview", label: "Rendu et accessibilité" },
  { name: "critique_page", label: "Critique visuelle" },
  { name: "publish_preview", label: "Publication" },
  { name: "pagespeed", label: "Mesure PageSpeed" },
] as const

export interface VersionView {
  number: number
  instruction: string | null
  createdAt: string
  createdBy: string | null
  model: string | null
  costEur: number
  checks: VersionChecks
  scores: VersionScores | null
  /** Renders, by kind, for <img src>. */
  renders: { desktop: string | null; mobile: string | null; thumb: string | null }
}

export interface LinkView {
  /** The public address; null when the preview host is not configured or the link must be created again. */
  url: string | null
  createdAt: string
  expiresAt: string
  expired: boolean
  createdBy: string | null
}

export interface SiteView {
  id: string
  lead: { id: string; name: string }
  companyName: string
  status: StudioSiteStatus
  state: StudioState
  createdAt: string
  createdBy: string | null
  brief: Brief | null
  collected: Collected | null
  briefEditedAt: string | null
  run: { id: string; status: AgentRunStatus; error: string | null; steps: string[]; kind: "brief" | "build" | "revise" | null; startedAt: string | null } | null
  currentVersion: number | null
  versions: VersionView[]
  link: LinkView | null
  visits: { count: number; last: string | null; recent: string[] }
  /** Internal preview of a version, framed in the CRM. */
  previewPath: string | null
  purgeAfter: string
  can: { edit: boolean; share: boolean }
  /** The preview host does not answer yet (no DNS record): links cannot be opened. */
  hostIssue: string | null
}

export interface SiteSummary {
  id: string
  lead: { id: string; name: string }
  companyName: string
  state: StudioState
  version: number | null
  thumb: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  visits: number
  lastVisitAt: string | null
  linkExpiresAt: string | null
}

export interface LeadStudio {
  site: SiteView | null
  /** Why generating is not possible now, in words for the person. */
  blocked: string | null
  canGenerate: boolean
}

export const average = (scores: Record<Criterion, number>) => Math.round((Object.values(scores).reduce((s, v) => s + v, 0) / Object.keys(scores).length) * 10) / 10
