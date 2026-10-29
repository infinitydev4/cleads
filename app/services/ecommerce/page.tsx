import { Metadata } from "next"
import { ArrowRight, CheckCircle, MoveRight, ShoppingCart, CreditCard, RefreshCw, Truck, ShieldCheck, BarChart3 } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Landing Page E-commerce | Cleads - Augmentez vos ventes en ligne",
  description: "Optimisez vos ventes en ligne avec nos landing pages e-commerce. Design attractif, expérience utilisateur optimisée et tunnel de conversion performant.",
  openGraph: {
    title: "Landing Page E-commerce | Cleads - Augmentez vos ventes en ligne",
    description: "Optimisez vos ventes en ligne avec nos landing pages e-commerce. Design attractif, expérience utilisateur optimisée et tunnel de conversion performant.",
    images: ["/images/ecommerce-hero.jpg"],
  },
  alternates: {
    canonical: "https://cleads.fr/services/ecommerce",
  }
}

const features = [
  {
    icon: ShoppingCart,
    title: "UX optimisée pour l'achat",
    description: "Une expérience utilisateur fluide et intuitive qui guide vos visiteurs vers l'achat."
  },
  {
    icon: CreditCard,
    title: "Tunnel de conversion",
    description: "Un parcours d'achat optimisé et sans friction pour maximiser les conversions."
  },
  {
    icon: RefreshCw,
    title: "Social proof intégré",
    description: "Éléments de confiance stratégiquement placés pour rassurer vos prospects."
  },
  {
    icon: Truck,
    title: "Optimisation logistique",
    description: "Mise en avant claire de vos services de livraison et politique de retour."
  },
  {
    icon: ShieldCheck,
    title: "Paiement sécurisé",
    description: "Intégration et mise en valeur des options de paiement les plus fiables."
  },
  {
    icon: BarChart3,
    title: "Pilotage des ventes",
    description: "Accès à des données précises sur les performances de vos produits et le comportement des acheteurs."
  }
]

const process = [
  {
    number: "01",
    title: "Audit & Stratégie",
    description: "Analyse de votre marché, de vos produits phares et de votre stratégie de prix pour optimiser la conversion."
  },
  {
    number: "02",
    title: "Design UI/UX",
    description: "Création d'une interface attractive et orientée conversion, adaptée à votre identité de marque."
  },
  {
    number: "03",
    title: "Développement",
    description: "Intégration technique avec votre système e-commerce et optimisation des performances."
  },
  {
    number: "04",
    title: "Tests & Optimisation",
    description: "A/B testing de différentes versions pour identifier les éléments les plus performants."
  }
]

const successStories = [
  {
    companyName: "ModaChic",
    industrie: "Mode",
    result: "+78%",
    resultText: "de taux de conversion",
    description: "Mise en place d'une landing page pour une collection capsule avec un tunnel d'achat optimisé."
  },
  {
    companyName: "TechGear",
    industrie: "Électronique",
    result: "+52%",
    resultText: "d'augmentation du panier moyen",
    description: "Refonte de la page produit avec mise en avant des accessoires complémentaires."
  },
  {
    companyName: "NaturaCos",
    industrie: "Cosmétiques",
    result: "+93%",
    resultText: "de nouveaux clients",
    description: "Landing page promotionnelle pour une nouvelle gamme de produits bio."
  }
]

export default function EcommercePage() {
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
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <span className="inline-block bg-[#BFFF00]/10 text-[#BFFF00] px-4 py-2 rounded-full text-sm font-medium mb-6">
                Landing Page E-commerce
              </span>
              <h1 className="text-4xl md:text-6xl font-bold mb-6">
                Boostez vos <span className="text-[#BFFF00]">ventes en ligne</span>
              </h1>
              <p className="text-lg md:text-xl text-gray-400 mb-8">
                Nos landing pages e-commerce sont conçues pour transformer les visiteurs en acheteurs et augmenter votre panier moyen.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  size="lg"
                  className="group relative bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
                >
                  <span className="flex items-center gap-2">
                    Demander un devis
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                </Button>
                <Button 
                  size="lg"
                  variant="outline"
                  className="group relative border-gray-600 text-black hover:bg-white/5 hover:text-white"
                >
                  <span className="flex items-center gap-2">
                    Voir nos réalisations
                    <MoveRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                </Button>
              </div>
            </div>
            <div className="relative">
              <div className="relative rounded-2xl overflow-hidden border border-gray-800 shadow-2xl">
                <Image
                  src="/illustrations/ecommerce.png"
                  alt="Landing Page E-commerce exemple"
                  width={600}
                  height={400}
                  className="w-full h-auto"
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-black/80 via-transparent to-transparent" />
              </div>
              <div className="absolute -bottom-6 -right-6 bg-[#BFFF00] text-black p-4 rounded-lg shadow-lg">
                <p className="text-lg font-bold">+78%</p>
                <p className="text-sm">Taux de conversion</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 md:py-24 bg-gray-950">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Des landing pages e-commerce qui <span className="text-[#BFFF00]">vendent</span>
            </h2>
            <p className="text-gray-400">
              Notre approche combine design attractif, expérience utilisateur fluide et éléments de confiance stratégiques pour maximiser vos ventes.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature) => (
              <div 
                key={feature.title}
                className="bg-black/50 border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors"
              >
                <feature.icon className="h-12 w-12 text-[#BFFF00] mb-4" />
                <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                <p className="text-gray-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="py-16 md:py-24">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Notre méthodologie de travail
            </h2>
            <p className="text-gray-400">
              Une approche structurée pour garantir une landing page e-commerce performante et rentable.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {process.map((step) => (
              <div 
                key={step.number}
                className="relative bg-gray-950/50 border border-gray-800 rounded-xl p-8 hover:border-[#BFFF00] transition-colors group"
              >
                <span className="absolute -top-6 -left-2 text-8xl font-bold text-gray-800 opacity-30 group-hover:text-[#BFFF00]/20 transition-colors">
                  {step.number}
                </span>
                <div className="relative">
                  <h3 className="text-2xl font-semibold mb-3">{step.title}</h3>
                  <p className="text-gray-400">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Success Stories */}
      <section className="py-16 md:py-24 bg-gray-950">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Histoires de réussite
            </h2>
            <p className="text-gray-400">
              Découvrez comment nos landing pages ont transformé les résultats de nos clients e-commerce.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {successStories.map((story, index) => (
              <div 
                key={index}
                className="bg-black/60 rounded-xl p-6 border border-gray-800 hover:border-[#BFFF00] transition-colors"
              >
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="font-bold text-xl">{story.companyName}</h3>
                    <p className="text-gray-400 text-sm">{story.industrie}</p>
                  </div>
                  <div className="bg-[#BFFF00]/10 px-3 py-1 rounded-md">
                    <p className="text-[#BFFF00] font-bold">{story.result}</p>
                  </div>
                </div>
                <p className="text-gray-300 mb-2">{story.resultText}</p>
                <p className="text-gray-400 text-sm">{story.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Product Showcase */}
      {/* <section className="py-16 md:py-24">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Exemples de landing pages e-commerce
            </h2>
            <p className="text-gray-400">
              Quelques exemples de nos réalisations récentes pour des clients e-commerce.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="group relative rounded-xl overflow-hidden border border-gray-800">
              <Image
                src="/placeholder.svg"
                alt="Exemple ModaChic"
                width={600}
                height={400}
                className="w-full h-auto transition-transform group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent opacity-70" />
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <h3 className="text-xl font-bold mb-2">Collection Capsule ModaChic</h3>
                <p className="text-gray-300 mb-4">Landing page saisonnière avec configurateur de produits</p>
                <div className="flex items-center gap-2 text-[#BFFF00]">
                  <span>Voir le projet</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            </div>
            <div className="group relative rounded-xl overflow-hidden border border-gray-800">
              <Image
                src="/placeholder.svg"
                alt="Exemple TechGear"
                width={600}
                height={400}
                className="w-full h-auto transition-transform group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent opacity-70" />
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <h3 className="text-xl font-bold mb-2">Lancement TechGear Pro</h3>
                <p className="text-gray-300 mb-4">Page produit avec cross-selling optimisé</p>
                <div className="flex items-center gap-2 text-[#BFFF00]">
                  <span>Voir le projet</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section> */}

      {/* Features Comparison */}
      <section className="py-16 md:py-24 bg-gray-950">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Pourquoi choisir nos landing pages e-commerce
            </h2>
            <p className="text-gray-400">
              Une comparaison avec les solutions standard du marché.
            </p>
          </div>

          <div className="max-w-4xl mx-auto bg-black/50 rounded-xl border border-gray-800 overflow-hidden">
            <div className="grid grid-cols-3">
              <div className="p-4 border-b border-gray-800"></div>
              <div className="p-4 border-b border-gray-800 text-center font-semibold">Solutions standard</div>
              <div className="p-4 border-b border-gray-800 text-center font-semibold text-[#BFFF00]">Landing page Cleads</div>
              
              <div className="p-4 border-b border-gray-800">Taux de conversion</div>
              <div className="p-4 border-b border-gray-800 text-center">2-3%</div>
              <div className="p-4 border-b border-gray-800 text-center font-semibold text-[#BFFF00]">7-12%</div>
              
              <div className="p-4 border-b border-gray-800">Temps de chargement</div>
              <div className="p-4 border-b border-gray-800 text-center">3-5 secondes</div>
              <div className="p-4 border-b border-gray-800 text-center font-semibold text-[#BFFF00]">&lt; 1 seconde</div>
              
              <div className="p-4 border-b border-gray-800">Optimisation mobile</div>
              <div className="p-4 border-b border-gray-800 text-center">Basique</div>
              <div className="p-4 border-b border-gray-800 text-center font-semibold text-[#BFFF00]">Avancée</div>
              
              <div className="p-4 border-b border-gray-800">A/B Testing</div>
              <div className="p-4 border-b border-gray-800 text-center">Non inclus</div>
              <div className="p-4 border-b border-gray-800 text-center font-semibold text-[#BFFF00]">Inclus</div>
              
              <div className="p-4">Analytics avancés</div>
              <div className="p-4 text-center">Limités</div>
              <div className="p-4 text-center font-semibold text-[#BFFF00]">Complets</div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 md:py-24">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Questions fréquentes
            </h2>
            <p className="text-gray-400">
              Tout ce que vous devez savoir sur nos landing pages e-commerce.
            </p>
          </div>

          <div className="max-w-3xl mx-auto grid gap-6">
            <div className="border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors">
              <h3 className="text-xl font-semibold mb-3">Peut-on intégrer la landing page à notre système e-commerce existant?</h3>
              <p className="text-gray-400">Oui, nos landing pages s'intègrent parfaitement avec les principales plateformes e-commerce comme Shopify, WooCommerce, Magento, et PrestaShop.</p>
            </div>
            <div className="border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors">
              <h3 className="text-xl font-semibold mb-3">Comment gérer les promotions et offres limitées dans le temps?</h3>
              <p className="text-gray-400">Nous intégrons des compteurs et systèmes d'affichage dynamique pour vos offres temporaires, avec la possibilité de programmer les changements à l'avance.</p>
            </div>
            <div className="border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors">
              <h3 className="text-xl font-semibold mb-3">Les landing pages sont-elles compatibles avec les paiements mobiles?</h3>
              <p className="text-gray-400">Absolument. Nous optimisons l'expérience pour tous les moyens de paiement, y compris Apple Pay, Google Pay, et autres solutions de paiement mobile pour réduire les frictions à l'achat.</p>
            </div>
            <div className="border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors">
              <h3 className="text-xl font-semibold mb-3">Comment optimisez-vous les landing pages pour les achats impulsifs?</h3>
              <p className="text-gray-400">Nous utilisons des techniques de psychologie d'achat comme la rareté, l'urgence, les preuves sociales et l'effet d'ancrage, tout en simplifiant au maximum le parcours d'achat.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24 bg-gray-950">
        <div className="container px-4">
          <div className="max-w-4xl mx-auto bg-black/60 border border-gray-800 rounded-2xl p-8 md:p-12 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Prêt à augmenter vos ventes en ligne?
            </h2>
            <p className="text-gray-400 mb-8 max-w-2xl mx-auto">
              Réservez un appel de consultation gratuit pour discuter de votre projet e-commerce
              et découvrir comment nous pouvons vous aider à convertir plus de visiteurs en clients.
            </p>
            <Button 
              size="lg"
              className="group relative bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
            >
              <span className="flex items-center gap-2">
                Demander un devis gratuit
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </span>
            </Button>
          </div>
        </div>
      </section>
    </main>
  )
} 