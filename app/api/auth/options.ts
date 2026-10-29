import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { prisma } from "@/lib/prisma"
import { compare } from "bcryptjs"
import { Role } from "@prisma/client"
import { PrismaAdapter } from "@auth/prisma-adapter"

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 jours
  },
  pages: {
    signIn: "/auth/login",
    error: "/auth/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email et mot de passe requis")
        }

        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email
          }
        })

        // Même message pour un compte inconnu et un mauvais mot de passe : pas d'énumération des comptes.
        const isPasswordValid = user?.password
          ? await compare(credentials.password, user.password)
          : false

        if (!user || !isPasswordValid) {
          throw new Error("Identifiants invalides")
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as Role,
          isTemporaryPassword: user.isTemporaryPassword
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as any).role
        token.isTemporaryPassword = (user as any).isTemporaryPassword
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
      // Les droits par rôle sont appliqués par proxy.ts ; on ne redirige que vers notre propre origine.
      if (url.startsWith("/")) return `${baseUrl}${url}`
      if (url.startsWith(baseUrl)) return url
      return `${baseUrl}/dashboard`
    }
  }
} 