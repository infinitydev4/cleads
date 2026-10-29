"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import type { NavGroup, NavItem } from "@/lib/crm/nav"

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname === href || pathname.startsWith(`${href}/`)
}

export function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname()
  const active = isActive(pathname, item.href)
  const Icon = item.icon
  const base = "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"

  if (item.soon) {
    return (
      <span
        aria-disabled="true"
        title="Bientôt disponible"
        className={cn(base, "cursor-not-allowed text-sidebar-muted/80")}
      >
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        <span className="flex-1">{item.label}</span>
        <span className="rounded-full border border-sidebar-border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-sidebar-muted">
          Bientôt
        </span>
      </span>
    )
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        base,
        active
          ? "bg-sidebar-accent text-sidebar-foreground"
          : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
      )}
    >
      {active && <span aria-hidden="true" className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-primary" />}
      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      {item.label}
    </Link>
  )
}

export function NavList({
  groups,
  footer,
  onNavigate,
}: {
  groups: NavGroup[]
  footer: NavItem[]
  onNavigate?: () => void
}) {
  return (
    <nav aria-label="Navigation principale" className="flex h-full flex-col gap-6 overflow-y-auto px-3 pb-4">
      {groups.map((group) => (
        <div key={group.id} className="space-y-1">
          {group.label && (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted/70">
              {group.label}
            </p>
          )}
          {group.items.map((item) => (
            <NavLink key={item.id} item={item} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
      {footer.length > 0 && (
        <div className="mt-auto space-y-1 border-t border-sidebar-border pt-4">
          {footer.map((item) => (
            <NavLink key={item.id} item={item} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </nav>
  )
}
