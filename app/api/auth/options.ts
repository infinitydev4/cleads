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
          console.log("Credentials manquants:", { email: credentials?.email, hasPassword: !!credentials?.password })
          throw new Error("Email et mot de passe requis")
        }

        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email
          }
        })

        if (!user) {
          console.log("Utilisateur non trouvé pour l'email:", credentials.email)
          throw new Error("Utilisateur non trouvé")
        }

        console.log("Tentative de connexion:", {
          email: credentials.email,
          hasStoredPassword: !!user.password,
          role: user.role
        })

        const isPasswordValid = await compare(
          credentials.password,
          user.password!
        )

        if (!isPasswordValid) {
          console.log("Mot de passe invalide pour l'email:", credentials.email)
          throw new Error("Mot de passe incorrect")
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
      // Si l'utilisateur a un mot de passe temporaire, le rediriger vers la page de changement de mot de passe
      const session = await prisma.session.findFirst({
        orderBy: { expires: 'desc' },
        include: { user: true }
      })

      if (session?.user?.isTemporaryPassword) {
        return `${baseUrl}/auth/change-password`
      }

      if (url.includes("/auth/login")) {
        if (session?.user?.role === "ADMIN") {
          return `${baseUrl}/dashboard`
        } else {
          return `${baseUrl}/client`
        }
      }
      if (url.startsWith(baseUrl)) {
        return url
      }
      return `${baseUrl}/client`
    }
  }
} 