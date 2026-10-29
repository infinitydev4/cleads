"use client"

import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { MobileTabNav } from "@/components/mobile-tab-nav"
import { usePathname } from "next/navigation"

export function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isDashboard = pathname?.startsWith('/dashboard')
  const isClient = pathname?.startsWith('/client')

  return (
    <>
      {!isDashboard && !isClient && <Header />}
      <main className="pt-[42px] md:pt-12">
        {children}
      </main>
      {!isDashboard && !isClient && (
        <>
          <Footer />
          <MobileTabNav />
        </>
      )}
    </>
  )
} 