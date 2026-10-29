"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { ClientHeader } from "@/components/client/header"
import { ClientSidebar } from "@/components/client/sidebar"
import { cn } from "@/lib/utils"

const sidebarItems = [
  {
    title: "Vue d'ensemble",
    icon: "Home",
    href: "/client",
  },
  {
    title: "Mes rendez-vous",
    icon: "Calendar",
    href: "/client/appointments",
  },
  {
    title: "Documents",
    icon: "FileText",
    href: "/client/documents",
  },
  {
    title: "Messages",
    icon: "MessageSquare",
    href: "/client/messages",
  },
  {
    title: "Profil",
    icon: "User",
    href: "/client/profile",
  },
  {
    title: "Paramètres",
    icon: "Settings",
    href: "/client/settings",
  },
]

export function ClientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const pathname = usePathname()
  const currentTitle = sidebarItems.find(item => item.href === pathname)?.title || "Mon espace"

  return (
    <div className="h-screen flex flex-col bg-black">
      <ClientHeader 
        title={currentTitle}
        onOpenSidebar={() => setIsSidebarOpen(true)}
      />

      <ClientSidebar 
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main content */}
      <main className={cn(
        "flex-1 overflow-auto",
        "lg:pl-64 pt-16"
      )}>
        {children}
      </main>
    </div>
  )
} 