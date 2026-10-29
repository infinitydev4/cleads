import { NextResponse } from "next/server"
import { notFound, redirect } from "next/navigation"
import { toCrmRole, type CrmRole } from "@/lib/crm/roles"
import { can, scopeOf, type Permission, type Scope } from "@/lib/rbac"
import { getSession } from "./session"

export interface CurrentUser {
  id: string
  name: string
  email: string
  image: string | null
  role: CrmRole
}

export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message = status === 401 ? "Non authentifié" : "Accès refusé"
  ) {
    super(message)
  }
}

/** The signed-in CRM member. Former appointment clients (role USER) are not members. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession()
  const role = toCrmRole(session?.user?.role)
  if (!session?.user || !role) return null
  return {
    id: session.user.id,
    name: session.user.name ?? session.user.email ?? "",
    email: session.user.email ?? "",
    image: session.user.image ?? null,
    role,
  }
}

/** Throws AuthError 401 / 403. Use in services and route handlers. */
export async function requirePermission(permission: Permission): Promise<{ user: CurrentUser; scope: Scope }> {
  const user = await getCurrentUser()
  if (!user) throw new AuthError(401)
  const scope = scopeOf(user.role, permission)
  if (!scope) throw new AuthError(403)
  return { user, scope }
}

/** Page version: sends anonymous visitors to the sign-in page and hides what the role cannot see. */
export async function requirePagePermission(permission: Permission) {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/login")
  if (!can(user.role, permission)) notFound()
  return { user, scope: scopeOf(user.role, permission)! }
}

/** Turns an AuthError into the matching JSON response; rethrows anything else. */
export function authErrorResponse(error: unknown) {
  if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status })
  throw error
}
