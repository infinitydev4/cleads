import type { Permission } from "@/lib/rbac"

/**
 * The spaces of the 3D view, one per CRM module. This list is the only place a space is declared: the scene, the HUD,
 * the API and the tests read it. A new space is one entry here, its composition in components/crm/hq/scene/zones.tsx
 * and its case in getZone (features/hq/service.ts), as "Agents IA" and "Studio Web" were added with E26.
 */
export const ZONE_IDS = ["sources", "qualification", "coordination", "outreach", "pipeline", "analytics", "meetings", "campaigns", "agents", "studio"] as const
export type ZoneId = (typeof ZONE_IDS)[number]

export interface ZoneDef {
  id: ZoneId
  label: string
  /** One sentence: what happens in this space, in the CRM's own words. */
  description: string
  /** The 2D module it opens, and the right needed to open it. */
  href: string
  hrefLabel: string
  permission: Permission | null
  /** Centre of the plot on the platform (metres, y up). See components/crm/hq/scene/layout.ts for the camera. */
  position: [x: number, z: number]
  /** Keyboard shortcut in the 3D view: 1 to 9, then 0. */
  key: string
  /** Desks for members (the rest work in the central building); none in the AI wing, where the agents work. */
  seats: number
}

/**
 * Placement follows the reference composition: a platform seen at 45°, the Cleads building in the middle and the eight
 * module spaces around it, 12 m apart. The AI wing (E26) widens the platform on its far-left side, its two spaces on
 * the streets between the plots (z = ±6). On screen: x+ goes down-right, z+ goes down-left.
 */
export const ZONES: readonly ZoneDef[] = [
  {
    id: "sources",
    label: "Scraping / Sources",
    description: "Recherches Cleads Extractor, imports CSV et formulaire : d’où viennent les prospects.",
    href: "/app/search",
    hrefLabel: "Ouvrir la recherche",
    permission: "search:run",
    position: [-12, 0],
    key: "1",
    seats: 2,
  },
  {
    id: "qualification",
    label: "Qualification",
    description: "Les fiches qui ont répondu ou méritent un appel : besoin, budget, interlocuteur, échéance.",
    href: "/app/leads?status=REPLIED",
    hrefLabel: "Ouvrir les fiches à qualifier",
    permission: "lead:read",
    position: [-12, -12],
    key: "2",
    seats: 3,
  },
  {
    id: "coordination",
    label: "Coordination",
    description: "L’équipe et la file du jour : tâches en retard, rendez-vous, relances.",
    href: "/app",
    hrefLabel: "Ouvrir Aujourd’hui",
    permission: null,
    position: [0, -12],
    key: "3",
    seats: 3,
  },
  {
    id: "outreach",
    label: "Prospection multicanale",
    description: "Emails 1 à 1, séquences, appels ; LinkedIn et WhatsApp viendront plus tard.",
    href: "/app/mailbox",
    hrefLabel: "Ouvrir les emails",
    permission: "email:send",
    position: [12, -12],
    key: "4",
    seats: 2,
  },
  {
    id: "pipeline",
    label: "Pipeline CRM",
    description: "Les opportunités par étape, de « Qualifié » à « Gagné ».",
    href: "/app/pipeline",
    hrefLabel: "Ouvrir le pipeline",
    permission: "deal:read",
    position: [12, 0],
    key: "5",
    seats: 2,
  },
  {
    id: "analytics",
    label: "Analytics",
    description: "Le parcours d’acquisition chiffré, chaque indicateur avec sa définition.",
    href: "/app/campaigns",
    hrefLabel: "Voir les campagnes",
    permission: "campaign:read",
    position: [12, 12],
    key: "6",
    seats: 2,
  },
  {
    id: "meetings",
    label: "RDV & Planning",
    description: "Agenda des closers, rendez-vous du jour, résultats à saisir.",
    href: "/app/meetings",
    hrefLabel: "Ouvrir l’agenda",
    permission: "meeting:read",
    position: [0, 12],
    key: "7",
    seats: 2,
  },
  {
    id: "campaigns",
    label: "Campagnes",
    description: "Les cibles travaillées (secteur × zone) et leurs résultats mesurés.",
    href: "/app/campaigns",
    hrefLabel: "Ouvrir les campagnes",
    permission: "campaign:read",
    position: [-12, 12],
    key: "8",
    seats: 2,
  },
  {
    id: "agents",
    label: "Agents IA",
    description: "L’agence IA au travail : chaque agent à son poste, ce qu’il fait en ce moment et ce qui attend votre validation.",
    href: "/app/agents",
    hrefLabel: "Ouvrir Agents IA",
    permission: "ai:use",
    position: [-24, -6],
    key: "9",
    seats: 0,
  },
  {
    id: "studio",
    label: "Studio Web",
    description: "L’atelier du Designer : les landings de démonstration construites à partir du site et de l’audit de chaque prospect.",
    href: "/app/studio",
    hrefLabel: "Ouvrir le Studio",
    permission: "studio:generate",
    position: [-24, 6],
    key: "0",
    seats: 0,
  },
]

export const zoneById = (id: string): ZoneDef | undefined => ZONES.find((z) => z.id === id)
export const isZoneId = (id: string): id is ZoneId => (ZONE_IDS as readonly string[]).includes(id)

/** Steps of the acquisition journey (features/metrics INDICATORS) and the space each one lives in. */
export const JOURNEY = [
  { key: "leads", label: "Sources", zone: "sources" },
  { key: "contacted", label: "Prospection", zone: "outreach" },
  { key: "replied", label: "Réponses", zone: "qualification" },
  { key: "qualified", label: "Qualification", zone: "qualification" },
  { key: "meetings", label: "RDV", zone: "meetings" },
  { key: "won", label: "Gagnés", zone: "pipeline" },
] as const satisfies readonly { key: string; label: string; zone: ZoneId }[]

/** Where members sit, by role, in order of preference (the scene seats them while seats are free). */
export const STATIONS_BY_ROLE: Record<string, ZoneId[]> = {
  OWNER: ["coordination", "analytics", "campaigns"],
  MANAGER: ["coordination", "campaigns", "analytics"],
  SDR: ["qualification", "outreach", "sources"],
  CLOSER: ["meetings", "pipeline"],
  VIEWER: ["analytics"],
}

/** The central building: the overflow when every desk of a member's spaces is taken. */
export const HQ_SEATS = 6

/**
 * Seats members, in the given order, at the first space of their role that still has a free desk; the others go to
 * the central building ("hq"), then stand around it. Pure, so the scene and the tests agree.
 */
export function assignStations<T extends { id: string; role: string }>(members: T[]): (T & { station: ZoneId | "hq"; seat: number })[] {
  const used = new Map<string, number>()
  return members.map((m) => {
    const zone = (STATIONS_BY_ROLE[m.role] ?? []).find((z) => (used.get(z) ?? 0) < (zoneById(z)?.seats ?? 0))
    const station = zone ?? "hq"
    const seat = used.get(station) ?? 0
    used.set(station, seat + 1)
    return { ...m, station, seat }
  })
}
