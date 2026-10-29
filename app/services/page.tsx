"use client"

import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Phone, ArrowRight, Rocket, Target, LineChart, Code, Globe, Zap, CheckCircle } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

const services = [
  {
    category: "Landing Pages",
    description: "Des pages qui convertissent vos visiteurs en clients",
    items: [
      {
        title: "Landing Page SaaS",
        description: "Convertissez plus de visiteurs en clients",
        features: [
          "Design moderne et impactant",
          "Copywriting persuasif",
          "Optimisation conversion",
          "A/B Testing inclus"
        ],
        icon: Rocket,
        href: "/services/saas",
        image: "/services/saas.png"
      },
      {
        title: "E-commerce",
        description: "Augmentez vos ventes en ligne",
        features: [
          "UX optimisée pour l'achat",
          "Tunnel de conversion",
          "Social proof intégré",
          "Paiement sécurisé"
        ],
        icon: LineChart,
        href: "/services/ecommerce",
        image: "/services/ecommerce.png"
      },
      {
        title: "B2B",
        description: "Générez des leads qualifiés",
        features: [
          "Formulaires optimisés",
          "Intégration CRM",
          "Contenu professionnel",
          "Suivi analytics"
        ],
        icon: Target,
        href: "/services/b2b",
        image: "/services/b2b.png"
      }
    ]
  },
  {
    category: "Services Complémentaires",
    description: "Des solutions complètes pour votre succès digital",
    items: [
      {
        title: "Développement Web",
        description: "Sites web sur mesure",
        features: [
          "Performance optimale",
          "Code propre",
          "SEO friendly",
          "Responsive design"
        ],
        icon: Code,
        href: "/services/web",
        image: "/services/developpement-web.png"
      },
      {
        title: "SEO",
        description: "Optimisation pour les moteurs",
        features: [
          "Audit complet",
          "Mots-clés ciblés",
          "Contenu optimisé",
          "Suivi positions"
        ],
        icon: Globe,
        href: "/services/seo-illustration",
        image: "/services/seo.png"
      },
      {
        title: "Performance",
        description: "Optimisation de la conversion",
        features: [
          "Analyse UX",
          "Tests utilisateurs",
          "Optimisation CTA",
          "Rapports détaillés"
        ],
        icon: Zap,
        href: "/services/performance",
        image: "/services/performance.png"
      }
    ]
  }
]

export default function ServicesPage() {
  return (
    <main className="bg-black text-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 md:py-32">
        {/* Effet de grain */}
        <div 
          className="absolute inset-0 opacity-20" 
          style={{ backgroundImage: 'url("/noise.png")' }}
        />
        
        <div className="container px-4">
          <div className="max-w-4xl mx-auto text-center">
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl md:text-6xl font-bold mb-6"
            >
              Des Solutions Sur Mesure pour Votre Croissance
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-lg md:text-xl text-gray-400 mb-8"
            >
              Découvrez nos services spécialisés pour transformer vos visiteurs en clients fidèles
              et booster votre ROI.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Button 
                size="lg"
                className="group relative bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
              >
                <span className="flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  Discuter de votre projet
                </span>
              </Button>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Services Grid */}
      {services.map((category, categoryIndex) => (
        <section key={category.category} className={`py-16 md:py-24 ${categoryIndex % 2 === 1 ? 'bg-black' : ''}`}>
          <div className="container px-4">
            <div className="text-center mb-16">
              <motion.h2 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                className="text-3xl md:text-4xl font-bold mb-4"
              >
                {category.category}
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-gray-400 max-w-2xl mx-auto"
              >
                {category.description}
              </motion.p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {category.items.map((service, index) => (
                <motion.div
                  key={service.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="group relative bg-gray-950/50 rounded-2xl border border-gray-800 overflow-hidden hover:border-[#BFFF00] transition-colors"
                >
                  <div className="relative h-[350px] overflow-hidden">
                    <Image
                      src={service.image}
                      alt={service.title}
                      fill
                      className="object-cover transition-transform group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
                    <service.icon className="absolute bottom-4 right-4 h-8 w-8 text-[#BFFF00]" />
                  </div>

                  <div className="p-6">
                    <h3 className="text-xl font-bold mb-2 group-hover:text-[#BFFF00]">
                      {service.title}
                    </h3>
                    <p className="text-gray-400 mb-4">
                      {service.description}
                    </p>
                    <ul className="space-y-2 mb-6">
                      {service.features.map((feature) => (
                        <li key={feature} className="flex items-center gap-2 text-sm text-gray-300">
                          <CheckCircle className="h-4 w-4 text-[#BFFF00]" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <Link href={service.href}>
                      <Button 
                        className="w-full group/btn bg-black text-[#BFFF00] border border-[#BFFF00] hover:bg-[#BFFF00] hover:text-black"
                      >
                        <span className="flex items-center gap-2">
                          En savoir plus
                          <ArrowRight className="h-4 w-4 group-hover/btn:translate-x-1 transition-transform" />
                        </span>
                      </Button>
                    </Link>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      ))}

      {/* CTA Section */}
      <section className="py-16 md:py-24 bg-black">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Prêt à Transformer Votre Présence en Ligne ?
              </h2>
              <p className="text-gray-400 mb-8">
                Réservez un appel gratuit de 30 minutes pour discuter de votre projet 
                et découvrir comment nous pouvons vous aider à atteindre vos objectifs.
              </p>
              <Button 
                size="lg"
                className="group relative bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
              >
                <span className="flex items-center gap-2">
                  Commencer maintenant
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </span>
              </Button>
            </motion.div>
          </div>
        </div>
      </section>
    </main>
  )
} 