import { z } from "zod"
import { prisma } from "@/lib/prisma"
import type { CurrentUser } from "@/lib/auth/guard"
import { LeadError } from "@/features/leads/errors"
import { scopeWhere } from "@/features/leads/service"
import { effectiveAgent } from "@/features/ai/definitions"
import type { AgentId } from "@/features/ai/agents"
import type { ToolContext } from "@/features/ai/tools"

/**
 * What the actions of the catalogue share (E28): inputs, the person an action works for, the names an approval shows,
 * and the formatting of outputs. Outputs are written for the model: short, in French, without a contact's email or
 * phone (they stay on the fiche).
 */

export const leadId = z.string().min(1).max(64).describe("Identifiant de la fiche (leadId)")
export const idOf = (what: string) => z.string().min(1).max(64).describe(`Identifiant ${what}`)
export const leadIds = (max = 500) => z.array(z.string().min(1).max(64)).min(1).max(max).describe(`Identifiants des fiches (leadId), ${max} au plus : retrouve-les avec search_leads`)
export const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("AAAA-MM-JJ")

export const iso = (d: string | Date | null | undefined) => (d ? (typeof d === "string" ? d : d.toISOString()).slice(0, 10) : null)
export const clip = (s: string | null | undefined, max: number) => (s ? (s.length > max ? `${s.slice(0, max)}…` : s) : null)
export const euros = (cents: number | null) => (cents == null ? null : Math.round(cents / 100))
export const eur = (micros: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(micros / 1_000_000)
export const plural = (n: number, one: string, many: string) => `${n.toLocaleString("fr-FR")} ${n > 1 ? many : one}`
/** A status in words; an unknown value stays readable. */
export const labelOf = (map: Record<string, { label: string } | string>, key: string) => {
  const v = map[key]
  return typeof v === "string" ? v : v?.label ?? key
}
export const formatDay = (key: string) => new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${key}T12:00:00Z`))
export const formatMoment = (at: string) =>
  new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(at))

export function personOf(ctx: ToolContext): CurrentUser {
  const user = ctx.run.requester
  if (!user) throw new LeadError("forbidden", "Le copilote travaille toujours pour une personne.", 403)
  return user
}

const nameOf = (l: { company: { name: string } | null; contact: { name: string | null } | null }) => l.company?.name ?? l.contact?.name ?? "Sans nom"

/** A fiche's name, if the person may see it: what an approval shows. */
export async function visibleName(user: CurrentUser, id: string): Promise<string> {
  const lead = await prisma.lead.findFirst({
    where: { id, workspaceId: user.workspaceId, ...scopeWhere(user, "lead:read") },
    select: { company: { select: { name: true } }, contact: { select: { name: true } } },
  })
  if (!lead) throw new LeadError("not_found", "Fiche introuvable pour cette personne : vérifie le leadId avec search_leads.", 404)
  return nameOf(lead)
}

/**
 * The fiches a grouped action would change, in words: how many the person may change, the first names, and how many
 * stay out (not visible or not hers). Nothing the person may change: the call is refused before anyone is asked.
 */
export async function targetsOf(user: CurrentUser, ids: readonly string[]): Promise<{ writable: string[]; text: string }> {
  const unique = [...new Set(ids)]
  const rows = await prisma.lead.findMany({
    where: { id: { in: unique }, workspaceId: user.workspaceId, AND: [scopeWhere(user, "lead:write")] },
    select: { id: true, company: { select: { name: true } }, contact: { select: { name: true } } },
    take: 500,
  })
  if (!rows.length) throw new LeadError("not_found", "Aucune de ces fiches ne peut être modifiée par cette personne : vérifie les leadId avec search_leads.", 404)
  const names = rows.slice(0, 3).map(nameOf)
  const more = rows.length - names.length
  const out = unique.length - rows.length
  const text = `${plural(rows.length, "fiche", "fiches")} (${names.join(", ")}${more > 0 ? ` et ${plural(more, "autre", "autres")}` : ""})${out > 0 ? ` ; ${plural(out, "fiche est ignorée", "fiches sont ignorées")}, faute de droit` : ""}`
  return { writable: rows.map((r) => r.id), text }
}

/** The cap a specialist reserves when it starts: the person approves knowing the most it can cost. */
export async function capOf(user: CurrentUser, agentId: AgentId): Promise<string> {
  return eur((await effectiveAgent(user.workspaceId, agentId)).capMicros)
}

/** What a call handed to a specialist returns: the panel follows the run live; the model must not call it done. */
export const runCard = (agentId: AgentId, runId: string, extra: { leadId?: string; open?: string; [key: string]: string | undefined } = {}) => ({
  started: true,
  agentId,
  runId,
  ...extra,
  note: "Le travail continue dans le worker ; la carte se met à jour en direct. Ne le présente pas comme terminé.",
})
