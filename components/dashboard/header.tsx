"use client"

import { Bell, ChevronDown, LogOut, Menu, Settings, User } from "lucide-react"
import { useRouter, usePathname } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import { useNotifications } from "@/hooks/useNotifications"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface HeaderProps {
  title: string
  onOpenSidebar: () => void
}

export function Header({ title, onOpenSidebar }: HeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: session } = useSession()
  const { notifications, unreadCount, markAllAsRead } = useNotifications()

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/login" })
  }

  return (
    <>
      {/* Desktop header */}
      <header className="hidden lg:flex fixed top-0 right-0 left-64 z-40 h-16 items-center justify-between border-b border-gray-800 bg-gray-950 px-6">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
        </div>

        <div className="flex items-center gap-4">
          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger className="relative">
              <div className="p-2 hover:bg-gray-900 rounded-lg transition-colors">
                <Bell className="w-5 h-5 text-gray-400" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-[#BFFF00] rounded-full" />
                )}
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 bg-gray-950 border border-gray-800 text-white p-2">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-gray-800" />
              <div className="max-h-80 overflow-auto">
                {notifications.length === 0 ? (
                  <p className="text-sm text-gray-400 p-3">Aucune notification</p>
                ) : (
                  notifications.map((notification) => (
                    <DropdownMenuItem key={notification.id} className="flex items-start gap-4 p-3 cursor-pointer hover:bg-gray-900">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        notification.read ? "bg-gray-800" : "bg-[#BFFF00]/20"
                      }`}>
                        <Bell className={`h-4 w-4 ${notification.read ? "text-gray-400" : "text-[#BFFF00]"}`} />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{notification.title}</p>
                        <p className="text-xs text-gray-400">{notification.message}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(notification.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </DropdownMenuItem>
                  ))
                )}
              </div>
              {unreadCount > 0 && (
                <>
                  <DropdownMenuSeparator className="bg-gray-800" />
                  <DropdownMenuItem
                    className="text-[#BFFF00] hover:text-[#BFFF00] hover:bg-[#BFFF00]/10 cursor-pointer"
                    onClick={markAllAsRead}
                  >
                    Tout marquer comme lu
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Profile */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 hover:bg-gray-900 rounded-lg p-2 transition-colors">
              <Avatar className="h-8 w-8">
                <AvatarImage src={session?.user?.image || ""} alt={session?.user?.name || ""} />
                <AvatarFallback className="bg-[#BFFF00]/20 text-[#BFFF00]">
                  {session?.user?.name?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium text-white">{session?.user?.name || "Utilisateur"}</p>
                <p className="text-xs text-gray-400">{session?.user?.email}</p>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-gray-950 border border-gray-800 text-white">
              <DropdownMenuLabel>Mon compte</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-gray-800" />
              <DropdownMenuItem 
                className="hover:bg-gray-900"
                onClick={() => router.push('/dashboard/settings')}
              >
                <Settings className="mr-2 h-4 w-4" />
                <span>Paramètres</span>
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="text-red-400 hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                onClick={handleSignOut}
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Déconnexion</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-gray-950 border-b border-gray-800">
        <div className="flex items-center justify-between px-4 h-16">
          <button
            onClick={onOpenSidebar}
            className="p-2 hover:bg-gray-800 rounded-lg"
          >
            <Menu className="w-6 h-6 text-white" />
          </button>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Avatar className="h-8 w-8">
                <AvatarImage src={session?.user?.image || ""} alt={session?.user?.name || ""} />
                <AvatarFallback className="bg-[#BFFF00]/20 text-[#BFFF00]">
                  {session?.user?.name?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-gray-950 border border-gray-800 text-white">
              <DropdownMenuItem className="hover:bg-gray-900">
                <Bell className="mr-2 h-4 w-4" />
                <span>Notifications</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-gray-800" />
              <DropdownMenuItem 
                className="hover:bg-gray-900"
                onClick={() => router.push('/dashboard/settings')}
              >
                <Settings className="mr-2 h-4 w-4" />
                <span>Paramètres</span>
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="text-red-400 hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                onClick={handleSignOut}
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Déconnexion</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    </>
  )
} 