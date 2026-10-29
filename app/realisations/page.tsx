import { Metadata } from "next"
import { ArrowRight, CheckCircle, MoveRight } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Réalisations | Cleads - Projets web et marketing digital",
  description: "Découvrez nos dernières réalisations de sites web et d'applications. Études de cas, projets pour des clients de différents secteurs.",
  openGraph: {
    title: "Réalisations | Cleads - Projets web et marketing digital",
    description: "Découvrez nos dernières réalisations de sites web et d'applications. Études de cas, projets pour des clients de différents secteurs.",
    images: ["/images/realisations-hero.jpg"],
  },
  alternates: {
    canonical: "https://cleads.fr/realisations",
  }
}

const projects = [
  {
    title: "EcoShop",
    description: "Boutique en ligne pour produits écologiques avec un tunnel d'achat optimisé.",
    category: "E-commerce",
    url: "https://www.hocjob.com/",
    domain: "www.hocjob.com",
    isLive: true
  },
  {
    title: "Timothée Moiroux",
    description: "Site vitrine pour un infopreneur dans le domaine de l'immobilier",
    category: "Site vitrine",
    url: "https://www.timotheemoiroux.com/",
    domain: "www.timotheemoiroux.com",
    isLive: false
  },
  {
    title: "Mindeo",
    description: "Site vitrine pour un groupe médical avec système de prise de rendez-vous.",
    category: "Site institutionnel",
    url: "https://www.mindeo.com/",
    domain: "www.mindeo.com/",
    isLive: false
  },
  {
    title: "Vtc Nantes Pro",
    description: "Site pour une entreprise de transport de personnes avec des véhicules de luxe.",
    category: "Site professionnel",
    url: "https://vtcnantespro.com/",
    domain: "vtcnantespro.com",
    isLive: true
  },
  {
    title: "LuckyHour",
    description: "Plateforme de concours en ligne permettant de gagner des montres de luxe et autres accessoires.",
    category: "E-commerce",
    url: "https://luckyhour.uk/",
    domain: "luckyhour.uk",
    isLive: true
  },
  {
    title: "MontreAdore",
    description: "Site de jeux concours spécialisé dans les produits de luxe avec système de participation sécurisé.",
    category: "E-commerce",
    url: "https://montreadore.fr/",
    domain: "montreadore.fr",
    isLive: true
  },
  {
    title: "Rockin' Smile",
    description: "Plateforme de crypto-monnaies meme avec interface moderne et animations attractives.",
    category: "Finance",
    url: "https://rockinsmile.xyz/",
    domain: "rockinsmile.xyz",
    isLive: true
  },
  {
    title: "Isolations",
    description: "Site pour une entreprise de matériaux isolants avec une interface moderne et une gestion de stock.",
    category: "E-commerce",
    url: "https://www.isolations.fr/",
    domain: "www.isolations.fr",
    isLive: true
  },
  {
    title: "TTP-IT",
    description: "Services de déploiement et assistance informatique pour entreprises avec suivi de projet.",
    category: "Services B2B",
    url: "https://ttp-it.fr/",
    domain: "ttp-it.fr",
    isLive: true
  },
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

export default function RealisationsPage() {
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
          <div className="max-w-3xl mx-auto text-center">
            <span className="inline-block bg-[#BFFF00]/10 text-[#BFFF00] px-4 py-2 rounded-full text-sm font-medium mb-6">
              Nos réalisations
            </span>
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              Découvrez nos <span className="text-[#BFFF00]">projets</span> récents
            </h1>
            <p className="text-lg md:text-xl text-gray-400 mb-8">
              Une sélection de sites web et d'applications conçus et développés par notre équipe.
              Des projets variés pour des clients de différents secteurs.
            </p>
          </div>
        </div>
      </section>

      {/* Projets Section */}
      <section className="py-16 md:py-24">
        <div className="container px-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {projects.map((project) => (
              <div 
                key={project.title}
                className="group relative overflow-hidden border border-gray-800 hover:border-[#BFFF00] transition-colors bg-black/50 rounded-xl h-[650px]"
              >
                {/* Mockup de navigateur */}
                <div className="relative w-full h-full flex flex-col">
                  {/* Barre d'adresse du navigateur */}
                  <div className="h-10 bg-gray-900 rounded-t-xl flex items-center px-3 gap-2 border-b border-gray-800 flex-shrink-0">
                    <div className="flex space-x-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-500"></div>
                      <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                      <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    </div>
                    <div className="flex-1 mx-2">
                      <div className="bg-gray-800 rounded-md h-6 flex items-center px-3 text-xs text-gray-400 truncate">
                        <span className="hidden sm:inline">https://</span>{project.domain}
                      </div>
                    </div>
                    <div className="flex space-x-1">
                      <div className="w-6 h-6 flex items-center justify-center text-gray-400">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                      </div>
                      <div className="w-6 h-6 flex items-center justify-center text-gray-400">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  
                  {/* Contenu du navigateur */}
                  <div className="flex-grow bg-white overflow-hidden">
                    <iframe 
                      src={project.url} 
                      title={`${project.title} - ${project.category}`}
                      className="w-full h-full"
                      loading="lazy"
                      style={{ border: 'none' }}
                    ></iframe>
                  </div>
                  
                  {/* Badge */}
                  <div className="absolute top-12 right-2 bg-[#BFFF00] text-black text-xs font-medium px-2 py-1 rounded-md z-10">
                    {project.isLive ? 'Site live' : 'Demo'}
                  </div>
                </div>
                
                {/* Informations du projet */}
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black to-transparent">
                  <span className="text-[#BFFF00] text-sm block mb-1">{project.category}</span>
                  <h3 className="text-xl font-bold mb-2 group-hover:text-[#BFFF00]">{project.title}</h3>
                  <p className="text-gray-300 text-sm">{project.description}</p>
                </div>
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

      {/* Process Section */}
      <section className="py-16 md:py-24">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Notre processus de développement
            </h2>
            <p className="text-gray-400">
              Chaque projet est réalisé selon une méthodologie éprouvée pour garantir les meilleurs résultats.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <ul className="space-y-6">
                <li className="flex items-start gap-3">
                  <div className="flex items-center justify-center shrink-0 bg-[#BFFF00]/10 h-10 w-10 rounded-full">
                    <span className="text-[#BFFF00] font-bold">1</span>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Analyse des besoins</h3>
                    <p className="text-gray-400">Nous étudions en profondeur vos objectifs, votre public cible et vos exigences techniques.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex items-center justify-center shrink-0 bg-[#BFFF00]/10 h-10 w-10 rounded-full">
                    <span className="text-[#BFFF00] font-bold">2</span>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Conception UX/UI</h3>
                    <p className="text-gray-400">Création des wireframes et des maquettes pour valider l'expérience utilisateur avant développement.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex items-center justify-center shrink-0 bg-[#BFFF00]/10 h-10 w-10 rounded-full">
                    <span className="text-[#BFFF00] font-bold">3</span>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Développement</h3>
                    <p className="text-gray-400">Codage avec une méthodologie agile, permettant des ajustements et validations régulières.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex items-center justify-center shrink-0 bg-[#BFFF00]/10 h-10 w-10 rounded-full">
                    <span className="text-[#BFFF00] font-bold">4</span>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Tests et déploiement</h3>
                    <p className="text-gray-400">Vérification approfondie avant mise en production et configuration de l'environnement de production.</p>
                  </div>
                </li>
              </ul>
            </div>
            <div className="relative rounded-2xl overflow-hidden border border-gray-800">
              <Image
                src="/illustrations/developpement-web.png"
                alt="Notre processus de développement"
                width={600}
                height={400}
                className="w-full h-auto"
              />
              <div className="absolute inset-0 bg-gradient-to-tr from-black/50 via-transparent to-transparent" />
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24 bg-gray-950">
        <div className="container px-4">
          <div className="max-w-4xl mx-auto bg-black/80 border border-gray-800 rounded-2xl p-8 md:p-12 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Prêt à lancer votre projet web?
            </h2>
            <p className="text-gray-400 mb-8 max-w-2xl mx-auto">
              Discutons de votre projet et voyons comment nous pouvons vous aider à le concrétiser.
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

