import { Metadata } from "next"
import { ArrowRight, CheckCircle, MoveRight, Target, BarChart, Building, FileText, Mail, ShieldCheck } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Landing Page B2B | Cleads - Générez des leads qualifiés",
  description: "Développez votre portefeuille clients B2B avec nos landing pages optimisées pour la génération de leads qualifiés et la conversion business.",
  openGraph: {
    title: "Landing Page B2B | Cleads - Générez des leads qualifiés",
    description: "Développez votre portefeuille clients B2B avec nos landing pages optimisées pour la génération de leads qualifiés et la conversion business.",
    images: ["/images/b2b-hero.jpg"],
  },
  alternates: {
    canonical: "https://cleads.fr/services/b2b",
  }
}

const features = [
  {
    icon: Target,
    title: "Formulaires optimisés",
    description: "Formulaires de captation conçus pour maximiser les conversions tout en qualifiant vos prospects."
  },
  {
    icon: Building,
    title: "Design professionnel",
    description: "Interface élégante et crédible qui inspire confiance aux décideurs d'entreprise."
  },
  {
    icon: FileText,
    title: "Contenu stratégique",
    description: "Contenu orienté ROI et valeur business, adapté aux problématiques professionnelles."
  },
  {
    icon: Mail,
    title: "Intégration CRM",
    description: "Connexion transparente avec vos outils CRM pour un suivi efficace de vos leads."
  },
  {
    icon: BarChart,
    title: "Suivi analytics",
    description: "Tableau de bord détaillé pour analyser la qualité et la performance de vos leads."
  },
  {
    icon: ShieldCheck,
    title: "Sécurité renforcée",
    description: "Toutes les données sont protégées selon les meilleures pratiques de sécurité (chiffrement, accès restreint, RGPD)."
  }
]

const sectors = [
  {
    name: "Services financiers",
    image: "/placeholder.svg",
    description: "Landing pages adaptées aux services bancaires et assurances B2B, respectant les contraintes réglementaires."
  },
  {
    name: "SaaS & Tech",
    image: "/placeholder.svg",
    description: "Mises en avant des fonctionnalités techniques avec démonstrations et essais gratuits intégrés."
  },
  {
    name: "Infopreneur & Coaching",
    image: "/placeholder.svg",
    description: "Landing pages orientées sur la génération de leads pour les infopreneurs et les coaches"
  },
  {
    name: "Services aux entreprises",
    image: "/placeholder.svg",
    description: "Pages de génération de leads pour consultants, agences et prestataires de services."
  }
]

const testimonials = [
  {
    quote: "Grâce à notre nouvelle landing page B2B, notre coût par lead qualifié a diminué de 47% et notre taux de conversion a augmenté de 31%.",
    author: "Thomas M.",
    position: "Directeur Commercial",
    company: "SoftSolutions"
  },
  {
    quote: "La landing page créée par Cleads nous a permis de générer plus de 200 leads qualifiés par mois, transformant complètement notre pipeline commercial.",
    author: "Sophie L.",
    position: "CMO",
    company: "IndusTech"
  }
]

const stats = [
  { label: "Augmentation moyenne des leads", value: "+189%" },
  { label: "Réduction du coût par lead", value: "-47%" },
  { label: "Amélioration du taux de qualification", value: "+62%" },
  { label: "ROI moyen constaté", value: "3.8x" }
]

export default function B2BPage() {
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
                Landing Page B2B
              </span>
              <h1 className="text-4xl md:text-6xl font-bold mb-6">
                Générez des <span className="text-[#BFFF00]">leads qualifiés</span> pour votre business
              </h1>
              <p className="text-lg md:text-xl text-gray-400 mb-8">
                Nos landing pages B2B sont conçues pour capturer l'attention des décideurs et convertir vos visiteurs en prospects qualifiés.
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
                  <span className="flex items-center gap-2 ">
                    Étude de cas B2B
                    <MoveRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                </Button>
              </div>
            </div>
            <div className="relative">
              <div className="relative rounded-2xl overflow-hidden border border-gray-800 shadow-2xl">
                <Image
                  src="/services/b2b.png"
                  alt="Landing Page B2B exemple"
                  width={600}
                  height={400}
                  className="w-full h-auto"
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-black/80 via-transparent to-transparent" />
              </div>
              <div className="absolute -bottom-6 -right-6 bg-[#BFFF00] text-black p-4 rounded-lg shadow-lg">
                <p className="text-lg font-bold">+62%</p>
                <p className="text-sm">Leads qualifiés</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-10 md:py-16 bg-gray-950">
        <div className="container px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {stats.map((stat, index) => (
              <div 
                key={index}
                className="text-center p-6"
              >
                <p className="text-[#BFFF00] text-4xl md:text-5xl font-bold mb-2">{stat.value}</p>
                <p className="text-gray-400 text-sm md:text-base">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 md:py-24">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Des landing pages B2B <span className="text-[#BFFF00]">efficaces</span>
            </h2>
            <p className="text-gray-400">
              Conçues spécifiquement pour les cycles de vente B2B plus longs et les décisions d'achat complexes.
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

      {/* Sectors Section */}
      {/* <section className="py-16 md:py-24 bg-gray-950">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Solutions adaptées à votre secteur
            </h2>
            <p className="text-gray-400">
              Nos landing pages B2B sont personnalisées pour répondre aux spécificités de votre industrie.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {sectors.map((sector, index) => (
              <div 
                key={index}
                className="group relative overflow-hidden rounded-xl border border-gray-800 hover:border-[#BFFF00] transition-colors"
              >
                <div className="relative h-48">
                  <Image
                    src={sector.image}
                    alt={sector.name}
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent opacity-80" />
                  <div className="absolute bottom-0 left-0 right-0 p-6">
                    <h3 className="text-xl font-bold mb-2 group-hover:text-[#BFFF00]">{sector.name}</h3>
                    <p className="text-gray-300 text-sm">{sector.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section> */}

      {/* Process Section */}
      <section className="py-16 md:py-24">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Notre processus de création
            </h2>
            <p className="text-gray-400">
              Une approche méthodique en 5 étapes pour maximiser la génération de leads qualifiés.
            </p>
          </div>

          <div className="relative max-w-4xl mx-auto">
            <div className="absolute left-[19px] top-8 bottom-8 w-1 bg-gray-800"></div>
            
            <div className="space-y-12">
              <div className="relative flex gap-6">
                <div className="h-10 w-10 rounded-full bg-[#BFFF00] text-black flex items-center justify-center font-bold shrink-0 z-10">1</div>
                <div className="bg-gray-950/50 border border-gray-800 rounded-xl p-6 flex-1">
                  <h3 className="text-xl font-semibold mb-3">Analyse stratégique</h3>
                  <p className="text-gray-400">Identification de votre ICP (Ideal Customer Profile), analyse concurrentielle et définition précise des objectifs de conversion.</p>
                </div>
              </div>
              
              <div className="relative flex gap-6">
                <div className="h-10 w-10 rounded-full bg-[#BFFF00] text-black flex items-center justify-center font-bold shrink-0 z-10">2</div>
                <div className="bg-gray-950/50 border border-gray-800 rounded-xl p-6 flex-1">
                  <h3 className="text-xl font-semibold mb-3">Élaboration du message</h3>
                  <p className="text-gray-400">Définition de la proposition de valeur claire et des arguments commerciaux adaptés à vos cibles B2B.</p>
                </div>
              </div>
              
              <div className="relative flex gap-6">
                <div className="h-10 w-10 rounded-full bg-[#BFFF00] text-black flex items-center justify-center font-bold shrink-0 z-10">3</div>
                <div className="bg-gray-950/50 border border-gray-800 rounded-xl p-6 flex-1">
                  <h3 className="text-xl font-semibold mb-3">Conception et développement</h3>
                  <p className="text-gray-400">Création d'une interface intuitive et professionnelle avec formulaires optimisés pour la qualification des leads.</p>
                </div>
              </div>
              
              <div className="relative flex gap-6">
                <div className="h-10 w-10 rounded-full bg-[#BFFF00] text-black flex items-center justify-center font-bold shrink-0 z-10">4</div>
                <div className="bg-gray-950/50 border border-gray-800 rounded-xl p-6 flex-1">
                  <h3 className="text-xl font-semibold mb-3">Intégration CRM</h3>
                  <p className="text-gray-400">Connexion avec vos outils de vente et systèmes de gestion de leads pour un suivi commercial efficace.</p>
                </div>
              </div>
              
              <div className="relative flex gap-6">
                <div className="h-10 w-10 rounded-full bg-[#BFFF00] text-black flex items-center justify-center font-bold shrink-0 z-10">5</div>
                <div className="bg-gray-950/50 border border-gray-800 rounded-xl p-6 flex-1">
                  <h3 className="text-xl font-semibold mb-3">Optimisation continue</h3>
                  <p className="text-gray-400">Tests A/B, analyse des données et ajustements réguliers pour améliorer constamment la qualité et la quantité des leads.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Lead Quality Section */}
      <section className="py-16 md:py-24 bg-gray-950">
        <div className="container px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Qualité avant quantité
              </h2>
              <p className="text-gray-400 mb-8">
                Nous nous concentrons sur l'acquisition de leads qualifiés qui correspondent précisément à votre ICP (Ideal Customer Profile) pour maximiser votre taux de conversion commerciale.
              </p>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-[#BFFF00] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold">Formulaires intelligents</h3>
                    <p className="text-gray-400">Formulaires progressifs qui qualifient les leads sans créer de friction.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-[#BFFF00] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold">Lead scoring intégré</h3>
                    <p className="text-gray-400">Notation automatique des leads basée sur leur comportement et leurs caractéristiques.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-[#BFFF00] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold">Segmentation automatique</h3>
                    <p className="text-gray-400">Catégorisation des leads pour un suivi commercial personnalisé et efficace.</p>
                  </div>
                </li>
              </ul>
            </div>
            <div className="relative">
              <div className="relative rounded-2xl overflow-hidden border border-gray-800">
                <Image
                  src="/illustrations/qualite.png"
                  alt="Lead Quality Dashboard"
                  width={600}
                  height={400}
                  className="w-full h-auto"
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-black/50 via-transparent to-transparent" />
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
              Découvrez comment nos landing pages ont transformé la génération de leads de nos clients B2B.
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
              Tout ce que vous devez savoir sur nos services de landing page B2B.
            </p>
          </div>

          <div className="max-w-3xl mx-auto grid gap-6">
            <div className="border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors">
              <h3 className="text-xl font-semibold mb-3">Comment intégrez-vous les landing pages à notre processus de vente B2B?</h3>
              <p className="text-gray-400">Nous connectons votre landing page directement à votre CRM (Salesforce, HubSpot, etc.) pour automatiser l'intégration des leads dans votre pipeline commercial et faciliter le suivi par vos équipes de vente.</p>
            </div>
            <div className="border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors">
              <h3 className="text-xl font-semibold mb-3">Proposez-vous des landing pages pour différentes étapes du funnel B2B?</h3>
              <p className="text-gray-400">Oui, nous créons des landing pages adaptées à chaque étape du cycle d'achat B2B : sensibilisation (livres blancs, webinaires), considération (études de cas, démos) et décision (demandes de devis, essais).</p>
            </div>
            <div className="border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors">
              <h3 className="text-xl font-semibold mb-3">Comment optimisez-vous les formulaires pour les cycles de vente B2B?</h3>
              <p className="text-gray-400">Nous utilisons des formulaires progressifs qui collectent les informations par étapes, des questions de qualification stratégiques, et des mécanismes de lead scoring pour prioriser les leads les plus prometteurs.</p>
            </div>
            <div className="border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors">
              <h3 className="text-xl font-semibold mb-3">Peut-on intégrer des outils de prise de rendez-vous directement sur la landing page?</h3>
              <p className="text-gray-400">Absolument. Nous intégrons des solutions comme Calendly, HubSpot Meetings ou tout autre outil de scheduling pour permettre aux prospects qualifiés de réserver directement un appel avec vos équipes commerciales.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24">
        <div className="container px-4">
          <div className="max-w-4xl mx-auto bg-black/80 border border-gray-800 rounded-2xl p-8 md:p-12 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Prêt à transformer votre acquisition de leads B2B?
            </h2>
            <p className="text-gray-400 mb-8 max-w-2xl mx-auto">
              Réservez un appel de consultation gratuit pour discuter de votre projet 
              et découvrir comment nous pouvons vous aider à générer plus de leads qualifiés.
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