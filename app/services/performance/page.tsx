import { Metadata } from "next"
import { ArrowRight, CheckCircle, MoveRight, Zap, Eye, BarChart, MousePointer, Activity, LineChart } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Optimisation de la Conversion | Cleads - Maximisez votre ROI",
  description: "Optimisez votre taux de conversion et votre ROI avec nos services d'analyse UX, tests utilisateurs, optimisation des CTA et rapports détaillés.",
  openGraph: {
    title: "Optimisation de la Conversion | Cleads - Maximisez votre ROI",
    description: "Optimisez votre taux de conversion et votre ROI avec nos services d'analyse UX, tests utilisateurs, optimisation des CTA et rapports détaillés.",
    images: ["/images/performance-hero.jpg"],
  },
  alternates: {
    canonical: "https://cleads.fr/services/performance",
  }
}

const features = [
  {
    icon: Eye,
    title: "Analyse UX",
    description: "Étude approfondie du parcours utilisateur pour identifier les frictions et opportunités d'amélioration."
  },
  {
    icon: MousePointer,
    title: "Tests utilisateurs",
    description: "Tests réels avec des utilisateurs pour comprendre leurs comportements et attentes."
  },
  {
    icon: Zap,
    title: "Optimisation CTA",
    description: "Amélioration des éléments d'action pour augmenter les taux de clic et de conversion."
  },
  {
    icon: Activity,
    title: "A/B Testing",
    description: "Tests comparatifs pour identifier les variantes les plus performantes."
  },
  {
    icon: BarChart,
    title: "Analytics avancés",
    description: "Mise en place d'un suivi précis pour mesurer l'impact de chaque optimisation."
  },
  {
    icon: LineChart,
    title: "Rapports détaillés",
    description: "Reporting transparent avec insights actionnables et ROI démontré."
  }
]

const services = [
  {
    title: "Audit de conversion",
    description: "Analyse complète de votre entonnoir de conversion actuel pour identifier les opportunités d'optimisation.",
    bullets: [
      "Analyse des données utilisateurs",
      "Identification des points de friction",
      "Benchmark concurrentiel",
      "Recommandations priorisées"
    ]
  },
  {
    title: "Optimisation UX/UI",
    description: "Amélioration de l'expérience utilisateur et de l'interface pour guider les visiteurs vers la conversion.",
    bullets: [
      "Parcours utilisateur optimisés",
      "Design orienté conversion",
      "Optimisation des formulaires",
      "Amélioration de la navigation"
    ]
  },
  {
    title: "A/B & Multivariate Testing",
    description: "Tests systématiques pour évaluer l'efficacité des différentes versions et approches.",
    bullets: [
      "Définition des hypothèses",
      "Mise en place des tests",
      "Analyse des résultats",
      "Itération continue"
    ]
  },
  {
    title: "Optimisation de la page d'atterrissage",
    description: "Refonte stratégique des landing pages pour maximiser le taux de conversion.",
    bullets: [
      "Structure persuasive",
      "Copy optimisé",
      "Éléments de confiance",
      "CTAs stratégiques"
    ]
  }
]

const results = [
  { before: "2.3%", after: "7.8%", label: "Taux de conversion" },
  { before: "32%", after: "18%", label: "Taux de rebond" },
  { before: "€85", after: "€135", label: "Panier moyen" },
  { before: "3.2%", after: "6.5%", label: "Taux de clic CTA" }
]

const testimonials = [
  {
    quote: "Les optimisations CRO mises en place par Cleads nous ont permis d'augmenter notre taux de conversion de 68% en seulement 3 mois. Un ROI exceptionnel.",
    author: "Sophie M.",
    position: "Directrice Marketing",
    company: "BeautyBoutique"
  },
  {
    quote: "Grâce à l'approche data-driven de Cleads, nous avons identifié les véritables points de friction de notre tunnel d'achat et pu les corriger rapidement.",
    author: "Antoine L.",
    position: "E-commerce Manager",
    company: "TechStore"
  }
]

const performanceTools = [
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
export default function PerformancePage() {
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
                Optimisation de la Conversion
              </span>
              <h1 className="text-4xl md:text-6xl font-bold mb-6">
                Transformez vos visiteurs en <span className="text-[#BFFF00]">clients</span>
              </h1>
              <p className="text-lg md:text-xl text-gray-400 mb-8">
                Nos services d'optimisation de la conversion (CRO) vous permettent de maximiser la performance de votre site et d'augmenter significativement votre ROI.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  size="lg"
                  className="group relative bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
                >
                  <span className="flex items-center gap-2">
                    Audit conversion gratuit
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                </Button>
                <Button 
                  size="lg"
                  variant="outline"
                  className="group relative border-gray-600 text-black hover:bg-white/5 hover:text-white"
                >
                  <span className="flex items-center gap-2">
                    Voir nos résultats
                    <MoveRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                </Button>
              </div>
            </div>
            <div className="relative">
              <div className="relative rounded-2xl overflow-hidden border border-gray-800 shadow-2xl">
                <Image
                  src="/services/performance.png"
                  alt="Optimisation de la conversion"
                  width={600}
                  height={400}
                  className="w-full h-auto"
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-black/80 via-transparent to-transparent" />
              </div>
              <div className="absolute -bottom-6 -right-6 bg-[#BFFF00] text-black p-4 rounded-lg shadow-lg">
                <p className="text-lg font-bold">+215%</p>
                <p className="text-sm">ROI moyen</p>
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
              Services CRO <span className="text-[#BFFF00]">complets</span>
            </h2>
            <p className="text-gray-400">
              Notre méthodologie data-driven d'optimisation de la conversion pour maximiser vos résultats.
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

      {/* Why CRO Section */}
      <section className="py-16 md:py-24">
        <div className="container px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Pourquoi l'optimisation de conversion est cruciale
              </h2>
              <p className="text-gray-400 mb-8">
                Multiplier votre taux de conversion par 2 équivaut à doubler votre budget marketing sans dépenser un centime de plus.
              </p>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-[#BFFF00] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold">Maximisez votre trafic existant</h3>
                    <p className="text-gray-400">Tirez le meilleur parti des visiteurs que vous attirez déjà sur votre site.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-[#BFFF00] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold">Réduisez votre coût d'acquisition</h3>
                    <p className="text-gray-400">Diminuez le coût pour acquérir chaque nouveau client ou lead.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-[#BFFF00] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold">Améliorez l'expérience utilisateur</h3>
                    <p className="text-gray-400">Un site optimisé pour la conversion offre une meilleure expérience utilisateur.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-[#BFFF00] shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold">Obtenez des insights précieux</h3>
                    <p className="text-gray-400">Découvrez ce qui motive réellement vos clients à passer à l'action.</p>
                  </div>
                </li>
              </ul>
            </div>
            <div className="relative">
              <div className="relative rounded-2xl overflow-hidden border border-gray-800">
                <Image
                  src="/illustrations/conversion.png"
                  alt="Optimisation ROI"
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

      {/* Services Section */}
      <section className="py-16 md:py-24 bg-gray-950">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Nos services d'optimisation
            </h2>
            <p className="text-gray-400">
              Une approche complète pour améliorer chaque aspect de votre entonnoir de conversion.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {services.map((service, index) => (
              <div 
                key={index}
                className="bg-black/50 border border-gray-800 rounded-xl p-8 hover:border-[#BFFF00] transition-colors"
              >
                <h3 className="text-xl font-semibold mb-4">{service.title}</h3>
                <p className="text-gray-400 mb-6">{service.description}</p>
                <ul className="space-y-2">
                  {service.bullets.map((bullet, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-[#BFFF00] shrink-0 mt-0.5" />
                      <span className="text-gray-300">{bullet}</span>
                    </li>
                  ))}
                </ul>
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
              Notre méthodologie CRO
            </h2>
            <p className="text-gray-400">
              Un processus scientifique et itératif pour des améliorations constantes.
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            <div className="relative py-8">
              <div className="absolute left-[25px] top-0 bottom-0 w-1 bg-gray-800"></div>
              
              <div className="space-y-12">
                <div className="relative flex gap-8">
                  <div className="h-12 w-12 rounded-full bg-[#BFFF00] text-black flex items-center justify-center font-bold text-xl shrink-0 z-10">1</div>
                  <div className="pt-1">
                    <h3 className="text-2xl font-semibold mb-2">Recherche & Analyse</h3>
                    <p className="text-gray-400">Analyse de données, cartographie du parcours utilisateur, analyse heuristique et recherche qualitative pour comprendre les besoins et comportements des utilisateurs.</p>
                  </div>
                </div>
                
                <div className="relative flex gap-8">
                  <div className="h-12 w-12 rounded-full bg-[#BFFF00] text-black flex items-center justify-center font-bold text-xl shrink-0 z-10">2</div>
                  <div className="pt-1">
                    <h3 className="text-2xl font-semibold mb-2">Formulation d'hypothèses</h3>
                    <p className="text-gray-400">Identification des opportunités d'amélioration et développement d'hypothèses testables basées sur les données et recherches.</p>
                  </div>
                </div>
                
                <div className="relative flex gap-8">
                  <div className="h-12 w-12 rounded-full bg-[#BFFF00] text-black flex items-center justify-center font-bold text-xl shrink-0 z-10">3</div>
                  <div className="pt-1">
                    <h3 className="text-2xl font-semibold mb-2">Priorisation</h3>
                    <p className="text-gray-400">Classification des tests selon leur potentiel d'impact, facilité de mise en œuvre et ressources nécessaires pour maximiser le ROI.</p>
                  </div>
                </div>
                
                <div className="relative flex gap-8">
                  <div className="h-12 w-12 rounded-full bg-[#BFFF00] text-black flex items-center justify-center font-bold text-xl shrink-0 z-10">4</div>
                  <div className="pt-1">
                    <h3 className="text-2xl font-semibold mb-2">Test & Implémentation</h3>
                    <p className="text-gray-400">Conception et exécution de tests A/B, multivariés ou séquentiels pour valider les hypothèses avec un niveau de confiance statistique élevé.</p>
                  </div>
                </div>
                
                <div className="relative flex gap-8">
                  <div className="h-12 w-12 rounded-full bg-[#BFFF00] text-black flex items-center justify-center font-bold text-xl shrink-0 z-10">5</div>
                  <div className="pt-1">
                    <h3 className="text-2xl font-semibold mb-2">Analyse & Apprentissage</h3>
                    <p className="text-gray-400">Évaluation approfondie des résultats des tests, documentation des apprentissages et développement de nouvelles hypothèses basées sur ces insights.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Results Section */}
      <section className="py-16 md:py-24 bg-gray-950">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Résultats moyens obtenus
            </h2>
            <p className="text-gray-400">
              Nos optimisations génèrent des améliorations significatives et mesurables.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {results.map((result, index) => (
              <div 
                key={index}
                className="bg-black/50 border border-gray-800 rounded-xl p-6 text-center"
              >
                <div className="flex items-center justify-center gap-4 mb-4">
                  <div className="px-3 py-2 bg-red-500/20 rounded text-red-400">
                    {result.before}
                  </div>
                  <ArrowRight className="h-5 w-5 text-gray-500" />
                  <div className="px-3 py-2 bg-green-500/20 rounded text-green-400">
                    {result.after}
                  </div>
                </div>
                <p className="text-gray-300">{result.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-16 md:py-24">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Ce que nos clients disent
            </h2>
            <p className="text-gray-400">
              Découvrez comment nos services d'optimisation ont transformé les résultats de nos clients.
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

      {/* Tools Section */}
      <section className="py-16 md:py-24 bg-gray-950">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Nos outils d'optimisation
            </h2>
            <p className="text-gray-400">
              Nous utilisons les meilleurs outils du marché pour analyser, tester et optimiser.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
            {performanceTools.map((tool) => (
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
      <section className="py-16 md:py-24">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Questions fréquentes
            </h2>
            <p className="text-gray-400">
              Tout ce que vous devez savoir sur nos services d'optimisation de conversion.
            </p>
          </div>

          <div className="max-w-3xl mx-auto grid gap-6">
            <div className="border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors">
              <h3 className="text-xl font-semibold mb-3">Combien de temps faut-il pour voir des résultats d'optimisation?</h3>
              <p className="text-gray-400">Les premiers résultats sont généralement visibles dans les 4 à 8 semaines, selon le volume de trafic de votre site. Les tests nécessitent suffisamment de données pour atteindre une signification statistique fiable.</p>
            </div>
            <div className="border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors">
              <h3 className="text-xl font-semibold mb-3">Quel trafic minimum est nécessaire pour l'optimisation CRO?</h3>
              <p className="text-gray-400">Pour des tests A/B efficaces, nous recommandons un minimum de 1000 conversions par mois sur la page ou le processus à optimiser. Pour les sites à trafic plus faible, nous utilisons des approches qualitatives et des méthodes adaptées.</p>
            </div>
            <div className="border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors">
              <h3 className="text-xl font-semibold mb-3">Comment mesurez-vous le succès des optimisations?</h3>
              <p className="text-gray-400">Nous suivons plusieurs KPIs selon vos objectifs : taux de conversion, revenu par utilisateur, valeur du panier moyen, taux d'abandon, etc. Nous calculons également le ROI de chaque optimisation pour démontrer sa valeur commerciale.</p>
            </div>
            <div className="border border-gray-800 rounded-xl p-6 hover:border-[#BFFF00] transition-colors">
              <h3 className="text-xl font-semibold mb-3">L'optimisation CRO peut-elle affecter négativement le SEO?</h3>
              <p className="text-gray-400">Non, nous veillons à ce que toutes nos optimisations soient compatibles avec les bonnes pratiques SEO. Nous utilisons des méthodes de test qui n'affectent pas l'indexation ou le classement de votre site dans les moteurs de recherche.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24 bg-gray-950">
        <div className="container px-4">
          <div className="max-w-4xl mx-auto bg-black/80 border border-gray-800 rounded-2xl p-8 md:p-12 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Prêt à optimiser vos conversions?
            </h2>
            <p className="text-gray-400 mb-8 max-w-2xl mx-auto">
              Réservez un audit de conversion gratuit pour découvrir comment nous pouvons vous aider à transformer plus de visiteurs en clients.
            </p>
            <Button 
              size="lg"
              className="group relative bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
            >
              <span className="flex items-center gap-2">
                Demander mon audit gratuit
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </span>
            </Button>
          </div>
        </div>
      </section>
    </main>
  )
} 