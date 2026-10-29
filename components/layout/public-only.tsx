"use client"

import { usePathname } from "next/navigation"

const PRIVATE_PREFIXES = ["/app", "/dashboard", "/auth"]

/** Analytics and the cookie banner belong to the public site, never to the back-office. */
export function PublicOnly({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ""
  const isPrivate = PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  return isPrivate ? null : <>{children}</>
}
