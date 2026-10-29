import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/guard"
import { can } from "@/lib/rbac"
import { getSession } from "@/lib/auth/session"

/** Session of a member allowed into the pre-CRM back-office (the owner), or null. */
export async function getAdminSession() {
  const user = await getCurrentUser()
  if (!user || !can(user.role, "legacy:access")) return null
  return getSession()
}

export const unauthorized = () => NextResponse.json({ error: "Non autorisé" }, { status: 401 })
