"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Bell, Menu, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { allNavItems, navFor } from "@/lib/crm/nav"
import { useNotifications } from "@/hooks/useNotifications"
import { NavList } from "./nav-list"
import { UserMenu, type ShellUser } from "./user-menu"
import { CommandPalette, useCommandShortcut } from "./command-palette"
import { ThemeScope } from "./theme-scope"

function Logo() {
  return (
    <Link href="/app" aria-label="Cleads, accueil du CRM" className="inline-flex px-3 py-1">
      <Image src="/logo-white.svg" alt="" width={120} height={22} priority style={{ height: 22, width: "auto" }} />
    </Link>
  )
}

function Notifications() {
  const { notifications, unreadCount, markAllAsRead } = useNotifications()
  return (
    <DropdownMenu onOpenChange={(open) => open && unreadCount > 0 && markAllAsRead()}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={unreadCount ? `Notifications, ${unreadCount} non lues` : "Notifications"} className="relative">
          <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
          {unreadCount > 0 && <span aria-hidden="true" className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">Rien de nouveau.</p>
        ) : (
          <ul className="max-h-80 overflow-auto">
            {notifications.map((n) => (
              <li key={n.id} className="rounded-md px-2 py-2 text-sm hover:bg-accent">
                <p className="font-medium">{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.message}</p>
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  useCommandShortcut(setPaletteOpen)
  const { groups, footer } = navFor(user.role)

  return (
    <div className="crm-shell light min-h-screen bg-background text-foreground">
      <ThemeScope />
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Aller au contenu
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-16 items-center">
          <Logo />
        </div>
        <div className="min-h-0 flex-1 pt-2">
          <NavList groups={groups} footer={footer} />
        </div>
        <div className="border-t border-sidebar-border p-3">
          <UserMenu user={user} />
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur sm:px-6 lg:px-8">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Ouvrir le menu">
                <Menu className="h-5 w-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 border-r-0 bg-sidebar p-0 pt-4 text-sidebar-foreground [&>button]:text-sidebar-foreground">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <Logo />
              <div className="mt-4 h-[calc(100%-5rem)]">
                <NavList groups={groups} footer={footer} onNavigate={() => setMenuOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <button
            onClick={() => setPaletteOpen(true)}
            className="flex h-10 min-w-0 max-w-md flex-1 items-center gap-3 rounded-lg border border-input bg-card px-3 text-sm text-muted-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">Rechercher ou aller à…</span>
            <kbd className="ml-auto hidden rounded border bg-muted px-1.5 py-0.5 text-[11px] sm:inline">⌘K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <Notifications />
            <div className="lg:hidden">
              <UserMenu user={user} variant="topbar" />
            </div>
          </div>
        </header>

        <main id="contenu" tabIndex={-1} className="mx-auto w-full max-w-[1400px] px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>

      <CommandPalette items={allNavItems(user.role)} open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}
