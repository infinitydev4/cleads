"use client"

import { useState } from "react"
import Link from "next/link"
import { Menu, Phone, User } from "lucide-react"
import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

export function MobileNav() {
  const [open, setOpen] = useState(false)
  const { data: session } = useSession()

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-6 w-6" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full max-w-xs bg-black p-0">
        <SheetHeader className="border-b border-gray-800 p-4">
          <SheetTitle className="text-white">Menu</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="services" className="border-b border-gray-800">
              <AccordionTrigger className="px-4 py-3 text-white hover:bg-gray-900">Nos services</AccordionTrigger>
              <AccordionContent className="bg-gray-900/50">
                <div className="flex flex-col">
                  <Link href="/services/saas" className="px-4 py-2 text-gray-300 hover:text-white" onClick={() => setOpen(false)}>
                    Landing Page SaaS
                  </Link>
                  <Link href="/services/ecommerce" className="px-4 py-2 text-gray-300 hover:text-white" onClick={() => setOpen(false)}>
                    E-commerce
                  </Link>
                  <Link href="/services/b2b" className="px-4 py-2 text-gray-300 hover:text-white" onClick={() => setOpen(false)}>
                    B2B
                  </Link>
                  <Link href="/services/web" className="px-4 py-2 text-gray-300 hover:text-white" onClick={() => setOpen(false)}>
                    Développement Web
                  </Link>
                  <Link href="/services/seo" className="px-4 py-2 text-gray-300 hover:text-white" onClick={() => setOpen(false)}>
                    SEO
                  </Link>
                  <Link href="/services/performance" className="px-4 py-2 text-gray-300 hover:text-white" onClick={() => setOpen(false)}>
                    Performance
                  </Link>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          <Link
            href="/realisations"
            className="border-b border-gray-800 px-4 py-3 text-white hover:bg-gray-900"
            onClick={() => setOpen(false)}
          >
            Réalisations
          </Link>
          <Link
            href="/tarifs"
            className="border-b border-gray-800 px-4 py-3 text-white hover:bg-gray-900"
            onClick={() => setOpen(false)}
          >
            Tarifs
          </Link>
          <Link
            href="/about"
            className="border-b border-gray-800 px-4 py-3 text-white hover:bg-gray-900"
            onClick={() => setOpen(false)}
          >
            À propos
          </Link>
          <Link
            href="/contact"
            className="border-b border-gray-800 px-4 py-3 text-white hover:bg-gray-900"
            onClick={() => setOpen(false)}
          >
            Contact
          </Link>
          {session ? (
            <Link
              href="/client"
              className="border-b border-gray-800 px-4 py-3 text-white hover:bg-gray-900"
              onClick={() => setOpen(false)}
            >
              Mon compte
            </Link>
          ) : (
            <Link
              href="/auth/login"
              className="border-b border-gray-800 px-4 py-3 text-white hover:bg-gray-900"
              onClick={() => setOpen(false)}
            >
              Connexion
            </Link>
          )}
        </div>
        <div className="p-4">
          <Button className="w-full bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90">
            <Phone className="mr-2 h-4 w-4" />
            Réserver un appel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

