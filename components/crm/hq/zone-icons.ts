import { BarChart3, CalendarDays, CircleCheck, Database, Handshake, Megaphone, Send, UsersRound, type LucideIcon } from "lucide-react"
import type { ZoneId } from "@/features/hq/zones"

/** One icon per space, shared by the labels of the scene and the HUD. */
export const ZONE_ICONS: Record<ZoneId, LucideIcon> = {
  sources: Database,
  qualification: CircleCheck,
  coordination: UsersRound,
  outreach: Send,
  pipeline: Handshake,
  analytics: BarChart3,
  meetings: CalendarDays,
  campaigns: Megaphone,
}
