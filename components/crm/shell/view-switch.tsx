"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { HQ_PATH } from "@/lib/crm/hq-window"
import { cn } from "@/lib/utils"

const LAST_2D = "cleads.last2d"

/** Where "2D" leads back to: the last 2D page of this tab, else the home page. */
function readLast2d() {
  try {
    return sessionStorage.getItem(LAST_2D) || "/app"
  } catch {
    return "/app"
  }
}

/**
 * The 2D / 3D selector of the CRM (E16). Two links, not a toggle button: each view has its own address, the back
 * button works, and "2D" returns to the page you left.
 */
export function ViewSwitch({ tone = "light", className }: { tone?: "light" | "dark"; className?: string }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const in3d = pathname === HQ_PATH
  const [back, setBack] = useState("/app")

  useEffect(() => {
    if (in3d) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is only readable after mount
      setBack(readLast2d())
      return
    }
    const here = `${pathname}${params.size ? `?${params}` : ""}`
    try {
      sessionStorage.setItem(LAST_2D, here)
    } catch {
      // Storage refused (private mode): "2D" then goes to the home page.
    }
  }, [in3d, pathname, params])

  const item = (active: boolean) =>
    cn(
      "inline-flex h-8 min-w-11 items-center justify-center rounded-md px-3 text-xs font-bold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active
        ? "bg-primary text-primary-foreground shadow-sm"
        : tone === "dark"
          ? "text-sidebar-foreground hover:bg-sidebar-accent"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
    )
  return (
    <nav aria-label="Vue du CRM" className={cn("flex items-center gap-0.5 rounded-lg border p-0.5", tone === "dark" ? "border-sidebar-border bg-sidebar-accent/60" : "bg-card", className)}>
      {/* data-hq-leave: in 3D, the one link that really leaves the view rather than opening a window. */}
      <Link href={in3d ? back : pathname} data-hq-leave aria-current={!in3d ? "page" : undefined} className={item(!in3d)} title="Vue classique">
        2D
      </Link>
      <Link href={HQ_PATH} aria-current={in3d ? "page" : undefined} className={item(in3d)} title="Vue 3D isométrique">
        3D
      </Link>
    </nav>
  )
}
