import type { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { compare } from "bcryptjs"
import type { Role } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import { clientIp } from "@/lib/request-ip"
import { isStaffRole } from "@/lib/crm/roles"
import { LOCKOUT_WINDOW_MS, isLockedOut, lockoutMinutesLeft } from "./lockout"

// Compared against when the account does not exist, so that response time does not reveal it.
const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8k9uQ0m1vS7kHk3G1hQmZ4b0nB1sGa"

const GENERIC_ERROR = "Identifiants invalides"

/**
 * Authentication is isolated here and in lib/auth/session.ts so that moving to another library
 * (Auth.js v5 once it leaves beta, Better Auth) touches these two files only.
 */
export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 12 * 60 * 60, // a working day; the session is re-checked against the database on every request
    updateAge: 60 * 60,
  },
  pages: { signIn: "/auth/login", error: "/auth/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials, req) {
        const email = credentials?.email?.trim().toLowerCase()
        const password = credentials?.password
        if (!email || !password) throw new Error("Email et mot de passe requis")
        const forwarded = req?.headers?.["x-forwarded-for"]
        const ip = clientIp(new Headers(forwarded ? { "x-forwarded-for": String(forwarded) } : {}))

        const since = new Date(Date.now() - LOCKOUT_WINDOW_MS)
        const failures = await prisma.auditLog.findMany({
          where: { action: "auth.login_failed", subject: email, createdAt: { gte: since } },
          select: { createdAt: true },
          take: 20,
        })
        if (isLockedOut(failures.map((f) => f.createdAt))) {
          throw new Error(`Trop de tentatives. Réessayez dans ${lockoutMinutesLeft(failures.map((f) => f.createdAt))} min.`)
        }

        const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } })
        const passwordOk = await compare(password, user?.password ?? DUMMY_HASH)
        const allowed = !!user && passwordOk && user.active && isStaffRole(user.role === "ADMIN" ? "OWNER" : user.role)

        if (!user || !allowed) {
          await audit({
            action: "auth.login_failed",
            subject: email,
            actorId: user?.id,
            ip,
            // Reason stays in the log only; the person always sees the same message.
            metadata: { reason: !user ? "unknown_account" : !passwordOk ? "bad_password" : !user.active ? "deactivated" : "no_crm_access" },
          })
          throw new Error(GENERIC_ERROR)
        }

        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
        await audit({ action: "auth.login", actorId: user.id, subject: email, ip })
        return { id: user.id, email: user.email, name: user.name, role: user.role as Role, isTemporaryPassword: user.isTemporaryPassword }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.isTemporaryPassword = user.isTemporaryPassword
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as Role
        session.user.isTemporaryPassword = token.isTemporaryPassword as boolean
      }
      return session
    },
    async redirect({ url, baseUrl }) {
      // Rights are enforced by proxy.ts and the server guards; only ever redirect inside our own origin.
      if (url.startsWith("/")) return `${baseUrl}${url}`
      if (url.startsWith(baseUrl)) return url
      return `${baseUrl}/app`
    },
  },
}
