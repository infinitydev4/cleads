"use client"

import { VelocityScroll } from "@/components/magicui/scroll-based-velocity"

export function ScrollingTextSection() {
  return (
    <section className="relative  overflow-hidden bg-black">
      {/* Dégradés pour l'effet de fondu sur les côtés */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1/6 bg-gradient-to-r from-black z-10"></div>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1/6 bg-gradient-to-l from-black z-10"></div>

      <div className="flex flex-col gap-4">
        <VelocityScroll defaultVelocity={2} className="text-white">
          LANDING PAGE <span className="text-[#BFFF00]">•</span> CONVERSION <span className="text-[#BFFF00]">•</span> COPYWRITING <span className="text-[#BFFF00]">•</span> DESIGN <span className="text-[#BFFF00]">•</span> PERFORMANCE
        </VelocityScroll>
      </div>
    </section>
  )
} 