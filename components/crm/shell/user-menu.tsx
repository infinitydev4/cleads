"use client"

import Link from "next/link"
import { signOut } from "next-auth/react"
import { ChevronsUpDown, LogOut, Settings } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ROLE_LABELS, type CrmRole } from "@/lib/crm/roles"

export interface ShellUser {
  name: string
  email: string
  image?: string | null
  role: CrmRole
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "CL"

export function UserMenu({ user, variant = "sidebar" }: { user: ShellUser; variant?: "sidebar" | "topbar" }) {
  const trigger =
    variant === "sidebar" ? (
      <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-sidebar-accent/60 focus-visible:ring-2 focus-visible:ring-primary">
        <Avatar className="h-8 w-8">
          <AvatarImage src={user.image ?? undefined} alt="" />
          <AvatarFallback className="bg-sidebar-accent text-xs font-semibold text-sidebar-foreground">{initials(user.name)}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-sidebar-foreground">{user.name}</span>
          <span className="block truncate text-xs text-sidebar-muted">{ROLE_LABELS[user.role]}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 text-sidebar-muted" aria-hidden="true" />
      </button>
    ) : (
      <button aria-label="Menu du compte" className="rounded-full focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar className="h-9 w-9">
          <AvatarImage src={user.image ?? undefined} alt="" />
          <AvatarFallback className="bg-sidebar text-xs font-semibold text-sidebar-foreground">{initials(user.name)}</AvatarFallback>
        </Avatar>
      </button>
    )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={variant === "sidebar" ? "start" : "end"} className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/settings">
            <Settings className="mr-2 h-4 w-4" aria-hidden="true" /> Mon profil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => signOut({ callbackUrl: "/auth/login" })}>
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" /> Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
