import { Metadata } from "next"
import { ArrowRight, CheckCircle, MoveRight, Code, Cpu, Smartphone, Zap, Shield, LayoutGrid } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Développement Web | Cleads - Sites web sur mesure performants",
  description: "Développement de sites web sur mesure, ultra-performants et optimisés SEO. Applications React, Next.js, et solutions e-commerce optimisées pour la conversion.",
  openGraph: {
    title: "Développement Web | Cleads - Sites web sur mesure performants",
    description: "Développement de sites web sur mesure, ultra-performants et optimisés SEO. Applications React, Next.js, et solutions e-commerce optimisées pour la conversion.",
    images: ["/images/web-dev-hero.jpg"],
  },
  alternates: {
    canonical: "https://cleads.fr/services/web",
  }
}

const features = [
  {
    icon: Zap,
    title: "Performance optimale",
    description: "Sites web ultra-rapides avec des temps de chargement minimaux pour une expérience utilisateur fluide."
  },
  {
    icon: Code,
    title: "Code propre",
    description: "Architecture robuste et maintenable avec les meilleures pratiques de développement."
  },
  {
    icon: Cpu,
    title: "SEO friendly",
    description: "Optimisation technique pour les moteurs de recherche dès la conception."
  },
  {
    icon: Smartphone,
    title: "Responsive design",
    description: "Expérience utilisateur parfaite sur tous les appareils et toutes les tailles d'écran."
  },
  {
    icon: Shield,
    title: "Sécurité renforcée",
    description: "Protection contre les vulnérabilités web courantes et respect des normes RGPD."
  },
  {
    icon: LayoutGrid,
    title: "Architecture scalable",
    description: "Solutions conçues pour évoluer avec votre entreprise et supporter votre croissance."
  }
]

const technologies = [
  {
    name: "Next.js",
    logo: "/technos/nextjs-w.png",
    description: "Framework React pour des sites statiques et des applications web rapides."
  },
  {
    name: "React",
    logo: "https://cdn.worldvectorlogo.com/logos/react-2.svg",
    description: "Bibliothèque JavaScript pour créer des interfaces utilisateur interactives."
  },
  {
    name: "TypeScript",
    logo: "https://cdn.worldvectorlogo.com/logos/typescript.svg",
    description: "Surcouche à JavaScript ajoutant du typage statique pour plus de fiabilité."
  },
  {
    name: "Tailwind CSS",
    logo: "https://cdn.worldvectorlogo.com/logos/tailwind-css-2.svg",
    description: "Framework CSS utility-first pour des designs personnalisés et rapides."
  },
  {
    name: "Node.js",
    logo: "https://cdn.worldvectorlogo.com/logos/nodejs-icon.svg",
    description: "Environnement d'exécution JavaScript côté serveur pour des APIs performantes."
  },
  {
    name: "GraphQL",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/GraphQL_Logo.svg/512px-GraphQL_Logo.svg.png",
    description: "Langage de requête pour APIs qui permet de demander précisément les données nécessaires."
  }
]

const portfolio = [
  {
    title: "EcoShop",
    category: "E-commerce",
    image: "https://images.unsplash.com/photo-1582845512747-e42001c95638?q=80&w=1470&auto=format&fit=crop",
    description: "Boutique en ligne pour produits écologiques avec un tunnel d'achat optimisé."
  },
  {
    title: "DataViz Pro",
    category: "Application SaaS",
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=1470&auto=format&fit=crop",
    description: "Tableau de bord analytique avec visualisations de données complexes en temps réel."
  },
  {
    title: "Médica+",
    category: "Site institutionnel",
    image: "https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?q=80&w=1491&auto=format&fit=crop",
    description: "Site vitrine pour un groupe médical avec système de prise de rendez-vous."
  }
]

const services = [
  {
    title: "Développement Front-end",
    description: "Interfaces utilisateur modernes, responsive et interactives avec React, Next.js et Tailwind CSS.",
    detail: "Nous créons des expériences utilisateur fluides et engageantes avec les technologies front-end les plus performantes. Notre approche mobile-first garantit une adaptation parfaite à tous les appareils."
  },
  {
    title: "Développement Back-end",
    description: "APIs robustes, bases de données optimisées et architecture serveur sécurisée.",
    detail: "Notre équipe conçoit des systèmes back-end évolutifs qui supportent efficacement votre logique métier. Nous utilisons Node.js, Express, et diverses bases de données selon vos besoins."
  },
  {
    title: "Applications Web PWA",
    description: "Progressive Web Apps offrant une expérience similaire aux applications natives sur tous les appareils.",
    detail: "Transformez votre site en application installable avec fonctionnalités offline, notifications push et accès aux fonctionnalités matérielles de l'appareil."
  },
  {
    title: "Refonte technique",
    description: "Modernisation de sites existants pour améliorer les performances, la sécurité et la maintenabilité.",
    detail: "Nous analysons votre site actuel et proposons une stratégie de migration vers des technologies modernes tout en préservant votre SEO et vos fonctionnalités."
  }
]

export default function WebPage() {
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
                Développement Web
              </span>
              <h1 className="text-4xl md:text-6xl font-bold mb-6">
                Sites web <span className="text-[#BFFF00]">sur mesure</span> et ultra performants
              </h1>
              <p className="text-lg md:text-xl text-gray-400 mb-8">
                Nous développons des solutions web modernes, rapides et optimisées pour la conversion et l'expérience utilisateur.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  size="lg"
                  className="group relative bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
                >
                  <span className="flex items-center gap-2">
                    Discuter de votre projet
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
                  src="/services/developpement-web.png"
                  alt="Développement web exemple"
                  width={600}
                  height={400}
                  className="w-full h-auto"
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-black/80 via-transparent to-transparent" />
              </div>
              <div className="absolute -bottom-6 -right-6 bg-[#BFFF00] text-black p-4 rounded-lg shadow-lg">
                <p className="text-lg font-bold">100/100</p>
                <p className="text-sm">Score Performance</p>
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
              Développement web <span className="text-[#BFFF00]">d'excellence</span>
            </h2>
            <p className="text-gray-400">
              Notre approche combine performance technique, design moderne et architecture robuste pour des solutions durables.
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

      {/* Services Details Section */}
      <section className="py-16 md:py-24">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Nos services de développement
            </h2>
            <p className="text-gray-400">
              Solutions web complètes pour répondre à tous vos besoins numériques.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {services.map((service, index) => (
              <div 
                key={index}
                className="bg-gray-950/50 border border-gray-800 rounded-xl p-8 hover:border-[#BFFF00] transition-colors"
              >
                <h3 className="text-2xl font-semibold mb-3">{service.title}</h3>
                <p className="text-gray-300 mb-4">{service.description}</p>
                <p className="text-gray-400 text-sm">{service.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Technologies Section */}
      <section className="py-16 md:py-24 bg-gray-950">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Technologies de pointe
            </h2>
            <p className="text-gray-400">
              Nous utilisons les frameworks et librairies les plus modernes et performants pour vos projets.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
            {technologies.map((tech, index) => (
              <div 
                key={index}
                className="bg-black/50 border border-gray-800 rounded-xl p-6 text-center hover:border-[#BFFF00] transition-colors"
              >
                <div className="w-16 h-16 mx-auto mb-4 relative">
                  <Image
                    src={tech.logo}
                    alt={tech.name}
                    fill
                    className="object-contain"
                  />
                </div>
                <h3 className="font-semibold mb-2">{tech.name}</h3>
                <p className="text-gray-400 text-xs">{tech.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Portfolio Section */}


      {/* Process Section */}
      <section className="py-16 md:py-24 bg-gray-950">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Notre processus de développement
            </h2>
            <p className="text-gray-400">
              Une méthodologie éprouvée pour des projets livrés dans les temps et selon vos attentes.
            </p>
          </div>

          <div className="max-w-4xl mx-auto space-y-8">
            {/* Étape 1 */}
            <div className="flex flex-col md:flex-row items-start gap-4 md:gap-8">
              <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-full bg-[#BFFF00] text-black font-bold text-lg">
                1
              </div>
              <div className="flex-grow bg-black/50 border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors w-full">
                <h3 className="text-xl font-semibold mb-3">Analyse des besoins</h3>
                <p className="text-gray-400">Nous étudions en profondeur vos objectifs, votre public cible et vos exigences techniques pour proposer la solution optimale.</p>
              </div>
            </div>
            
            {/* Étape 2 */}
            <div className="flex flex-col md:flex-row items-start gap-4 md:gap-8">
              <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-full bg-[#BFFF00] text-black font-bold text-lg">
                2
              </div>
              <div className="flex-grow bg-black/50 border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors w-full">
                <h3 className="text-xl font-semibold mb-3">Architecture & Design</h3>
                <p className="text-gray-400">Élaboration de l'architecture technique et création des maquettes UI/UX pour valider l'expérience utilisateur.</p>
              </div>
            </div>
            
            {/* Étape 3 */}
            <div className="flex flex-col md:flex-row items-start gap-4 md:gap-8">
              <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-full bg-[#BFFF00] text-black font-bold text-lg">
                3
              </div>
              <div className="flex-grow bg-black/50 border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors w-full">
                <h3 className="text-xl font-semibold mb-3">Développement</h3>
                <p className="text-gray-400">Codage avec une méthodologie agile, permettant des ajustements et validations régulières tout au long du projet.</p>
              </div>
            </div>
            
            {/* Étape 4 */}
            <div className="flex flex-col md:flex-row items-start gap-4 md:gap-8">
              <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-full bg-[#BFFF00] text-black font-bold text-lg">
                4
              </div>
              <div className="flex-grow bg-black/50 border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors w-full">
                <h3 className="text-xl font-semibold mb-3">Tests & Optimisation</h3>
                <p className="text-gray-400">Tests approfondis de performance, compatibilité et sécurité, suivis d'optimisations pour une expérience parfaite.</p>
              </div>
            </div>
            
            {/* Étape 5 */}
            <div className="flex flex-col md:flex-row items-start gap-4 md:gap-8">
              <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-full bg-[#BFFF00] text-black font-bold text-lg">
                5
              </div>
              <div className="flex-grow bg-black/50 border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors w-full">
                <h3 className="text-xl font-semibold mb-3">Déploiement</h3>
                <p className="text-gray-400">Mise en production avec un processus de déploiement automatisé et sécurisé pour minimiser les risques.</p>
              </div>
            </div>
            
            {/* Étape 6 */}
            <div className="flex flex-col md:flex-row items-start gap-4 md:gap-8">
              <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-full bg-[#BFFF00] text-black font-bold text-lg">
                6
              </div>
              <div className="flex-grow bg-black/50 border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors w-full">
                <h3 className="text-xl font-semibold mb-3">Maintenance & Évolution</h3>
                <p className="text-gray-400">Support continu, mises à jour de sécurité et évolutions fonctionnelles pour garder votre site performant.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Performance Section */}
      <section className="py-16 md:py-24">
        <div className="container px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Performance technique exceptionnelle
              </h2>
              <p className="text-gray-400 mb-8">
                Nos développements web atteignent les plus hauts standards de performance technique, essentiels pour le SEO et l'expérience utilisateur.
              </p>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-[#BFFF00] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold">Core Web Vitals optimisés</h3>
                    <p className="text-gray-400">LCP, FID et CLS parfaitement optimisés pour satisfaire les exigences Google.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-[#BFFF00] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold">Architecture moderne</h3>
                    <p className="text-gray-400">Static Site Generation (SSG) et Server-Side Rendering (SSR) pour des performances maximales.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-[#BFFF00] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold">Optimisation des assets</h3>
                    <p className="text-gray-400">Images, CSS et JavaScript optimisés pour des temps de chargement minimaux.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-[#BFFF00] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold">PWA ready</h3>
                    <p className="text-gray-400">Compatibilité Progressive Web App pour une expérience mobile optimale.</p>
                  </div>
                </li>
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-gray-950 rounded-xl p-6 border border-gray-800">
                <p className="text-[#BFFF00] text-4xl font-bold mb-2">94+</p>
                <p className="text-gray-300">Score PageSpeed moyen</p>
              </div>
              <div className="bg-gray-950 rounded-xl p-6 border border-gray-800">
                <p className="text-[#BFFF00] text-4xl font-bold mb-2">&lt;1s</p>
                <p className="text-gray-300">Temps de chargement moyen</p>
              </div>
              <div className="bg-gray-950 rounded-xl p-6 border border-gray-800">
                <p className="text-[#BFFF00] text-4xl font-bold mb-2">100%</p>
                <p className="text-gray-300">Compatibilité mobile</p>
              </div>
              <div className="bg-gray-950 rounded-xl p-6 border border-gray-800">
                <p className="text-[#BFFF00] text-4xl font-bold mb-2">A+</p>
                <p className="text-gray-300">Note de sécurité SSL</p>
              </div>
            </div>
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
              Tout ce que vous devez savoir sur nos services de développement web.
            </p>
          </div>

          <div className="max-w-3xl mx-auto grid gap-6">
            <div className="border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors">
              <h3 className="text-xl font-semibold mb-3">Combien de temps faut-il pour développer un site web personnalisé?</h3>
              <p className="text-gray-400">La durée varie selon la complexité du projet. Un site vitrine prend généralement 4-6 semaines, tandis qu'une application web complexe peut nécessiter 3-6 mois de développement.</p>
            </div>
            <div className="border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors">
              <h3 className="text-xl font-semibold mb-3">Proposez-vous un hébergement pour les sites que vous développez?</h3>
              <p className="text-gray-400">Oui, nous proposons des solutions d'hébergement optimisées et sécurisées via nos partenaires cloud (AWS, Vercel, Digital Ocean). Nous gérons également la mise en place du SSL et la configuration des serveurs.</p>
            </div>
            <div className="border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors">
              <h3 className="text-xl font-semibold mb-3">Comment assurez-vous la compatibilité avec tous les navigateurs?</h3>
              <p className="text-gray-400">Nous testons systématiquement sur les navigateurs majeurs (Chrome, Firefox, Safari, Edge) et utilisons des outils comme Browserstack pour garantir une expérience cohérente. Nous appliquons également les bonnes pratiques de développement cross-browser.</p>
            </div>
            <div className="border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors">
              <h3 className="text-xl font-semibold mb-3">Proposez-vous des contrats de maintenance?</h3>
              <p className="text-gray-400">Absolument. Nous offrons plusieurs formules de maintenance incluant les mises à jour de sécurité, sauvegardes régulières, monitoring de performance, et un certain nombre d'heures de développement pour les évolutions fonctionnelles.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24">
        <div className="container px-4">
          <div className="max-w-4xl mx-auto bg-black/80 border border-gray-800 rounded-2xl p-8 md:p-12 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Prêt à lancer votre projet web?
            </h2>
            <p className="text-gray-400 mb-8 max-w-2xl mx-auto">
              Réservez un appel de consultation gratuit pour discuter de votre projet 
              et découvrir comment nous pouvons vous aider à créer une solution web performante.
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