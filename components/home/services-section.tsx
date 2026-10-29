"use client"

import { motion } from "framer-motion"
import { ArrowRight } from "lucide-react"
import Link from "next/link"
import { TrackedButton } from "@/components/tracking/TrackedButton"
import { useMediaQuery } from "@/hooks/useMediaQuery"

const services = [
  {
    title: "SaaS Landing",
    description: "Landing pages optimisées pour convertir vos visiteurs en utilisateurs.",
    image: "/illustrations/saas.png",
    alt: "Landing Page SaaS exemple",
    features: ["UX optimisée", "A/B Testing", "CTA stratégiques", "Analytics avancés"],
    color: "#BFFF00",
    url: "/services/saas"
  },
  {
    title: "E-commerce",
    description: "Pages produits conçues pour augmenter votre taux de conversion.",
    image: "/placeholder.svg", 
    alt: "Page produit E-commerce exemple",
    features: ["Social proof", "Cross-selling", "Tunnel optimisé", "Mobile-first"],
    color: "#BFFF00",
    url: "/services/ecommerce"
  },
  {
    title: "Site Web",
    description: "Pages d'accueil impactantes qui reflètent votre expertise.",
    image: "/placeholder.svg",
    alt: "Site agence exemple", 
    features: ["Branding fort", "Portfolio", "Témoignages", "Lead magnet"],
    color: "#BFFF00",
    url: "/services/web"
  },
  {
    title: "Performance",
    description: "Optimisation des performances et du taux de conversion.",
    image: "/placeholder.svg",
    alt: "Page de vente formation exemple",
    features: ["Core Web Vitals", "SEO", "CRO", "UX Optimisée"],
    color: "#BFFF00",
    url: "/services/performance"
  }
]

export function ServicesSection() {
  const isMobile = useMediaQuery('(max-width: 768px)')

  return (
    <section className="py-12 md:py-20 relative overflow-hidden">
      {/* Effet de grain - désactivé sur mobile pour les performances */}
      {!isMobile && (
        <div 
          className="absolute inset-0 opacity-20" 
          style={{ backgroundImage: 'url("/noise.png")' }}
        />
      )}

      <div className="container px-4 relative">
        {/* Effets de lumière - optimisés pour mobile */}
        <motion.div 
          initial={false}
          animate={{ opacity: 1 }}
          className="absolute inset-0 pointer-events-none hidden md:block"
        >
          <div className="absolute top-40 left-20 w-72 h-72 bg-[#BFFF00]/30 rounded-full blur-[120px]" />
          <div className="absolute bottom-40 right-20 w-72 h-72 bg-purple-500/30 rounded-full blur-[120px]" />
        </motion.div>

        <div className="text-center mb-8 md:mb-16 relative">
          <motion.div
            initial={isMobile ? false : { scale: 0.5, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center rounded-full bg-[#BFFF00]/10 px-3 py-1.5 mb-4 md:mb-6"
          >
            <div className="mr-2 h-1.5 w-1.5 rounded-full bg-[#BFFF00]" />
            <span className="text-[#BFFF00] font-medium text-sm">Nos expertises</span>
          </motion.div>

          <h2 className="text-3xl md:text-6xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500">
            Des Landing Pages
            <br />
            Qui Convertissent
          </h2>
        </div>

        {/* Grid responsive optimisée */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {services.map((service, index) => (
            <motion.div
              key={service.title}
              initial={isMobile ? { opacity: 0, y: 20 } : { opacity: 0, x: index % 2 === 0 ? -50 : 50, y: 50 }}
              whileInView={{ opacity: 1, x: 0, y: 0 }}
              transition={{ duration: 0.5, delay: isMobile ? index * 0.1 : 0 }}
              whileHover={!isMobile ? { y: -10 } : undefined}
              className="group relative h-[400px] md:h-[420px] bg-gray-950/50 rounded-2xl overflow-hidden border border-gray-800"
            >
              {/* Image optimisée avec lazy loading et dimensions fixes */}
              <div className="absolute inset-0">
                {/* <Image
                  src={service.image}
                  alt={service.alt}
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                  loading="lazy"
                  className="object-cover opacity-50 group-hover:scale-110 transition-transform duration-700"
                /> */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-gray-950/80 to-gray-950" />
              </div>

              <div className="relative h-full p-4 md:p-6 flex flex-col">
                <div style={{ color: service.color }} className="mb-2 md:mb-4 text-sm font-medium">
                  0{index + 1} — {service.title}
                </div>

                <h3 className="text-xl md:text-2xl font-bold mb-2 md:mb-3 text-white group-hover:text-[#BFFF00] transition-colors">
                  {service.title}
                </h3>
                
                <p className="text-sm md:text-base text-gray-400 mb-4 md:mb-6">
                  {service.description}
                </p>

                <div className="space-y-2 md:space-y-3 mb-4 md:mb-6">
                  {service.features.map((feature) => (
                    <div 
                      key={feature}
                      className="flex items-center text-xs md:text-sm text-gray-300 group-hover:translate-x-2 transition-transform"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[#BFFF00] mr-2" />
                      {feature}
                    </div>
                  ))}
                </div>

                <Link href={service.url}>
                  <TrackedButton
                    trackingName={`service_${service.title.toLowerCase()}`}
                    location="services_section"
                    variant="3d"
                    className="mt-auto text-sm md:text-base"
                  >
                    <span className="flex items-center gap-2">
                      Découvrir
                      <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </TrackedButton>
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
} 