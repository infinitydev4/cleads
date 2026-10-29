import { Role } from "@prisma/client"
import NextAuth from "next-auth"

declare module "next-auth" {
  interface User {
    id: string
    role: Role
    isTemporaryPassword: boolean
  }

  interface Session {
    user: User & {
      id: string
      role: Role
      isTemporaryPassword: boolean
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: Role
  }
} 