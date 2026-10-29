"use client"

import { useSession } from "next-auth/react"
import { redirect } from "next/navigation"

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { status } = useSession()

  if (status === "loading") {
    return null
  }

  if (status === "unauthenticated") {
    redirect("/auth/signin")
  }

  return (
    <div className="min-h-screen bg-black">
      <main className="container mx-auto">
        {children}
      </main>
    </div>
  )
} 