"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { Header } from "@/components/dashboard/header"
import { Sidebar } from "@/components/dashboard/sidebar"
import { cn } from "@/lib/utils"

const sidebarItems = [
  {
    title: "Vue d'ensemble",
    icon: "BarChart",
    href: "/dashboard",
  },
  {
    title: "Rendez-vous",
    icon: "Calendar",
    href: "/dashboard/appointments",
  },
  {
    title: "Clients",
    icon: "Users",
    href: "/dashboard/clients",
  },
  {
    title: "Disponibilités",
    icon: "Clock",
    href: "/dashboard/availability",
  },
  {
    title: "Exceptions",
    icon: "Calendar",
    href: "/dashboard/exceptions",
  },
  {
    title: "Billing",
    icon: "FileText",
    href: "/dashboard/billing",
  },
  {
    title: "Blog",
    icon: "Book",
    href: "/dashboard/blog",
  },
  {
    title: "Paramètres",
    icon: "Settings",
    href: "/dashboard/settings",
  },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const pathname = usePathname()
  const currentTitle = sidebarItems.find(item => item.href === pathname)?.title || "Dashboard"

  return (
    <div className="h-screen flex flex-col bg-black">
      <Header 
        title={currentTitle}
        onOpenSidebar={() => setIsSidebarOpen(true)}
      />

      <Sidebar 
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