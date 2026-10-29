"use client"

import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Phone } from "lucide-react"
import Image from "next/image"
import { BookingDialog } from "@/components/modal/booking-dialog"
const stats = [
  { number: "200+", label: "Projets livrés" },
  { number: "30%", label: "Taux conversion" },
  { number: "72h", label: "Délai de livraison" },
  { number: "98%", label: "Clients satisfaits" }
]

export function HeroSection() {
  return (
    <section className="relative py-16 md:py-32 overflow-hidden">
      {/* Effets de lumière */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-64 md:w-96 h-64 md:h-96 bg-[#BFFF00]/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-64 md:w-96 h-64 md:h-96 bg-purple-500/20 rounded-full blur-[120px]" />
      </div>

      {/* Effet de grain */}
      <div 
        className="absolute inset-0 opacity-20 mix-blend-overlay" 
        style={{ backgroundImage: 'url("/noise.png")' }}
      />
      
      <div className="container relative px-4">
        <div className="grid gap-8 lg:gap-12 lg:grid-cols-2 items-center">
          {/* Contenu */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative z-10"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="inline-flex items-center rounded-full bg-[#BFFF00]/10 px-3 py-1.5 mb-4 md:mb-6"
            >
              <div className="mr-2 h-1.5 w-1.5 rounded-full bg-[#BFFF00]" />
              <span className="text-[#BFFF00] font-medium">Notre équipe</span>
            </motion.div>

            <h1 className="text-3xl md:text-4xl lg:text-6xl font-bold mb-4 md:mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500">
              Experts en Landing Pages Performantes
            </h1>

            <p className="text-base md:text-lg text-gray-400 mb-6 md:mb-8 leading-relaxed">
              Nous créons des landing pages qui convertissent vos visiteurs en clients, 
              avec un processus éprouvé et une expertise reconnue dans l'optimisation 
              des taux de conversion.
            </p>

            <BookingDialog />
          </motion.div>

          {/* Image avec effet */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="relative h-[400px] md:h-[500px] lg:h-[600px] mt-6 lg:mt-0"
          >
            <div className="relative h-full rounded-2xl overflow-hidden">
              <Image
                src="/team-cleads.svg"
                alt="L'équipe Cleads"
                fill
                className="object-cover"
                priority
              />
              {/* Dégradé superposé */}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/50 to-black" />
              
              {/* Effet de brillance */}
              <div className="absolute inset-0 bg-gradient-to-tr from-[#BFFF00]/10 via-transparent to-purple-500/10" />
            </div>

            {/* Stats avec style fixe (pas de flottement) */}
            <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 w-[90%] max-w-full">
              <div className="bg-gray-950/80 backdrop-blur-xl rounded-2xl p-3 md:p-6 border border-gray-800">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {stats.map((stat, index) => (
                    <div key={index} className="text-center">
                      <div className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-[#BFFF00]">{stat.number}</div>
                      <div className="text-[10px] sm:text-xs md:text-sm text-gray-400">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
} 