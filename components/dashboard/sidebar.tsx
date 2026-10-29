"use client"

import { X, LogOut, BarChart, Calendar, Users, Clock, FileText, Book, Settings, Palette } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { signOut } from "next-auth/react"
import { cn } from "@/lib/utils"
import Image from "next/image"

const sidebarItems = [
  {
    title: "Vue d'ensemble",
    icon: BarChart,
    href: "/dashboard",
  },
  {
    title: "Rendez-vous",
    icon: Calendar,
    href: "/dashboard/appointments",
  },
  {
    title: "Clients",
    icon: Users,
    href: "/dashboard/clients",
  },
  {
    title: "Disponibilités",
    icon: Clock,
    href: "/dashboard/availability",
  },
  {
    title: "Exceptions",
    icon: Calendar,
    href: "/dashboard/exceptions",
  },
  {
    title: "Billing",
    icon: FileText,
    href: "/dashboard/billing",
  },
  {
    title: "Blog",
    icon: Book,
    href: "/dashboard/blog",
  },
  {
    title: "Thèmes",
    icon: Palette,
    href: "/dashboard/themes",
  },
  {
    title: "Paramètres",
    icon: Settings,
    href: "/dashboard/settings",
  },
]

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const handleSignOut = async () => {
    await signOut({ redirect: false })
    router.push("/auth/login")
  }

  return (
    <aside
      className={cn(
        "fixed top-0 left-0 z-50 h-full w-64 bg-gray-950 border-r border-gray-800 p-4",
        "lg:translate-x-0 transition-transform duration-200 ease-in-out",
        !isOpen && "-translate-x-full"
      )}
    >
      <div className="flex items-center justify-between h-16 mb-8">
        <Link href="/dashboard" className="flex items-center">
          <span className="font-bold text-xl text-white">
            <Image 
              src="/logo-white.svg" 
              alt="Logo" 
              width={150} 
              height={40} 
              style={{ width: 'auto', height: 'auto' }}
            />
          </span>
        </Link>
        <button
          onClick={onClose}
          className="lg:hidden p-2 hover:bg-gray-800 rounded-lg"
        >
          <X className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      <nav className="space-y-2">
        {sidebarItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              pathname === item.href 
                ? "bg-[#BFFF00]/10 text-[#BFFF00]" 
                : "text-gray-400 hover:bg-gray-900 hover:text-white"
            )}
          >
            <item.icon className="w-5 h-5" />
            {item.title}
          </Link>
        ))}
      </nav>

      {/* Sidebar logout button */}
      <div className="absolute bottom-4 left-4 right-4">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium w-full
            text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          Déconnexion
        </button>
      </div>
    </aside>
  )
} 