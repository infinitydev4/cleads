"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import Image from "next/image"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"
import { 
  Home,
  Calendar,
  FileText,
  MessageSquare,
  User,
  Settings,
  X
} from "lucide-react"

const sidebarItems = [
  {
    title: "Vue d'ensemble",
    icon: Home,
    href: "/client",
  },
  {
    title: "Mes rendez-vous",
    icon: Calendar,
    href: "/client/appointments",
  },
  {
    title: "Documents",
    icon: FileText,
    href: "/client/documents",
  },
  {
    title: "Messages",
    icon: MessageSquare,
    href: "/client/messages",
  },
  {
    title: "Profil",
    icon: User,
    href: "/client/profile",
  },
  {
    title: "Paramètres",
    icon: Settings,
    href: "/client/settings",
  },
]

interface ClientSidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function ClientSidebar({ isOpen, onClose }: ClientSidebarProps) {
  const pathname = usePathname()

  const SidebarContent = () => (
    <div className="flex flex-col flex-1 gap-2">
      {sidebarItems.map((item) => {
        const isActive = pathname === item.href
        const Icon = item.icon

        return (
          <Button
            key={item.href}
            variant="ghost"
            className={cn(
              "justify-start gap-3 px-3",
              isActive && "bg-gray-900 text-[#BFFF00]"
            )}
            asChild
          >
            <Link href={item.href}>
              <Icon className="h-5 w-5" />
              {item.title}
            </Link>
          </Button>
        )
      })}
    </div>
  )

  return (
    <>
      {/* Sidebar mobile */}
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent 
          side="left" 
          className="w-64 p-0 bg-gray-950 border-r border-gray-800"
        >
          <VisuallyHidden asChild>
            <DialogPrimitive.Title>Menu de navigation</DialogPrimitive.Title>
          </VisuallyHidden>
          <div className="flex flex-col h-full px-3 py-4">
            <div className="flex justify-center mb-4">
              <Image 
                src="/logo-white.svg" 
                alt="Logo" 
                width={100} 
                height={40} 
                priority
                style={{ width: 'auto', height: 'auto' }}
              />
            </div>
            <SidebarContent />
          </div>
        </SheetContent>
      </Sheet>

      {/* Sidebar desktop */}
      <motion.aside
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="fixed hidden lg:flex flex-col w-64 h-screen pt-16 bg-gray-950 border-r border-gray-800"
      >
        <div className="flex flex-col flex-1 px-3 py-4">
          <div className="flex justify-center mb-6">
            <Image 
              src="/logo-white.svg" 
              alt="Logo" 
              width={150} 
              height={40} 
              priority
              style={{ width: 'auto', height: 'auto' }}
            />
          </div>
          <SidebarContent />
        </div>
      </motion.aside>
    </>
  )
} 