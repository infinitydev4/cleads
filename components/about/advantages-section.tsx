"use client"

import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Gauge, Smartphone, Search, Target, Rocket } from "lucide-react"

const advantages = [
  {
    icon: Gauge,
    title: "Performance Garantie",
    description: "Scores parfaits sur Google PageSpeed Insights et GTmetrix. Chargement ultra-rapide garanti.",
    color: "#BFFF00"
  },
  {
    icon: Smartphone,
    title: "Mobile-First",
    description: "Design responsive optimisé pour tous les appareils, avec une expérience utilisateur fluide.",
    color: "#0EA5E9"
  },
  {
    icon: Search,
    title: "SEO Optimisé",
    description: "Structure technique parfaite pour le référencement naturel et une visibilité maximale.",
    color: "#8B5CF6"
  },
  {
    icon: Target,
    title: "Conversion Maximale",
    description: "Tunnels de vente optimisés pour convertir vos visiteurs en clients fidèles.",
    color: "#F43F5E"
  }
]

export function AdvantagesSection() {
  return (
    <section className="py-16 md:py-20 relative overflow-hidden">
      {/* Effets de lumière */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-1/4 w-64 md:w-96 h-64 md:h-96 bg-[#BFFF00]/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 w-64 md:w-96 h-64 md:h-96 bg-purple-500/10 rounded-full blur-[120px]" />
      </div>

      <div className="container px-4">
        <div className="text-center mb-10 md:mb-16">
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center rounded-full bg-[#BFFF00]/10 px-3 py-1.5 mb-4 md:mb-6"
          >
            <div className="mr-2 h-1.5 w-1.5 rounded-full bg-[#BFFF00]" />
            <span className="text-[#BFFF00] font-medium">Nos avantages</span>
          </motion.div>

          <h2 className="text-2xl md:text-3xl lg:text-5xl font-bold mb-4 md:mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500">
            Pourquoi nous choisir ?
          </h2>
          <p className="text-sm md:text-base text-gray-400 max-w-2xl mx-auto">
            Nous nous démarquons par notre engagement à fournir des landing pages
            ultra-performantes et optimisées pour la conversion.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          {advantages.map((advantage, index) => (
            <motion.div
              key={advantage.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group bg-gray-950 rounded-xl p-5 md:p-6 border border-gray-800 hover:border-[#BFFF00] transition-all"
            >
              <div 
                className="w-10 h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center mb-4 md:mb-6"
                style={{ backgroundColor: `${advantage.color}20` }}
              >
                <advantage.icon 
                  className="w-5 h-5 md:w-6 md:h-6 transition-transform group-hover:scale-110" 
                  style={{ color: advantage.color }}
                />
              </div>

              <h3 className="text-lg md:text-xl font-semibold mb-2 md:mb-3 text-white group-hover:text-[#BFFF00] transition-colors">
                {advantage.title}
              </h3>

              <p className="text-sm md:text-base text-gray-400">
                {advantage.description}
              </p>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-10 md:mt-16 text-center"
        >
          <Button 
            size="lg"
            variant="3d"
            className="group"
          >
            <span className="flex items-center gap-2">
              <Rocket className="w-4 h-4 md:w-5 md:h-5" />
              Démarrer votre projet
            </span>
          </Button>
        </motion.div>
      </div>
    </section>
  )
} 