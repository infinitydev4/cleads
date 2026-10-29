import {
  BarChart3,
  CalendarClock,
  CalendarDays,
  Handshake,
  LayoutGrid,
  Mail,
  Palette,
  Search,
  Send,
  Settings,
  Sun,
  Users,
  type LucideIcon,
} from "lucide-react"
import type { CrmRole } from "./roles"

export interface NavItem {
  id: string
  label: string
  href: string
  icon: LucideIcon
  /** Roles allowed to see the entry. */
  roles: readonly CrmRole[]
  /** Planned module: shown greyed out until its epic ships. */
  soon?: boolean
  /** Keywords the command palette also matches. */
  keywords?: string[]
}

export interface NavGroup {
  id: string
  label?: string
  items: NavItem[]
}

const ALL: readonly CrmRole[] = ["OWNER", "MANAGER", "SDR", "CLOSER", "VIEWER"]
const SALES: readonly CrmRole[] = ["OWNER", "MANAGER", "SDR", "CLOSER"]
const PROSPECTING: readonly CrmRole[] = ["OWNER", "MANAGER", "SDR"]
const MANAGEMENT: readonly CrmRole[] = ["OWNER", "MANAGER"]

export const navGroups: NavGroup[] = [
  {
    id: "main",
    items: [{ id: "today", label: "Aujourd’hui", href: "/app", icon: Sun, roles: ALL, keywords: ["accueil", "tâches", "relances"] }],
  },
  {
    id: "prospecting",
    label: "Prospection",
    items: [
      { id: "leads", label: "Prospects", href: "/app/leads", icon: Users, roles: [...ALL], soon: true, keywords: ["contacts", "entreprises"] },
      { id: "search", label: "Recherche", href: "/app/search", icon: Search, roles: PROSPECTING, soon: true, keywords: ["extractor", "google maps"] },
      { id: "sequences", label: "Séquences", href: "/app/sequences", icon: Send, roles: PROSPECTING, soon: true, keywords: ["relances", "emails"] },
      { id: "mailbox", label: "Emails", href: "/app/mailbox", icon: Mail, roles: SALES, soon: true, keywords: ["boîte", "envoi"] },
    ],
  },
  {
    id: "conversion",
    label: "Conversion",
    items: [
      { id: "pipeline", label: "Pipeline", href: "/app/pipeline", icon: Handshake, roles: ALL, soon: true, keywords: ["opportunités", "deals"] },
      { id: "meetings", label: "Rendez-vous", href: "/app/meetings", icon: CalendarDays, roles: ALL, soon: true, keywords: ["agenda", "calendrier"] },
    ],
  },
  {
    id: "insight",
    label: "Pilotage",
    items: [{ id: "reports", label: "Rapports", href: "/app/reports", icon: BarChart3, roles: ALL, soon: true, keywords: ["entonnoir", "statistiques"] }],
  },
]

export const footerItems: NavItem[] = [
  { id: "settings", label: "Réglages", href: "/app/settings", icon: Settings, roles: MANAGEMENT, soon: true, keywords: ["équipe", "profil"] },
  { id: "design", label: "Design system", href: "/app/design", icon: Palette, roles: ["OWNER"], keywords: ["composants", "catalogue"] },
  { id: "legacy", label: "Ancien back-office", href: "/dashboard", icon: CalendarClock, roles: ["OWNER"], keywords: ["rendez-vous", "clients"] },
]

export const canSee = (item: NavItem, role: CrmRole) => item.roles.includes(role)

/** Navigation visible for a role; empty groups disappear. */
export function navFor(role: CrmRole): { groups: NavGroup[]; footer: NavItem[] } {
  return {
    groups: navGroups
      .map((g) => ({ ...g, items: g.items.filter((i) => canSee(i, role)) }))
      .filter((g) => g.items.length > 0),
    footer: footerItems.filter((i) => canSee(i, role)),
  }
}

/** Flat list used by the command palette. */
export const allNavItems = (role: CrmRole): NavItem[] => {
  const { groups, footer } = navFor(role)
  return [...groups.flatMap((g) => g.items), ...footer]
}

export const iconFallback = LayoutGrid
