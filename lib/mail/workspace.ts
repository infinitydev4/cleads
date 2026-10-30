import { prisma } from "@/lib/prisma"

let cached: string | undefined

/** The CRM runs one workspace today; emails sent outside a signed-in request (contact form, webhooks) belong to it. */
export async function defaultWorkspaceId(): Promise<string | null> {
  if (cached) return cached
  const ws = await prisma.workspace.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } })
  cached = ws?.id
  return cached ?? null
}

export const resetDefaultWorkspaceCache = () => {
  cached = undefined
}
