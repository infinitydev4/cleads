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
  ScrollText,
  Sun,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react"
import { can, type Permission } from "@/lib/rbac"
import type { CrmRole } from "./roles"

export interface NavItem {
  id: string
  label: string
  href: string
  icon: LucideIcon
  /** Permission required to see the entry (null = every signed-in member). */
  permission: Permission | null
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

export const navGroups: NavGroup[] = [
  {
    id: "main",
    items: [{ id: "today", label: "Aujourd’hui", href: "/app", icon: Sun, permission: null, keywords: ["accueil", "tâches", "relances"] }],
  },
  {
    id: "prospecting",
    label: "Prospection",
    items: [
      { id: "leads", label: "Prospects", href: "/app/leads", icon: Users, permission: "lead:read", soon: true, keywords: ["contacts", "entreprises"] },
      { id: "search", label: "Recherche", href: "/app/search", icon: Search, permission: "search:run", soon: true, keywords: ["extractor", "google maps"] },
      { id: "sequences", label: "Séquences", href: "/app/sequences", icon: Send, permission: "sequence:manage", soon: true, keywords: ["relances", "emails"] },
      { id: "mailbox", label: "Emails", href: "/app/mailbox", icon: Mail, permission: "email:send", soon: true, keywords: ["boîte", "envoi"] },
    ],
  },
  {
    id: "conversion",
    label: "Conversion",
    items: [
      { id: "pipeline", label: "Pipeline", href: "/app/pipeline", icon: Handshake, permission: "deal:read", soon: true, keywords: ["opportunités", "deals"] },
      { id: "meetings", label: "Rendez-vous", href: "/app/meetings", icon: CalendarDays, permission: "meeting:read", soon: true, keywords: ["agenda", "calendrier"] },
    ],
  },
  {
    id: "insight",
    label: "Pilotage",
    items: [{ id: "reports", label: "Rapports", href: "/app/reports", icon: BarChart3, permission: "report:read", soon: true, keywords: ["entonnoir", "statistiques"] }],
  },
]

export const footerItems: NavItem[] = [
  { id: "team", label: "Équipe", href: "/app/settings/team", icon: UserCog, permission: "team:read", keywords: ["membres", "rôles", "invitations", "accès"] },
  { id: "audit", label: "Journal d’audit", href: "/app/settings/audit", icon: ScrollText, permission: "audit:read", keywords: ["historique", "sécurité", "connexions"] },
  { id: "design", label: "Design system", href: "/app/design", icon: Palette, permission: "admin:tools", keywords: ["composants", "catalogue"] },
  { id: "legacy", label: "Ancien back-office", href: "/dashboard", icon: CalendarClock, permission: "legacy:access", keywords: ["rendez-vous", "clients"] },
]

export const canSee = (item: NavItem, role: CrmRole) => item.permission === null || can(role, item.permission)

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
