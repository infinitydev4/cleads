"use client"

import { Check, Zap, Clock, Users, BarChart, Rocket, ArrowRight, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { motion } from "framer-motion"
import { CountdownTimer } from "@/components/pricing/countdown-timer"
import { BookingDialog } from "@/components/modal/booking-dialog"

// Liste complète de toutes les fonctionnalités
const allFeatures = [
  "Landing Page optimisée",
  "Copywriting stratégique",
  "Livraison rapide",
  "A/B Testing",
  "Optimisation SEO",
  "Support client",
  "Analytics avancés",
  "Intégrations sur mesure",
  "Maintenance incluse"
] as const

// Type pour les fonctionnalités
type FeatureKey = typeof allFeatures[number]
type PlanFeatures = {
  [K in FeatureKey]: string | boolean
}

// Type pour la structure d'un plan
interface Plan {
  name: string
  description: string
  price: string
  features: PlanFeatures
  highlighted: boolean
}

// Configuration des plans avec les fonctionnalités incluses/exclues
const plans: Plan[] = [
  {
    name: "Starter",
    description: "Pour les petites entreprises",
    price: "€990",
    features: {
      "Landing Page optimisée": "1 Landing Page optimisée",
      "Copywriting stratégique": "Copywriting de base",
      "Livraison rapide": "Livraison en 5 jours",
      "A/B Testing": false,
      "Optimisation SEO": "Optimisation SEO basique",
      "Support client": "Support par email",
      "Analytics avancés": false,
      "Intégrations sur mesure": false,
      "Maintenance incluse": false
    },
    highlighted: false
  },
  {
    name: "Pro",
    description: "Pour les entreprises en croissance",
    price: "€1990",
    features: {
      "Landing Page optimisée": "1 Landing Page premium",
      "Copywriting stratégique": "Copywriting avancé",
      "Livraison rapide": "Livraison en 72 heures",
      "A/B Testing": "A/B Testing complet",
      "Optimisation SEO": "Optimisation SEO avancée",
      "Support client": "Support prioritaire",
      "Analytics avancés": "Analytics avancés",
      "Intégrations sur mesure": false,
      "Maintenance incluse": false
    },
    highlighted: true
  },
  {
    name: "Enterprise",
    description: "Pour les grandes entreprises",
    price: "€3990",
    features: {
      "Landing Page optimisée": "3 Landing Pages premium",
      "Copywriting stratégique": "Copywriting stratégique",
      "Livraison rapide": "Livraison en 72 heures",
      "A/B Testing": "A/B Testing illimité",
      "Optimisation SEO": "SEO technique avancé",
      "Support client": "Support dédié 24/7",
      "Analytics avancés": "Analytics & Rapports",
      "Intégrations sur mesure": "Intégrations sur mesure",
      "Maintenance incluse": "Maintenance 6 mois"
    },
    highlighted: false
  }
]

const benefits = [
  {
    icon: Zap,
    title: "Performance Garantie",
    description: "Scores parfaits sur PageSpeed Insights et temps de chargement optimaux."
  },
  {
    icon: Clock,
    title: "Livraison Rapide",
    description: "Processus optimisé pour une mise en ligne en 72h maximum."
  },
  {
    icon: Users,
    title: "Support Premium",
    description: "Une équipe dédiée pour vous accompagner à chaque étape."
  },
  {
    icon: BarChart,
    title: "ROI Mesurable",
    description: "Suivi précis des performances et optimisation continue."
  }
]

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      {/* Header */}
      {/* Supprimer ce bloc de code
<header className="sticky top-0 z-50 w-full border-b border-gray-800 bg-black/80 backdrop-blur-sm">
  <div className="container flex h-16 items-center px-4">
    <Link href="/" className="flex items-center gap-2">
      <div className="relative h-8 w-8 overflow-hidden rounded bg-lime-500 flex items-center justify-center">
        <span className="font-bold text-black">C</span>
      </div>
      <span className="font-bold text-xl">Cleads</span>
    </Link>
  </div>
</header>
*/}

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative py-20 overflow-hidden">
          {/* Effets de lumière */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#BFFF00]/10 rounded-full blur-[120px]" />
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px]" />
          </div>

          <div className="container px-4">
            <div className="text-center max-w-3xl mx-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center rounded-full bg-[#BFFF00]/10 px-3 py-1.5 mb-6"
              >
                <div className="mr-2 h-1.5 w-1.5 rounded-full bg-[#BFFF00]" />
                <span className="text-[#BFFF00] font-medium">Tarifs transparents</span>
              </motion.div>

              <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500">
                Investissez dans votre Croissance
              </h1>
              <p className="text-gray-400 text-lg mb-8">
                Des forfaits adaptés à vos besoins avec un ROI garanti. 
                Transformez vos visiteurs en clients fidèles.
              </p>
            </div>
          </div>
        </section>

        {/* Prix Cards */}
        <section className="container px-4 pb-20">
          <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-3">
            {plans.map((plan, planIndex) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: planIndex * 0.2 }}
                className={`group relative rounded-2xl bg-gray-950 p-8 transition-all duration-300 ${
                  plan.highlighted 
                    ? "border-2 border-[#BFFF00]" 
                    : "border border-gray-800 hover:border-[#BFFF00]"
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 rounded-full bg-[#BFFF00] px-4 py-1 text-sm font-bold text-black">
                    RECOMMANDÉ
                  </div>
                )}
                
                <div className={`absolute inset-0 rounded-2xl bg-gradient-to-b ${
                  plan.highlighted 
                    ? "from-[#BFFF00]/10 to-transparent opacity-50" 
                    : "from-gray-800/20 to-transparent opacity-0 group-hover:opacity-100"
                } transition-opacity`} />
                
                <h3 className="mb-2 text-xl font-bold">{plan.name}</h3>
                <p className="mb-6 text-gray-400">{plan.description}</p>
                <div className="mb-6">
                  <span className="text-4xl font-bold">{plan.price}</span>
                </div>
                
                <ul className="mb-6 space-y-4">
                  {allFeatures.map((feature, index) => {
                    const included = plan.features[feature] !== false;
                    const featureText = included 
                      ? String(plan.features[feature]) 
                      : feature;
                    
                    return (
                      <motion.li
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.1 }}
                        className="flex items-start"
                      >
                        {included ? (
                          <Check className="mr-2 h-5 w-5 text-[#BFFF00] flex-shrink-0" />
                        ) : (
                          <X className="mr-2 h-5 w-5 text-red-500 flex-shrink-0" />
                        )}
                        <span className={`${included ? 'text-gray-300' : 'text-gray-500'}`}>
                          {featureText}
                        </span>
                      </motion.li>
                    );
                  })}
                </ul>
                
                <Button 
                  size="lg"
                  className="group"
                  variant="3d"
                >
                  <span className="flex items-center gap-2">
                    Commencer
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </span>
                </Button>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-20 bg-gray-950">
          <div className="container px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-bold mb-6">
                Pourquoi Choisir Nos Services ?
              </h2>
              <p className="text-gray-400 max-w-2xl mx-auto">
                Des avantages concrets pour maximiser votre retour sur investissement
                et garantir le succès de votre projet.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {benefits.map((benefit, index) => (
                <motion.div
                  key={benefit.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="text-center"
                >
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#BFFF00]/10 mb-6">
                    <benefit.icon className="w-8 h-8 text-[#BFFF00]" />
                  </div>
                  <h3 className="text-xl font-semibold mb-3">{benefit.title}</h3>
                  <p className="text-gray-400">{benefit.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20">
          <div className="container px-4">
            <div className="max-w-3xl mx-auto text-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="bg-gray-950 border border-gray-800 rounded-2xl pt-12 pb-8 px-8 md:px-12 relative"
              >
                {/* Effet de brillance */}
                <div className="absolute inset-0 bg-gradient-to-tr from-[#BFFF00]/10 via-transparent to-purple-500/10 opacity-50" />
                
                {/* Badge Offre Limitée */}
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#BFFF00] text-black px-6 py-2 rounded-full font-bold text-sm shadow-lg">
                  OFFRE LIMITÉE
                </div>

                <Rocket className="w-12 h-12 text-[#BFFF00] mx-auto mb-6" />
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  Offre Exclusive -30%
                </h2>
                <p className="text-xl text-[#BFFF00] font-semibold mb-2">
                  Sur tous nos forfaits
                </p>
                <p className="text-gray-400 mb-8">
                  Profitez de notre offre de lancement exceptionnelle !
                  Cette réduction ne sera plus disponible dans :
                </p>

                {/* Intégration du compteur */}
                <CountdownTimer />

                <div className="mt- space-y-4">
                  <BookingDialog />
                  <p className="text-sm text-gray-400">
                    ⚡️ Déjà <span className="text-[#BFFF00] font-semibold">13 entreprises</span> ont profité de cette offre
                  </p>
                </div>

                {/* Badges de confiance */}
                <div className="mt-8 pt-8 border-t border-gray-800">
                  <div className="flex flex-wrap justify-center items-center gap-4 text-sm text-gray-400">
                    <span>✓ Sans engagement</span>
                    <span>✓ Satisfait ou remboursé</span>
                    <span>✓ Support prioritaire</span>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

