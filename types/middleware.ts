import { NextRequest, NextResponse } from "next/server"
import { JWT } from "next-auth/jwt"

export interface MiddlewareRequest extends NextRequest {
  nextauth: {
    token: JWT | null
  }
}

export interface MiddlewareResponse extends NextResponse {
  headers: Headers
}

export interface MiddlewareConfig {
  matcher: string[]
  callbacks: {
    authorized: (params: { token: JWT | null }) => boolean
  }
  pages: {
    signIn: string
  }
} 