import { cache } from "react"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "./options"

/**
 * The signed-in session, or null. The token alone is not trusted: the account must still exist and be
 * active, and its role is the one in the database, so a deactivation or a role change applies at once.
 */
export const getSession = cache(async () => {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return null
  const account = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { active: true, role: true, name: true, email: true, image: true, isTemporaryPassword: true },
  })
  if (!account?.active) return null
  session.user.role = account.role
  session.user.isTemporaryPassword = account.isTemporaryPassword
  if (account.name) session.user.name = account.name
  return session
})
