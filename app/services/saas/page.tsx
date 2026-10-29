import { Metadata } from "next"
import { ArrowRight, CheckCircle, Code, MoveRight, Rocket, Users, LineChart, Shield, Zap } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Landing Page SaaS | Cleads - Convertissez plus de visiteurs en clients",
  description: "Transformez vos visiteurs en clients avec nos landing pages SaaS optimisées pour la conversion. Design moderne, copywriting persuasif et optimisation continue.",
  openGraph: {
    title: "Landing Page SaaS | Cleads - Convertissez plus de visiteurs en clients",
    description: "Transformez vos visiteurs en clients avec nos landing pages SaaS optimisées pour la conversion. Design moderne, copywriting persuasif et optimisation continue.",
    images: ["/images/saas-hero.jpg"],
  },
  alternates: {
    canonical: "https://cleads.fr/services/saas",
  }
}

const features = [
  {
    icon: Rocket,
    title: "Design moderne et impactant",
    description: "Une interface utilisateur conçue pour impressionner et engager instantanément vos visiteurs."
  },
  {
    icon: Users,
    title: "Copywriting persuasif",
    description: "Des textes stratégiquement rédigés pour convaincre vos prospects et les inciter à passer à l'action."
  },
  {
    icon: LineChart,
    title: "Optimisation conversion",
    description: "Structure et éléments optimisés pour maximiser votre taux de conversion et votre ROI."
  },
  {
    icon: Code,
    title: "Performance technique",
    description: "Code optimisé pour des temps de chargement ultra-rapides et une expérience utilisateur fluide."
  },
  {
    icon: Shield,
    title: "A/B Testing inclus",
    description: "Tests de différentes versions pour identifier et implémenter la plus performante."
  },
  {
    icon: Zap,
    title: "Automatisations marketing",
    description: "Déclencheurs intelligents pour envoyer des emails, relances ou offres en fonction du comportement utilisateur."
  }
]

const process = [
  {
    number: "01",
    title: "Analyse & Stratégie",
    description: "Nous étudions votre marché, vos concurrents et vos objectifs pour développer une stratégie gagnante."
  },
  {
    number: "02",
    title: "Conception UX/UI",
    description: "Création d'une maquette adaptée aux besoins de votre audience et optimisée pour la conversion."
  },
  {
    number: "03",
    title: "Développement",
    description: "Codage de votre landing page avec les meilleures pratiques techniques et d'optimisation."
  },
  {
    number: "04",
    title: "Tests & Optimisation",
    description: "Mise en place de l'A/B testing et optimisation continue pour maximiser les performances."
  }
]

const testimonials = [
  {
    quote: "Notre taux de conversion a augmenté de 43% depuis que nous avons lancé notre nouvelle landing page. L'investissement a été rentabilisé en moins de 2 mois.",
    author: "Marie L.",
    position: "CMO",
    company: "SoftTech SaaS"
  },
  {
    quote: "L'équipe de Cleads a su capturer l'essence de notre produit et la transformer en une page qui convertit. Le processus a été fluide du début à la fin.",
    author: "Thomas D.",
    position: "Fondateur",
    company: "DataFlow"
  }
]

export default function SaasPage() {
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
                Landing Page SaaS
              </span>
              <h1 className="text-4xl md:text-6xl font-bold mb-6">
                Transformez vos visiteurs en <span className="text-[#BFFF00]">clients fidèles</span>
              </h1>
              <p className="text-lg md:text-xl text-gray-400 mb-8">
                Nos landing pages SaaS sont conçues pour capter l'attention, générer des leads qualifiés et maximiser votre taux de conversion.
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
                  className="group relative border-gray-600 text-black hover:bg-white/80"
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
                  src="/illustrations/saas.png"
                  alt="Landing Page SaaS exemple"
                  width={600}
                  height={400}
                  className="w-full h-auto"
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-black/80 via-transparent to-transparent" />
              </div>
              <div className="absolute -bottom-6 -right-6 bg-[#BFFF00] text-black p-4 rounded-lg shadow-lg">
                <p className="text-lg font-bold">+43%</p>
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
              Des landing pages SaaS conçues pour <span className="text-[#BFFF00]">convertir</span>
            </h2>
            <p className="text-gray-400">
              Notre approche combine design stratégique, copywriting persuasif et optimisation technique pour maximiser vos résultats.
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
              Notre processus de création
            </h2>
            <p className="text-gray-400">
              Une approche méthodique pour garantir des résultats exceptionnels à chaque étape du projet.
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

      {/* Results/KPIs Section */}
      <section className="py-16 md:py-24 bg-gray-950">
        <div className="container px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Des résultats mesurables et concrets
              </h2>
              <p className="text-gray-400 mb-8">
                Nos landing pages SaaS sont conçues pour générer un impact réel sur votre business. Voici ce que vous pouvez attendre:
              </p>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-[#BFFF00] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold">Augmentation du taux de conversion</h3>
                    <p className="text-gray-400">En moyenne, nos clients constatent une hausse de 35% de leur taux de conversion.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-[#BFFF00] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold">Réduction du coût d'acquisition client</h3>
                    <p className="text-gray-400">Optimisez votre ROI marketing avec une landing page plus performante.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-[#BFFF00] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold">Amélioration de l'engagement utilisateur</h3>
                    <p className="text-gray-400">Plus de temps passé sur votre page et une meilleure compréhension de votre offre.</p>
                  </div>
                </li>
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-black/60 rounded-xl p-6 border border-gray-800">
                <p className="text-[#BFFF00] text-4xl font-bold mb-2">+35%</p>
                <p className="text-gray-300">Augmentation moyenne du taux de conversion</p>
              </div>
              <div className="bg-black/60 rounded-xl p-6 border border-gray-800">
                <p className="text-[#BFFF00] text-4xl font-bold mb-2">-24%</p>
                <p className="text-gray-300">Réduction du coût d'acquisition client</p>
              </div>
              <div className="bg-black/60 rounded-xl p-6 border border-gray-800">
                <p className="text-[#BFFF00] text-4xl font-bold mb-2">+67%</p>
                <p className="text-gray-300">Augmentation de l'engagement utilisateur</p>
              </div>
              <div className="bg-black/60 rounded-xl p-6 border border-gray-800">
                <p className="text-[#BFFF00] text-4xl font-bold mb-2">2.3x</p>
                <p className="text-gray-300">ROI moyen sur l'investissement</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-16 md:py-24">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Ce que nos clients disent
            </h2>
            <p className="text-gray-400">
              Découvrez comment nos landing pages ont transformé l'acquisition client de nos partenaires SaaS.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {testimonials.map((testimonial, index) => (
              <div 
                key={index}
                className="bg-gray-950/50 border border-gray-800 rounded-xl p-8 hover:border-[#BFFF00] transition-colors"
              >
                <svg className="h-10 w-10 text-[#BFFF00] mb-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9.13456 9H5.36789C5.16312 9 5 8.83688 5 8.63211V4.86544C5 4.66067 5.16312 4.49755 5.36789 4.49755H9.13456C9.33933 4.49755 9.50245 4.66067 9.50245 4.86544V8.63211C9.50245 8.83688 9.33933 9 9.13456 9Z" fill="currentColor"/>
                  <path d="M9.13456 19.5024H5.36789C5.16312 19.5024 5 19.3393 5 19.1346V15.3679C5 15.1631 5.16312 15 5.36789 15H9.13456C9.33933 15 9.50245 15.1631 9.50245 15.3679V19.1346C9.50245 19.3393 9.33933 19.5024 9.13456 19.5024Z" fill="currentColor"/>
                  <path d="M19.1346 9H15.3679C15.1631 9 15 8.83688 15 8.63211V4.86544C15 4.66067 15.1631 4.49755 15.3679 4.49755H19.1346C19.3393 4.49755 19.5024 4.66067 19.5024 4.86544V8.63211C19.5024 8.83688 19.3393 9 19.1346 9Z" fill="currentColor"/>
                  <path d="M19.1346 19.5024H15.3679C15.1631 19.5024 15 19.3393 15 19.1346V15.3679C15 15.1631 15.1631 15 15.3679 15H19.1346C19.3393 15 19.5024 15.1631 19.5024 15.3679V19.1346C19.5024 19.3393 19.3393 19.5024 19.1346 19.5024Z" fill="currentColor"/>
                </svg>
                <p className="text-lg italic mb-6">{testimonial.quote}</p>
                <div>
                  <p className="font-semibold">{testimonial.author}</p>
                  <p className="text-gray-400 text-sm">{testimonial.position}, {testimonial.company}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 md:py-24 bg-gray-950">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Questions fréquentes
            </h2>
            <p className="text-gray-400">
              Tout ce que vous devez savoir sur nos services de landing page SaaS.
            </p>
          </div>

          <div className="max-w-3xl mx-auto grid gap-6">
            <div className="border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors">
              <h3 className="text-xl font-semibold mb-3">Combien de temps faut-il pour créer une landing page SaaS?</h3>
              <p className="text-gray-400">Généralement, nous créons et lançons une landing page SaaS optimisée en 2 à 4 semaines, selon la complexité du projet et la rapidité de vos retours.</p>
            </div>
            <div className="border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors">
              <h3 className="text-xl font-semibold mb-3">Est-ce que la landing page sera optimisée pour mobile?</h3>
              <p className="text-gray-400">Absolument. Toutes nos landing pages sont conçues avec une approche mobile-first et sont parfaitement responsives sur tous les appareils.</p>
            </div>
            <div className="border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors">
              <h3 className="text-xl font-semibold mb-3">Comment mesurez-vous les performances de la landing page?</h3>
              <p className="text-gray-400">Nous intégrons des outils d'analyse avancés et configurons un tableau de bord personnalisé pour suivre les KPIs importants: taux de conversion, engagement, temps sur page, et plus encore.</p>
            </div>
            <div className="border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors">
              <h3 className="text-xl font-semibold mb-3">Proposez-vous des services d'optimisation continue?</h3>
              <p className="text-gray-400">Oui, nous offrons des forfaits d'optimisation continue qui incluent l'A/B testing, l'analyse des données et des améliorations régulières pour maximiser continuellement vos performances.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24">
        <div className="container px-4">
          <div className="max-w-4xl mx-auto bg-gray-950/70 border border-gray-800 rounded-2xl p-8 md:p-12 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Prêt à transformer votre acquisition client?
            </h2>
            <p className="text-gray-400 mb-8 max-w-2xl mx-auto">
              Réservez un appel de consultation gratuit pour discuter de votre projet 
              et découvrir comment nous pouvons vous aider à atteindre vos objectifs.
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