"use client"

import { motion } from "framer-motion"
import { CircularProgress } from "@/components/ui/circular-progress"
import { Zap, Sparkles, Shield, Search } from "lucide-react"

const metrics = [
  {
    name: "Performance",
    score: 100,
    icon: Zap,
    color: "#BFFF00",
    description: "Chargement ultra rapide et optimisé"
  },
  {
    name: "Accessibilité",
    score: 100,
    icon: Sparkles,
    color: "#0EA5E9",
    description: "Compatible avec tous les utilisateurs"
  },
  {
    name: "Bonnes pratiques",
    score: 100,
    icon: Shield,
    color: "#8B5CF6",
    description: "Code propre et sécurisé"
  },
  {
    name: "SEO",
    score: 100,
    icon: Search,
    color: "#F43F5E",
    description: "Optimisé pour les moteurs de recherche"
  }
]

export function PageSpeedSection() {
  return (
    <section className="py-16 md:py-20 relative overflow-hidden">
      {/* Effets de lumière */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-64 md:w-96 h-64 md:h-96 bg-[#BFFF00]/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-64 md:w-96 h-64 md:h-96 bg-purple-500/10 rounded-full blur-[120px]" />
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
            <span className="text-[#BFFF00] font-medium">Google PageSpeed Insights</span>
          </motion.div>

          <h2 className="text-2xl md:text-3xl lg:text-5xl font-bold mb-4 md:mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500">
            Performance Maximale
          </h2>
          <p className="text-sm md:text-base text-gray-400 max-w-2xl mx-auto">
            Notre expertise en optimisation garantit des landing pages ultra-performantes,
            respectant les plus hauts standards du web.
          </p>
        </div>

        {/* Mockup PageSpeed */}
        <div className="relative">
          {/* Card flottante */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.7 }}
            className="bg-gray-950 rounded-2xl border border-gray-800 p-6 md:p-8 lg:p-12 backdrop-blur-xl"
          >
            {/* Header */}
            <div className="flex items-center gap-3 md:gap-4 mb-8 md:mb-12">
              <div className="w-6 h-6 md:w-8 md:h-8">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L1 21H23L12 2Z" fill="#BFFF00"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg md:text-xl font-semibold text-white">cleads.fr</h3>
                <p className="text-xs md:text-sm text-gray-400">Analysé le {new Date().toLocaleDateString("fr-FR")}</p>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
              {metrics.map((metric, index) => (
                <motion.div
                  key={metric.name}
                  initial={{ scale: 0.5, opacity: 0 }}
                  whileInView={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="relative flex flex-col items-center"
                >
                  <div className="mb-4 md:mb-6">
                    <div className="md:hidden">
                      <CircularProgress
                        value={metric.score}
                        size={100}
                        strokeWidth={8}
                        color={metric.color}
                      >
                        <metric.icon className="w-5 h-5" style={{ color: metric.color }} />
                      </CircularProgress>
                    </div>
                    <div className="hidden md:block">
                      <CircularProgress
                        value={metric.score}
                        size={160}
                        strokeWidth={12}
                        color={metric.color}
                      >
                        <metric.icon className="w-8 h-8" style={{ color: metric.color }} />
                      </CircularProgress>
                    </div>
                  </div>

                  <h4 className="text-base md:text-lg font-semibold text-white mb-1 md:mb-2">{metric.name}</h4>
                  <p className="text-xs md:text-sm text-gray-400 text-center">{metric.description}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Effet de reflet */}
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#BFFF00]/50 to-transparent" />
        </div>
      </div>
    </section>
  )
} 