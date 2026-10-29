"use client"

import { motion } from "framer-motion"
import { usePathname, useRouter } from "next/navigation"
import { Phone, Home, Lightbulb, Users, X, Book, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { useState } from "react"
import { useSession } from "next-auth/react"

const navItems = [
  {
    name: "Accueil",
    href: "/",
    icon: Home
  },
  {
    name: "Services",
    href: "/services",
    icon: Lightbulb
  },
  {
    name: "Contact",
    href: "/contact",
    icon: Phone,
    isMain: true,
    action: "phone"
  },
  {
    name: "À propos",
    href: "/about",
    icon: Users
  },
  {
    name: "Compte",
    href: "/auth/login",
    icon: User,
    isAuth: true
  }
]

export function MobileTabNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const { data: session } = useSession()

  const handleNavClick = (item: typeof navItems[0]) => {
    if (item.action === "phone") {
      window.location.href = "tel:+33600000000"
      return
    }

    if (item.action === "menu") {
      setIsMenuOpen(!isMenuOpen)
      return
    }

    if (item.isAuth && session) {
      router.push("/client")
      return
    }

    router.push(item.href)
  }

  return (
    <>
      {/* Menu mobile plein écran */}
      {isMenuOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/95"
        >
          <button
            onClick={() => setIsMenuOpen(false)}
            className="absolute right-4 top-4 p-2 text-white hover:text-[#BFFF00]"
          >
            <X className="h-6 w-6" />
          </button>
          
          <div className="flex flex-col items-center gap-8">
            {navItems
              .filter(item => !item.action && !item.isAuth)
              .map((item) => (
                <button
                  key={item.name}
                  onClick={() => {
                    handleNavClick(item)
                    setIsMenuOpen(false)
                  }}
                  className="flex items-center gap-4 text-xl font-medium text-white hover:text-[#BFFF00] transition-colors"
                >
                  <item.icon className="h-6 w-6" />
                  {item.name}
                </button>
              ))}
          </div>
        </motion.div>
      )}

      {/* Barre de navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden pb-safe">
        <nav className="relative mx-4 mb-4 flex items-center justify-around rounded-2xl border border-white/10 bg-black/90 px-4 py-2 backdrop-blur-lg">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.isAuth && session && pathname.startsWith("/client"))

            if (item.isMain) {
              return (
                <button
                  key={item.name}
                  onClick={() => handleNavClick(item)}
                  className="relative -mt-8 flex flex-col items-center"
                >
                  <motion.div
                    whileTap={{ scale: 0.9 }}
                    className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-black bg-[#BFFF00] text-black shadow-lg"
                  >
                    <item.icon className="h-6 w-6" />
                  </motion.div>
                  <span className="mt-1 text-xs font-medium text-white">
                    {item.name}
                  </span>
                </button>
              )
            }

            if (item.isAuth) {
              return (
                <button
                  key={item.name}
                  onClick={() => handleNavClick(item)}
                  className="flex flex-col items-center py-2"
                >
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    className={cn(
                      "mb-1 flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                      isActive 
                        ? "bg-white/10 text-[#BFFF00]" 
                        : "text-gray-400 hover:text-white"
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                  </motion.div>
                  <span className={cn(
                    "text-xs font-medium",
                    isActive ? "text-white" : "text-gray-400"
                  )}>
                    {session ? "Compte" : "Connexion"}
                  </span>
                </button>
              )
            }

            return (
              <button
                key={item.name}
                onClick={() => handleNavClick(item)}
                className="flex flex-col items-center py-2"
              >
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  className={cn(
                    "mb-1 flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                    isActive 
                      ? "bg-white/10 text-[#BFFF00]" 
                      : "text-gray-400 hover:text-white"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                </motion.div>
                <span className={cn(
                  "text-xs font-medium",
                  isActive ? "text-white" : "text-gray-400"
                )}>
                  {item.name}
                </span>
              </button>
            )
          })}

          {/* Effet de brillance sur les bords */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-white/5 to-transparent pointer-events-none" />
        </nav>
      </div>
    </>
  )
} 