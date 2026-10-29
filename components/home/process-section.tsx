"use client"

import { motion } from "framer-motion"
import { 
  Lightbulb, 
  PenTool, 
  Code,  
  Target,
  LineChart,
  Settings
} from "lucide-react"

const processSteps = [
  {
    icon: Lightbulb,
    title: "Stratégie & Analyse",
    description: "Analyse approfondie de votre marché, votre audience et vos objectifs pour définir la stratégie optimale.",
    details: [
      "Étude de marché détaillée",
      "Analyse des concurrents",
      "Définition des KPIs",
      "Identification des points de friction"
    ]
  },
  {
    icon: PenTool,
    title: "Design & UX",
    description: "Création d'une expérience utilisateur fluide et d'un design qui convertit.",
    details: [
      "Wireframes & Prototypes",
      "Design mobile-first",
      "Tests utilisateurs",
      "Optimisation UX/UI"
    ]
  },
  {
    icon: Code,
    title: "Développement",
    description: "Intégration technique optimisée pour les performances et le SEO.",
    details: [
      "Code propre et optimisé",
      "Temps de chargement < 2s",
      "Structure SEO optimale",
      "Tests cross-browser"
    ]
  },
  {
    icon: Settings,
    title: "Configuration Analytics",
    description: "Mise en place du tracking avancé pour mesurer chaque interaction.",
    details: [
      "Google Tag Manager",
      "Google Analytics 4",
      "Événements personnalisés",
      "Objectifs de conversion"
    ]
  },
  {
    icon: Target,
    title: "Tunnel de Vente",
    description: "Optimisation du parcours utilisateur pour maximiser les conversions.",
    details: [
      "A/B Testing",
      "Micro-conversions",
      "Points de contact",
      "Retargeting"
    ]
  },
  {
    icon: LineChart,
    title: "Analyse & Optimisation",
    description: "Suivi des performances et optimisation continue basée sur les données.",
    details: [
      "Rapports hebdomadaires",
      "Analyse comportementale",
      "Optimisation continue",
      "ROI tracking"
    ]
  }
]

export function ProcessSection() {
  return (
    <section className="py-20 bg-black relative overflow-hidden">
      {/* Fond avec effet de grain */}
      <div 
        className="absolute inset-0 opacity-20" 
        style={{ backgroundImage: 'url("/noise.png")' }}
      />

      <div className="container px-4 relative">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">NOTRE PROCESS</h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Une méthodologie éprouvée pour créer des landing pages qui convertissent, 
            basée sur les données et optimisée en continu.
          </p>
        </div>

        <div className="relative">
          {/* Ligne de timeline */}
          <div className="absolute left-[50%] top-0 bottom-0 w-px bg-gradient-to-b from-[#BFFF00] to-transparent hidden lg:block" />

          <div className="space-y-12 relative">
            {processSteps.map((step, index) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true }}
                className={`flex flex-col lg:flex-row gap-8 items-center ${
                  index % 2 === 0 ? 'lg:flex-row-reverse' : ''
                }`}
              >
                {/* Point sur la timeline */}
                <div className="hidden lg:block absolute left-1/2 transform -translate-x-1/2 w-4 h-4 bg-[#BFFF00] rounded-full" />

                {/* Contenu */}
                <div className="flex-1">
                  <div className="bg-black rounded-2xl p-6 border-2 border-gray-800 hover:border-[#BFFF00] transition-colors duration-300 group">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-[#BFFF00]/10 text-[#BFFF00]">
                        <step.icon className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-2 group-hover:text-[#BFFF00] transition-colors">
                          {step.title}
                        </h3>
                        <p className="text-gray-400 mb-4">{step.description}</p>
                        <ul className="grid grid-cols-2 gap-2">
                          {step.details.map((detail, i) => (
                            <li key={i} className="flex items-center text-sm text-gray-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#BFFF00] mr-2" />
                              {detail}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Espace pour la timeline sur mobile */}
                <div className="lg:flex-1" />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
} 