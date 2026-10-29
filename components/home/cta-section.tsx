"use client"

import { motion } from "framer-motion"
import { BookingDialog } from "@/components/modal/booking-dialog"

export function CTASection() {
  return (
    <section className="py-16 md:py-24 relative overflow-hidden">
      {/* Fond avec effet de grain */}
      <div 
        className="absolute inset-0 opacity-20" 
        style={{ backgroundImage: 'url("/noise.png")' }}
      />

      <div className="container px-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-3xl rounded-2xl border border-[#BFFF00] bg-black/40 backdrop-blur-sm p-6 md:p-12 text-center relative"
        >
          {/* Éléments décoratifs */}
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-[#BFFF00]/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-[#BFFF00]/10 rounded-full blur-3xl" />

          <motion.h2 
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-4 md:mb-6 text-2xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent"
          >
            PRÊT À BOOSTER VOS CONVERSIONS ?
          </motion.h2>

          <motion.p 
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mb-6 md:mb-8 text-base md:text-xl text-gray-300"
          >
            Réservez un appel gratuit de 30 minutes pour discuter de votre projet et découvrir comment nous pouvons
            vous aider.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="flex justify-center"
          >
            <BookingDialog />
          </motion.div>

          {/* Indicateur de confiance */}
          <motion.p 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-4 text-xs md:text-sm text-gray-400"
          >
            100% gratuit • Sans engagement • Réponse en 24h
          </motion.p>
        </motion.div>
      </div>
    </section>
  )
} 