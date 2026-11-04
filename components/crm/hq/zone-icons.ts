import { BarChart3, Binoculars, Bot, CalendarDays, CircleCheck, Database, Filter, Handshake, Mail, Megaphone, MessageSquare, PanelsTopLeft, Search, Send, Sparkles, Tag, Target, UsersRound, type LucideIcon } from "lucide-react"
import type { AgentId } from "@/features/ai/agents"
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
  agents: Bot,
  studio: PanelsTopLeft,
}

/** One icon per agent (E26): the same pictograms as the panels of the scene (scene/textures.ts AGENT_GLYPHS). */
export const AGENT_ICONS: Record<AgentId, LucideIcon> = {
  strategist: Target,
  qualifier: Filter,
  auditor: Search,
  offers: Tag,
  writer: Mail,
  replies: MessageSquare,
  designer: PanelsTopLeft,
  copilot: Sparkles,
  researcher: Binoculars,
}
