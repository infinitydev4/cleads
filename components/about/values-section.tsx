"use client"

import { motion } from "framer-motion"
import { Target, Users, Rocket, Award } from "lucide-react"

const values = [
  {
    icon: Target,
    title: "Performance",
    description: "Nous créons des landing pages optimisées pour maximiser vos conversions"
  },
  {
    icon: Users,
    title: "Collaboration",
    description: "Une approche centrée sur vos objectifs et votre audience"
  },
  {
    icon: Rocket,
    title: "Innovation",
    description: "Les dernières technologies pour des résultats exceptionnels"
  },
  {
    icon: Award,
    title: "Excellence",
    description: "Un travail minutieux pour dépasser vos attentes"
  }
]

export function ValuesSection() {
  return (
    <section className="py-16 md:py-20 relative overflow-hidden">
      <div className="container px-4">
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
          {values.map((value, index) => (
            <motion.div
              key={value.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="text-center"
            >
              <div className="inline-flex items-center justify-center w-12 h-12 md:w-16 md:h-16 rounded-full bg-[#BFFF00]/10 mb-4 md:mb-6">
                <value.icon className="w-6 h-6 md:w-8 md:h-8 text-[#BFFF00]" />
              </div>
              <h3 className="text-lg md:text-xl font-semibold mb-2 md:mb-3">{value.title}</h3>
              <p className="text-sm md:text-base text-gray-400">{value.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
} 