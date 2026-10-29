"use client"

import { useEffect } from "react"

/**
 * Radix portals (menus, dialogs, toasts) render under <body>, outside the shell.
 * While the CRM is mounted, the document switches to the light theme so they match;
 * the legacy back-office keeps its `dark` class when the user leaves.
 */
export function ThemeScope({ theme = "light" }: { theme?: "light" | "dark" }) {
  useEffect(() => {
    const root = document.documentElement
    const previous = root.className
    root.classList.remove("dark", "light")
    root.classList.add(theme)
    return () => {
      root.className = previous
    }
  }, [theme])
  return null
}
