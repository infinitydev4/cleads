"use client"

import { BookingDialog } from "@/components/modal/booking-dialog"
import { HeroMarquee } from "@/components/home/hero-marquee"

export function HeroSection() {
  return (
    <section className="container relative px-4 py-12 md:py-20 overflow-hidden">
      <div className="relative flex items-center justify-between">
        <div className="max-w-2xl relative z-10">
        <div className="mb-8 inline-flex items-center rounded-full bg-[#BFFF00]/10 px-3 py-1.5 text-[#BFFF00]">
        <div className="mr-2 h-1.5 w-1.5 rounded-full bg-[#BFFF00]"></div>
            <span className="whitespace-nowrap text-xs sm:text-sm">
              Pour SaaS / Agence / Infopreneur / E-commerce
            </span>
          </div>

          <h1 className="mb-8 text-4xl font-bold tracking-tight md:text-6xl">
            FAIS EXPLOSER TON TAUX DE CONVERSION AVEC CLEADS
          </h1>

          <ul className="mb-8 space-y-2 text-left text-gray-300">
            <li className="flex items-start">
              <span className="mr-2 text-[#BFFF00]">•</span>
              Création de Landing Page en 72 heures.
            </li>
            <li className="flex items-start">
              <span className="mr-2 text-[#BFFF00]">•</span>
              Copywriting adapté à votre audience.
            </li>
            <li className="flex items-start">
              <span className="mr-2 text-[#BFFF00]">•</span>
              Des pages qui persuadent même les plus frileux de vos prospects.
            </li>
          </ul>

          <BookingDialog />
        </div>

        {/* Marquee vertical de réalisations */}
        <div className="hidden xl:block absolute -right-20 top-1/2 -translate-y-1/2">
          <HeroMarquee />
        </div>
      </div>

      {/* Ajout d'un dégradé en bas pour masquer le débordement */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black to-transparent"></div>
    </section>
  )
} 