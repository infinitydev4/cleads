import { Metadata } from "next"
import { ArrowRight, CheckCircle, MoveRight, Search, BarChart3, Globe, TrendingUp, ListFilter, FileText } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "SEO | Cleads - Optimisation pour les moteurs de recherche",
  description: "Augmentez votre visibilité en ligne et votre trafic organique grâce à nos services d'optimisation SEO. Audit complet, stratégie de mots-clés et optimisation technique.",
  openGraph: {
    title: "SEO | Cleads - Optimisation pour les moteurs de recherche",
    description: "Augmentez votre visibilité en ligne et votre trafic organique grâce à nos services d'optimisation SEO. Audit complet, stratégie de mots-clés et optimisation technique.",
    images: ["/images/seo-hero.jpg"],
  },
  alternates: {
    canonical: "https://cleads.fr/services/seo",
  }
}

const features = [
  {
    icon: Search,
    title: "Audit complet",
    description: "Analyse approfondie de votre site web pour identifier tous les points d'amélioration SEO."
  },
  {
    icon: ListFilter,
    title: "Mots-clés ciblés",
    description: "Recherche et stratégie de mots-clés adaptés à votre secteur et à forte intention d'achat."
  },
  {
    icon: FileText,
    title: "Contenu optimisé",
    description: "Création et optimisation de contenus stratégiques pour le référencement et la conversion."
  },
  {
    icon: BarChart3,
    title: "Suivi des positions",
    description: "Monitoring précis de vos positionnements et de l'évolution de votre visibilité."
  },
  {
    icon: Globe,
    title: "SEO technique",
    description: "Optimisation de la structure, du code et de la performance de votre site."
  },
  {
    icon: TrendingUp,
    title: "SEO local",
    description: "Stratégies spécifiques pour le référencement local et Google My Business."
  }
]

const process = [
  {
    number: "01",
    title: "Audit & Analyse",
    description: "Audit complet de votre site et analyse concurrentielle pour établir un diagnostic précis."
  },
  {
    number: "02",
    title: "Stratégie de mots-clés",
    description: "Recherche et sélection des mots-clés prioritaires selon leur potentiel et votre activité."
  },
  {
    number: "03",
    title: "Optimisations techniques",
    description: "Mise en œuvre des corrections techniques et structurelles pour améliorer l'indexation."
  },
  {
    number: "04",
    title: "Création de contenu",
    description: "Production de contenus optimisés et stratégiques pour vos pages clés et votre blog."
  },
  {
    number: "05", 
    title: "Netlinking",
    description: "Stratégie d'acquisition de liens de qualité pour renforcer votre autorité en ligne."
  },
  {
    number: "06",
    title: "Suivi & Optimisation",
    description: "Monitoring des performances et ajustements continus pour maximiser les résultats."
  }
]

const results = [
  {
    metric: "+187%",
    title: "Augmentation du trafic organique",
    description: "Pour un site e-commerce spécialisé en 8 mois."
  },
  {
    metric: "Top 3",
    title: "Positionnement sur mots-clés stratégiques",
    description: "Pour une entreprise B2B sur des requêtes à forte valeur."
  },
  {
    metric: "+43%",
    title: "Augmentation du taux de conversion",
    description: "Pour un site de services grâce à l'optimisation du contenu."
  },
  {
    metric: "x3",
    title: "Leads générés via le trafic organique",
    description: "Pour une société de conseil en 6 mois."
  }
]

const seoTools = [
  {
    name: "Google Analytics",
    logo: <svg width="90" height="90" viewBox="0 0 90 90" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M58.9968 17.5909V71.5908C58.9968 77.6377 63.1641 80.9999 67.5871 80.9999C71.6777 80.9999 76.1773 78.1363 76.1773 71.5908V18C76.1773 12.4645 72.0867 9 67.5871 9C63.0874 9 58.9968 12.8224 58.9968 17.5909Z" fill="#F8AB00"/>
      <path d="M36.4984 44.9995V71.5904C36.4984 77.6373 40.6657 80.9995 45.0887 80.9995C49.1793 80.9995 53.6789 78.1359 53.6789 71.5904V45.4086C53.6789 39.8731 49.5883 36.4087 45.0887 36.4087C40.589 36.4087 36.4984 40.2311 36.4984 44.9995Z" fill="#E37300"/>
      <path d="M31.1805 72.4091C31.1805 77.152 27.3328 81 22.5903 81C17.8477 81 14 77.152 14 72.4091C14 67.6662 17.8477 63.8182 22.5903 63.8182C27.3328 63.8182 31.1805 67.6662 31.1805 72.4091Z" fill="#E37300"/>
    </svg>
  },
  {
    name: "SEMrush",
    logo: <svg width="90" height="90" viewBox="0 0 90 90" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="5" width="80" height="80" rx="8" fill="#FF642D"/>
    <path d="M62.1243 46.3092C62.1243 47.2348 61.6521 47.3859 60.4809 47.3859C59.2342 47.3859 59.0076 47.1781 58.8753 46.2336C58.6298 43.8347 57.0053 41.7947 54.2852 41.568C53.4163 41.4924 53.2085 41.1713 53.2085 40.0946C53.2085 39.0935 53.3596 38.6213 54.1341 38.6213C58.8564 38.6401 62.1243 42.4369 62.1243 46.3092ZM69 46.3092C69 39.1124 64.1266 31.5 52.8685 31.5H30.5036C30.0502 31.5 29.7669 31.7267 29.7669 32.1422C29.7669 32.3689 29.9369 32.5767 30.088 32.69C30.9003 33.3323 32.1092 34.0501 33.6959 34.8434C35.2448 35.6179 36.4537 36.1279 37.6626 36.619C38.1726 36.8268 38.3615 37.0534 38.3615 37.3368C38.3615 37.7335 38.0782 37.979 37.5304 37.979H19.7745C19.2456 37.979 19 38.319 19 38.659C19 38.9424 19.0944 39.1879 19.34 39.4335C20.7756 40.9446 23.0801 42.758 26.4235 44.8547C29.3513 46.687 32.9781 48.6703 35.8682 50.0493C36.3593 50.2759 36.5104 50.5404 36.5104 50.8237C36.4915 51.1448 36.2459 51.4093 35.6793 51.4093H27.538C27.0846 51.4093 26.8202 51.6549 26.8202 52.0326C26.8202 52.2404 26.9902 52.5049 27.2168 52.7127C29.068 54.3938 32.0336 56.2261 35.9815 57.9072C41.2516 60.155 46.5973 61.4962 52.6041 61.4962C63.9943 61.4962 69 52.9771 69 46.3092ZM54.1341 56.5283C48.5429 56.5283 43.8772 51.976 43.8772 46.3092C43.8772 40.718 48.5429 36.2412 54.1341 36.2412C59.8765 36.2412 64.3532 40.718 64.3532 46.3092C64.3343 51.976 59.8576 56.5283 54.1341 56.5283Z" fill="white"/>
    </svg>
    
  },
  {
    name: "Ahrefs",
    logo: <svg width="90" height="90" viewBox="0 0 90 90" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M77.4627 5.4707H13.4748C9.05316 5.4707 5.46875 9.05511 5.46875 13.4767V77.4647C5.46875 81.8863 9.05316 85.4707 13.4748 85.4707H77.4627C81.8843 85.4707 85.4688 81.8863 85.4688 77.4647V13.4767C85.4688 9.05512 81.8843 5.4707 77.4627 5.4707Z" fill="#054ADA"/>
    <path d="M26.2723 33.4979L49.1253 33.4611L48.9919 38.7888L40.2288 39.462C26.8447 40.46 22.4961 44.0931 22.4961 54.0029V56.0042C22.4961 63.2814 27.6757 68.237 35.4837 67.6287C42.0189 67.1194 49.0848 62.6671 49.0848 62.6671V67.0966H58.6631V23.73H26.1389L26.2723 33.5032V33.4979ZM49.0516 53.1989C44.3242 55.5501 42.1035 57.3492 38.1066 58.2304C34.1913 59.0936 32.0695 57.6394 32.2044 53.6368C32.3416 49.5691 34.1741 48.578 41.8957 47.9415L49.0516 47.1795V53.1989Z" fill="white"/>
    <path d="M58.663 23.6982H49.0679V33.4698H58.663V23.6982Z" fill="#FB8501"/>
    <path d="M68.2579 33.4688H58.6628V67.0994H68.2579V33.4688Z" fill="#FB8501"/>
    </svg>
    
  },
  {
    name: "Moz",
    logo: <svg width="90" height="90" viewBox="0 0 90 90" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fill-rule="evenodd" clip-rule="evenodd" d="M5 68.6221H18.0962C19.4487 68.6221 20.5547 67.516 20.5547 66.1635V43.4721L45 70.6982L69.4465 43.4721V66.1635C69.4465 67.516 70.5526 68.6221 71.905 68.6221H85V20H73.8803C70.6667 20 68.2713 21.548 66.9771 22.9879L45 47.464L23.0229 22.9879C21.7299 21.548 19.3333 20 16.1209 20H5V68.6221Z" fill="#24ABE2"/>
    </svg>
    
  },
  {
    name: "Google Tag Manager",
    logo: <svg width="90" height="90" viewBox="0 0 90 90" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M52.0057 81.7188L38.1035 68.1625L67.9602 37.6733L82.3538 51.7803L52.0057 81.7188Z" fill="#8AB4F8"/>
    <path d="M52.0659 21.7825L38.2138 7.63916L7.92483 37.6414C6.05188 39.5183 5 42.0616 5 44.7131C5 47.3647 6.05188 49.9079 7.92483 51.7848L37.7587 81.8144L51.8657 68.6175L29.1353 44.7131L52.0659 21.7825Z" fill="#4285F4"/>
    <path d="M82.1538 37.8738L52.1197 7.83965C50.234 6.00297 47.7008 4.98288 45.0685 5.00022C42.4362 5.01755 39.9167 6.07092 38.0553 7.93226C36.194 9.79361 35.1406 12.3132 35.1233 14.9455C35.1059 17.5777 36.126 20.1109 37.9627 21.9966L67.9968 52.0308C68.9219 52.9805 70.0264 53.7371 71.2462 54.2565C72.466 54.776 73.7768 55.0479 75.1026 55.0567C76.4284 55.0654 77.7427 54.8107 78.9693 54.3074C80.1958 53.8041 81.3102 53.0621 82.2477 52.1246C83.1852 51.1871 83.9271 50.0728 84.4304 48.8462C84.9338 47.6197 85.1884 46.3054 85.1797 44.9796C85.171 43.6538 84.899 42.343 84.3796 41.1231C83.8601 39.9033 83.1036 38.7988 82.1538 37.8738Z" fill="#8AB4F8"/>
    <path d="M44.8112 84.9998C50.2147 84.9998 54.595 80.6194 54.595 75.216C54.595 69.8125 50.2147 65.4321 44.8112 65.4321C39.4077 65.4321 35.0273 69.8125 35.0273 75.216C35.0273 80.6194 39.4077 84.9998 44.8112 84.9998Z" fill="#1967D2"/>
    </svg>
    
  },
  {
    name: "Google Search Console",
    logo: <svg width="90" height="90" viewBox="0 0 90 90" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M45.9997 37.7273V53.2183H67.527C66.5817 58.2002 63.745 62.4186 59.4905 65.2549L72.4724 75.3278C80.036 68.3461 84.3997 58.0914 84.3997 45.9096C84.3997 43.0733 84.1453 40.3457 83.6724 37.7278L45.9997 37.7273Z" fill="#4285F4"/>
    <path d="M23.5822 52.6137L20.6543 54.855L10.2904 62.9276C16.8722 75.9821 30.3622 85.0005 45.9986 85.0005C56.7984 85.0005 65.8529 81.4368 72.4713 75.3278L59.4894 65.255C55.9258 67.655 51.3802 69.1097 45.9986 69.1097C35.5986 69.1097 26.7624 62.0915 23.5985 52.6368L23.5822 52.6137Z" fill="#34A853"/>
    <path d="M10.2906 27.0729C7.56349 32.4545 6 38.5274 6 45C6 51.4727 7.56323 57.546 10.2904 62.9276C10.2904 62.9637 23.6001 52.5998 23.6001 52.5998C22.8001 50.1998 22.3272 47.6545 22.3272 44.9996C22.3272 42.3447 22.8001 39.7994 23.6001 37.3994L10.2906 27.0729Z" fill="#FBBC05"/>
    <path d="M45.9994 20.9274C51.8905 20.9274 57.1268 22.9637 61.3086 26.891L72.7631 15.4366C65.8176 8.96391 56.7997 5 45.9994 5C30.3631 5 16.8725 13.9819 10.2906 27.0729L23.5994 37.4002C26.7629 27.9455 35.5994 20.9274 45.9994 20.9274Z" fill="#EA4335"/>
    </svg>
    
  }
]

export default function SeoPage() {
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
                Optimisation SEO
              </span>
              <h1 className="text-4xl md:text-6xl font-bold mb-6">
                Boostez votre <span className="text-[#BFFF00]">visibilité</span> sur Google
              </h1>
              <p className="text-lg md:text-xl text-gray-400 mb-8">
                Notre expertise SEO vous permet d'attirer un trafic qualifié, d'augmenter votre notoriété et de générer plus de leads grâce au référencement naturel.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  size="lg"
                  className="group relative bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
                >
                  <span className="flex items-center gap-2">
                    Audit SEO gratuit
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                </Button>
                <Button 
                  size="lg"
                  variant="outline"
                  className="group relative border-gray-600 text-black hover:bg-white/5 hover:text-white"
                >
                  <span className="flex items-center gap-2">
                    Nos études de cas
                    <MoveRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                </Button>
              </div>
            </div>
            <div className="relative">
              <div className="relative rounded-2xl overflow-hidden border border-gray-800 shadow-2xl">
                <Image
                  src="/services/seo.png"
                  alt="SEO services illustration"
                  width={600}
                  height={400}
                  className="w-full h-auto"
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-black/80 via-transparent to-transparent" />
              </div>
              <div className="absolute -bottom-6 -right-6 bg-[#BFFF00] text-black p-4 rounded-lg shadow-lg">
                <p className="text-lg font-bold">+187%</p>
                <p className="text-sm">Trafic organique</p>
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
              Services SEO <span className="text-[#BFFF00]">complets</span>
            </h2>
            <p className="text-gray-400">
              Notre approche holistique du référencement naturel couvre tous les aspects nécessaires pour maximiser votre visibilité en ligne.
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

      {/* Why SEO Section */}
      <section className="py-16 md:py-24">
        <div className="container px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="relative">
              <div className="relative rounded-2xl overflow-hidden border border-gray-800">
                <Image
                  src="/illustrations/seo-illustration.png"
                  alt="SEO strategy illustration"
                  width={600}
                  height={400}
                  className="w-full h-auto"
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-black/50 via-transparent to-transparent" />
              </div>
            </div>
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Pourquoi investir dans le SEO?
              </h2>
              <p className="text-gray-400 mb-8">
                Le référencement naturel est l'un des canaux d'acquisition les plus rentables à long terme, avec un ROI supérieur aux autres leviers marketing digitaux.
              </p>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-[#BFFF00] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold">Trafic qualifié et intentionnel</h3>
                    <p className="text-gray-400">Des visiteurs qui recherchent activement vos produits ou services.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-[#BFFF00] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold">Crédibilité et confiance</h3>
                    <p className="text-gray-400">Un bon positionnement renforce votre autorité et inspire confiance.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-[#BFFF00] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold">ROI durable</h3>
                    <p className="text-gray-400">Contrairement au SEA, les effets du SEO perdurent dans le temps.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-[#BFFF00] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold">Avantage concurrentiel</h3>
                    <p className="text-gray-400">Devancez vos concurrents sur les requêtes stratégiques de votre marché.</p>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="py-16 md:py-24 bg-gray-950">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Notre méthodologie SEO
            </h2>
            <p className="text-gray-400">
              Une approche structurée et transparente pour garantir des résultats mesurables.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {process.map((step) => (
              <div 
                key={step.number}
                className="relative bg-black/50 border border-gray-800 rounded-xl p-8 hover:border-[#BFFF00] transition-colors"
              >
                <span className="absolute -top-4 -left-4 flex items-center justify-center bg-[#BFFF00] text-black h-12 w-12 rounded-full text-xl font-bold">
                  {step.number}
                </span>
                <div className="pt-4">
                  <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
                  <p className="text-gray-400">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Results Section */}
      <section className="py-16 md:py-24">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Résultats concrets
            </h2>
            <p className="text-gray-400">
              Des performances mesurables et des métriques qui impactent directement votre activité.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {results.map((result, index) => (
              <div 
                key={index}
                className="bg-gray-950/70 border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors text-center"
              >
                <p className="text-[#BFFF00] text-4xl md:text-5xl font-bold mb-4">{result.metric}</p>
                <h3 className="text-lg font-semibold mb-2">{result.title}</h3>
                <p className="text-gray-400 text-sm">{result.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SEO Audit CTA */}
      <section className="py-16 md:py-24 bg-gray-950">
        <div className="container px-4">
          <div className="max-w-4xl mx-auto bg-black/60 border border-gray-800 rounded-2xl p-8 md:p-12">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold mb-4">
                  Audit SEO gratuit
                </h2>
                <p className="text-gray-400 mb-6">
                  Découvrez votre potentiel d'optimisation SEO avec notre audit complet. Nous analyserons en détail votre site et identifierons les opportunités d'amélioration.
                </p>
                <Button 
                  className="group relative bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90 w-full md:w-auto"
                >
                  <span className="flex items-center gap-2">
                    Demander mon audit gratuit
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                </Button>
              </div>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-[#BFFF00] shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-300">Analyse technique complète</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-[#BFFF00] shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-300">Étude de vos mots-clés actuels</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-[#BFFF00] shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-300">Analyse de votre profil de liens</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-[#BFFF00] shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-300">Analyse concurrentielle</p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-[#BFFF00] shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-300">Recommandations prioritaires</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tools Section */}
      <section className="py-16 md:py-24">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Outils professionnels
            </h2>
            <p className="text-gray-400">
              Nous utilisons les meilleurs outils SEO du marché pour analyser, optimiser et suivre vos performances.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {seoTools.map((tool) => (
              <div 
                key={tool.name}
                className="bg-gray-950/50 border border-gray-800 rounded-xl p-4 flex items-center justify-center h-24"
              >
                <div className="flex flex-col items-center justify-center w-full">
                  <div className="h-16 w-16 flex items-center justify-center">
                    {tool.logo}
                  </div>
                  <p className="text-xs mt-2 text-gray-400">{tool.name}</p>
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
              Tout ce que vous devez savoir sur nos services d'optimisation SEO.
            </p>
          </div>

          <div className="max-w-3xl mx-auto grid gap-6">
            <div className="border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors">
              <h3 className="text-xl font-semibold mb-3">Combien de temps faut-il pour voir des résultats SEO?</h3>
              <p className="text-gray-400">Le SEO est un travail de fond qui donne des résultats progressifs. Les premiers effets sont généralement visibles après 3-4 mois, avec une amélioration continue au fil du temps. Certains mots-clés très concurrentiels peuvent nécessiter 6-12 mois d'efforts.</p>
            </div>
            <div className="border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors">
              <h3 className="text-xl font-semibold mb-3">Comment mesurez-vous les performances SEO?</h3>
              <p className="text-gray-400">Nous suivons de nombreux KPIs : positions sur les mots-clés ciblés, trafic organique, taux de clic (CTR), taux de rebond, temps passé sur le site, conversion depuis le trafic organique, etc. Vous recevez un rapport détaillé mensuel.</p>
            </div>
            <div className="border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors">
              <h3 className="text-xl font-semibold mb-3">Votre approche SEO est-elle conforme aux règles de Google?</h3>
              <p className="text-gray-400">Absolument. Nous pratiquons exclusivement du SEO "white hat" conforme aux directives de Google. Nous n'utilisons aucune technique risquée qui pourrait entraîner des pénalités à court ou long terme.</p>
            </div>
            <div className="border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors">
              <h3 className="text-xl font-semibold mb-3">Quelle est la différence entre SEO et SEA?</h3>
              <p className="text-gray-400">Le SEO (Search Engine Optimization) concerne le référencement naturel/organique, tandis que le SEA (Search Engine Advertising) désigne les annonces payantes sur les moteurs de recherche. Le SEO demande plus de temps mais offre des résultats durables, alors que le SEA génère du trafic immédiat mais s'arrête dès que vous cessez de payer.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24">
        <div className="container px-4">
          <div className="max-w-4xl mx-auto bg-black/80 border border-gray-800 rounded-2xl p-8 md:p-12 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Prêt à améliorer votre visibilité en ligne?
            </h2>
            <p className="text-gray-400 mb-8 max-w-2xl mx-auto">
              Réservez un appel de consultation gratuit pour discuter de votre projet SEO
              et découvrir comment nous pouvons vous aider à atteindre le sommet des résultats de recherche.
            </p>
            <Button 
              size="lg"
              className="group relative bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
            >
              <span className="flex items-center gap-2">
                Booster mon référencement
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </span>
            </Button>
          </div>
        </div>
      </section>
    </main>
  )
} 