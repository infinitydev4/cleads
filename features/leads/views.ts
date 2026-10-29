import { prisma } from "@/lib/prisma"
import type { CurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { LeadError } from "./errors"
import { viewFiltersSchema } from "./schemas"
import type { ViewFilters } from "./view-query"


export async function listViews(user: CurrentUser) {
  const views = await prisma.savedView.findMany({
    where: { workspaceId: user.workspaceId, entity: "LEAD", OR: [{ ownerId: user.id }, { shared: true }] },
    orderBy: [{ shared: "asc" }, { name: "asc" }],
    include: { owner: { select: { name: true, email: true } } },
  })
  return views.map((v) => ({
    id: v.id,
    name: v.name,
    shared: v.shared,
    mine: v.ownerId === user.id,
    ownerName: v.owner.name ?? v.owner.email,
    filters: viewFiltersSchema.catch(viewFiltersSchema.parse({})).parse(v.filters),
  }))
}

export async function createView(user: CurrentUser, input: { name: string; filters: ViewFilters; shared: boolean }) {
  // Sharing a view with the team is a management act.
  if (input.shared && !can(user.role, "team:read")) throw new LeadError("forbidden", "Seuls les managers partagent une vue avec l’équipe.", 403)
  const taken = await prisma.savedView.findFirst({ where: { workspaceId: user.workspaceId, ownerId: user.id, entity: "LEAD", name: input.name }, select: { id: true } })
  if (taken) throw new LeadError("conflict", "Vous avez déjà une vue de ce nom.", 409)
  return prisma.savedView.create({ data: { workspaceId: user.workspaceId, ownerId: user.id, entity: "LEAD", name: input.name, filters: input.filters, shared: input.shared }, select: { id: true } })
}

export async function deleteView(user: CurrentUser, id: string) {
  const view = await prisma.savedView.findFirst({ where: { id, workspaceId: user.workspaceId } })
  if (!view || (view.ownerId !== user.id && !can(user.role, "team:manage"))) throw new LeadError("not_found", "Vue introuvable.", 404)
  await prisma.savedView.delete({ where: { id } })
}

export { viewToQuery } from "./view-query"
export type { ViewFilters } from "./view-query"
