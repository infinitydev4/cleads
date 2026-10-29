import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import { authOptions } from "@/app/api/auth/options"

/**
 * Session of an administrator, or null. Interim guard: the CRM role matrix
 * (lib/rbac, epic E2) replaces it.
 */
export async function getAdminSession() {
  const session = await getServerSession(authOptions)
  return session?.user?.role === "ADMIN" ? session : null
}

export const unauthorized = () => NextResponse.json({ error: "Non autorisé" }, { status: 401 })
