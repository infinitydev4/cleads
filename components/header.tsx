"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { Phone, ChevronDown, Rocket, Target, LineChart, Code, Globe, Zap, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MobileNav } from "@/components/mobile-nav"
import { useSession } from "next-auth/react"

const services = [
  {
    category: "Landing Pages",
    items: [
      {
        title: "Landing Page SaaS",
        description: "Convertissez plus de visiteurs en clients",
        icon: Rocket,
        href: "/services/saas",
        image: "/services/saas.png"
      },
      {
        title: "E-commerce",
        description: "Augmentez vos ventes en ligne",
        icon: LineChart,
        href: "/services/ecommerce",
        image: "/services/ecommerce.png"
      },
      {
        title: "B2B",
        description: "Générez des leads qualifiés",
        icon: Target,
        href: "/services/b2b",
        image: "/services/b2b.png"
      }
    ]
  },
  {
    category: "Services Complémentaires",
    items: [
      {
        title: "Développement Web",
        description: "Sites web sur mesure",
        icon: Code,
        href: "/services/web",
        image: "/services/developpement-web.png"
      },
      {
        title: "SEO",
        description: "Optimisation pour les moteurs",
        icon: Globe,
        href: "/services/seo",
        image: "/services/seo.png"
      },
      {
        title: "Performance",
        description: "Optimisation de la conversion",
        icon: Zap,
        href: "/services/performance",
        image: "/services/performance.png"
      }
    ]
  }
]

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const { data: session } = useSession()
  const menuRef = useRef<HTMLDivElement>(null)

  // Gestionnaire pour fermer le menu quand on clique en dehors
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  // Fonction pour fermer le menu après avoir cliqué sur un lien
  const handleLinkClick = () => {
    setIsMenuOpen(false)
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-lg border-b border-white/10">
      <div className="container px-4">
        <div className="flex h-[72px] md:h-20 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="relative h-8 w-auto">
              <Image
                src="/logo-white.svg"
                alt="Cleads Logo"
                width={182}
                height={40}
                priority
              />
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            <div className="relative group" ref={menuRef}>
              <button 
                className="flex items-center gap-1 text-gray-300 hover:text-white"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              >
                Nos services
                <ChevronDown className="h-4 w-4" />
              </button>

              <AnimatePresence>
                {isMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute top-full left-0 w-[800px] bg-black/95 backdrop-blur-xl rounded-xl border border-white/10 shadow-2xl p-6 grid grid-cols-2 gap-8"
                  >
                    {services.map((category) => (
                      <div key={category.category}>
                        <h3 className="text-sm font-medium text-gray-400 mb-4">
                          {category.category}
                        </h3>
                        <div className="space-y-4">
                          {category.items.map((item) => (
                            <Link
                              key={item.title}
                              href={item.href}
                              className="group flex gap-4 p-3 rounded-lg hover:bg-white/5 transition-colors"
                              onClick={handleLinkClick}
                            >
                              <div className="relative w-24 h-16 rounded-lg overflow-hidden">
                                <Image
                                  src={item.image}
                                  alt={item.title}
                                  fill
                                  className="object-cover transition-transform group-hover:scale-110"
                                />
                              </div>
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <item.icon className="h-4 w-4 text-[#BFFF00]" />
                                  <h4 className="font-medium text-white group-hover:text-[#BFFF00]">
                                    {item.title}
                                  </h4>
                                </div>
                                <p className="text-sm text-gray-400">
                                  {item.description}
                                </p>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* Effet de brillance */}
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <Link href="/tarifs" className="text-gray-300 hover:text-white">
              Tarifs
            </Link>
            <Link href="/about" className="text-gray-300 hover:text-white">
              À propos
            </Link>
            <Link href="/realisations" className="text-gray-300 hover:text-white">
              Réalisations
            </Link>
            <Link href="/contact" className="text-gray-300 hover:text-white">
              Contact
            </Link>
          </nav>

          <div className="flex items-center gap-4">
            {session ? (
              <Button 
                asChild
                className="hidden md:flex items-center gap-2 relative bg-black text-[#BFFF00] border-2 border-[#BFFF00] 
                shadow-[4px_4px_0px_0px_#BFFF00] 
                transition-all duration-200 
                hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#BFFF00]
                active:translate-x-[4px] active:translate-y-[4px] active:shadow-none hover:bg-[#BFFF00] hover:text-black"
              >
                <Link href="/client">
                  <User className="h-4 w-4 mr-2" />
                  Mon compte
                </Link>
              </Button>
            ) : (
              <Button 
                asChild
                className="hidden md:flex items-center gap-2 relative bg-black text-[#BFFF00] border-2 border-[#BFFF00] 
                shadow-[4px_4px_0px_0px_#BFFF00] 
                transition-all duration-200 
                hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#BFFF00]
                active:translate-x-[4px] active:translate-y-[4px] active:shadow-none hover:bg-[#BFFF00] hover:text-black"
              >
                <Link href="/auth/login">
                  <User className="h-4 w-4 mr-2" />
                  Connexion
                </Link>
              </Button>
            )}
            <MobileNav />
          </div>
        </div>
      </div>
    </header>
  )
}

