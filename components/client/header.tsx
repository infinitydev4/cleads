"use client"

import Link from "next/link"
import { useSession, signOut } from "next-auth/react"
import { Menu, Bell, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface ClientHeaderProps {
  title: string
  onOpenSidebar: () => void
}

export function ClientHeader({ title, onOpenSidebar }: ClientHeaderProps) {
  const { data: session } = useSession()

  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-gray-950 border-b border-gray-800 z-40">
      <div className="flex h-full items-center px-4 lg:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden mr-2"
          onClick={onOpenSidebar}
        >
          <Menu className="h-6 w-6" />
          <span className="sr-only">Ouvrir le menu</span>
        </Button>

        <div className="flex-1">
          <h1 className="text-lg font-semibold">{title}</h1>
        </div>

        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon">
            <Bell className="h-5 w-5" />
            <span className="sr-only">Notifications</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <User className="h-5 w-5" />
                <span className="sr-only">Menu utilisateur</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-gray-950 border-gray-800">
              <DropdownMenuItem className="text-gray-400">
                {session?.user?.email}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/client/profile">Mon profil</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/client/settings">Paramètres</Link>
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="text-red-500"
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                Déconnexion
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
} 