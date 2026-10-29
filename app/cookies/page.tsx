"use client"

import { motion } from "framer-motion"
import { ChevronRight, Cookie, Info, Cog, Sliders, Target, Settings, Fingerprint, AlertCircle, Globe, RefreshCcw, Clock, LineChart } from "lucide-react"

export default function CookiesPage() {
  return (
    <main className="bg-black text-white">
      {/* Hero Section avec effet parallaxe */}
      <section className="relative overflow-hidden py-24 md:py-32">
        {/* Effet de grain */}
        <div 
          className="absolute inset-0 opacity-20" 
          style={{ backgroundImage: 'url("/noise.png")' }}
        />
        
        {/* Cercles décoratifs en arrière-plan */}
        <div className="absolute -left-20 -top-20 w-80 h-80 bg-[#BFFF00]/10 rounded-full filter blur-3xl opacity-30" />
        <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-[#BFFF00]/10 rounded-full filter blur-3xl opacity-30" />
        
        <div className="container px-4 relative">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-block mb-4 px-3 py-1 border border-[#BFFF00]/30 rounded-full bg-black/50 backdrop-blur-sm">
              <div className="flex items-center text-sm text-[#BFFF00]">
                <span>Cleads</span>
                <ChevronRight className="h-4 w-4 mx-1" />
                <span>Cookies</span>
              </div>
            </div>
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl md:text-6xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-300"
            >
              Politique de Cookies
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-gray-400 text-lg max-w-2xl mx-auto"
            >
              Comment nous utilisons les cookies pour améliorer votre expérience sur notre site
            </motion.p>
          </div>
        </div>
      </section>

      {/* Content Section avec un design moderne */}
      <section className="py-16 md:py-24 bg-gradient-to-b from-gray-950 to-black">
        <div className="container px-4">
          <div className="relative flex flex-col xl:flex-row gap-8">
            {/* Table des matières à gauche du contenu avec une marge appropriée */}
            <div className="xl:w-64 shrink-0">
              <div className="xl:sticky xl:top-32 rounded-2xl border border-gray-800 bg-black/50 backdrop-blur-md p-5 shadow-[0_0_25px_rgba(191,255,0,0.05)]">
                <h4 className="font-semibold text-white mb-3">Sommaire</h4>
                <ul className="space-y-2 text-sm">
                  <li><a href="#intro" className="text-gray-400 hover:text-[#BFFF00] transition-colors">Introduction</a></li>
                  <li><a href="#definition" className="text-gray-400 hover:text-[#BFFF00] transition-colors">1. Qu'est-ce qu'un cookie ?</a></li>
                  <li><a href="#types" className="text-gray-400 hover:text-[#BFFF00] transition-colors">2. Types de cookies utilisés</a></li>
                  <li><a href="#control" className="text-gray-400 hover:text-[#BFFF00] transition-colors">3. Comment contrôler les cookies</a></li>
                  <li><a href="#third-party" className="text-gray-400 hover:text-[#BFFF00] transition-colors">4. Cookies tiers</a></li>
                  <li><a href="#updates" className="text-gray-400 hover:text-[#BFFF00] transition-colors">5. Mises à jour</a></li>
                  <li><a href="#contact" className="text-gray-400 hover:text-[#BFFF00] transition-colors">6. Contact</a></li>
                </ul>
              </div>
            </div>

            {/* Contenu principal */}
            <div className="flex-1 max-w-3xl">
              <div className="rounded-2xl border border-gray-800 overflow-hidden bg-black/50 backdrop-blur-md shadow-[0_0_25px_rgba(191,255,0,0.05)]">
                <div className="p-6 md:p-10">
                  <div className="prose prose-lg prose-invert max-w-none">
                    <p id="intro" className="lead text-xl text-gray-300">
                      Cette politique de cookies explique ce que sont les cookies, comment Cleads les utilise et comment vous pouvez les contrôler lorsque vous visitez notre site web.
                    </p>

                    <div className="my-12 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00]">
                        <Cookie className="h-5 w-5" />
                      </div>
                      <h2 id="definition" className="text-2xl md:text-3xl font-bold text-white m-0">
                        1. Qu'est-ce qu'un cookie ?
                      </h2>
                    </div>

                    <div className="bg-gray-900/50 rounded-xl p-6 my-6 border border-gray-800">
                      <p className="text-gray-300 mb-4">
                        Un cookie est un petit fichier texte déposé sur votre appareil (ordinateur, mobile, tablette) lorsque vous naviguez sur notre site web. Les cookies nous permettent de reconnaître votre appareil et de stocker certaines informations concernant vos préférences ou actions passées.
                      </p>
                      <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1 p-4 bg-black/30 rounded-lg border border-gray-800">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-6 h-6 rounded-full bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00]">
                              <Clock className="h-3 w-3" />
                            </div>
                            <h3 className="text-white font-semibold text-sm">Temporaires</h3>
                          </div>
                          <p className="text-gray-400 text-sm m-0">Supprimés lorsque vous fermez votre navigateur</p>
                        </div>
                        <div className="flex-1 p-4 bg-black/30 rounded-lg border border-gray-800">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-6 h-6 rounded-full bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00]">
                              <Fingerprint className="h-3 w-3" />
                            </div>
                            <h3 className="text-white font-semibold text-sm">Permanents</h3>
                          </div>
                          <p className="text-gray-400 text-sm m-0">Restent sur votre appareil jusqu'à leur expiration ou suppression manuelle</p>
                        </div>
                      </div>
                    </div>

                    <div className="my-12 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00]">
                        <Sliders className="h-5 w-5" />
                      </div>
                      <h2 id="types" className="text-2xl md:text-3xl font-bold text-white m-0">
                        2. Les types de cookies que nous utilisons
                      </h2>
                    </div>
                    
                    <p className="text-gray-300">
                      Notre site utilise différents types de cookies pour diverses finalités :
                    </p>

                    {/* Section 2.1 Cookies nécessaires */}
                    <div className="my-8">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-full bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00]">
                          <Cog className="h-4 w-4" />
                        </div>
                        <h3 className="text-white text-xl font-semibold">2.1. Cookies strictement nécessaires</h3>
                      </div>
                      
                      <p className="text-gray-300 mb-4">
                        Ces cookies sont essentiels au fonctionnement de notre site et vous permettent de naviguer et d'utiliser ses fonctionnalités. Sans ces cookies, certains services que vous avez demandés ne peuvent pas être fournis.
                      </p>
                      
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse rounded-lg overflow-hidden">
                          <thead className="bg-gray-900/70">
                            <tr>
                              <th className="py-3 px-4 text-left text-[#BFFF00] border-b border-gray-800">Nom</th>
                              <th className="py-3 px-4 text-left text-[#BFFF00] border-b border-gray-800">Finalité</th>
                              <th className="py-3 px-4 text-left text-[#BFFF00] border-b border-gray-800">Durée</th>
                            </tr>
                          </thead>
                          <tbody className="bg-gray-900/30">
                            <tr>
                              <td className="py-3 px-4 text-gray-300 border-b border-gray-800">session_id</td>
                              <td className="py-3 px-4 text-gray-300 border-b border-gray-800">Gestion de la session utilisateur</td>
                              <td className="py-3 px-4 text-gray-300 border-b border-gray-800">Session</td>
                            </tr>
                            <tr>
                              <td className="py-3 px-4 text-gray-300">csrf_token</td>
                              <td className="py-3 px-4 text-gray-300">Protection contre les attaques CSRF</td>
                              <td className="py-3 px-4 text-gray-300">Session</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Section 2.2 Cookies de performance */}
                    <div className="my-8">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-full bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00]">
                          <LineChart className="h-4 w-4" />
                        </div>
                        <h3 className="text-white text-xl font-semibold">2.2. Cookies de performance et d'analyse</h3>
                      </div>
                      
                      <p className="text-gray-300 mb-4">
                        Ces cookies nous permettent de reconnaître et de compter le nombre de visiteurs sur notre site et de comprendre comment les visiteurs naviguent. Cela nous aide à améliorer le fonctionnement de notre site, par exemple en nous assurant que les utilisateurs trouvent facilement ce qu'ils cherchent.
                      </p>
                      
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse rounded-lg overflow-hidden">
                          <thead className="bg-gray-900/70">
                            <tr>
                              <th className="py-3 px-4 text-left text-[#BFFF00] border-b border-gray-800">Nom</th>
                              <th className="py-3 px-4 text-left text-[#BFFF00] border-b border-gray-800">Finalité</th>
                              <th className="py-3 px-4 text-left text-[#BFFF00] border-b border-gray-800">Durée</th>
                            </tr>
                          </thead>
                          <tbody className="bg-gray-900/30">
                            <tr>
                              <td className="py-3 px-4 text-gray-300 border-b border-gray-800">_ga</td>
                              <td className="py-3 px-4 text-gray-300 border-b border-gray-800">Google Analytics - Distinguer les utilisateurs</td>
                              <td className="py-3 px-4 text-gray-300 border-b border-gray-800">13 mois</td>
                            </tr>
                            <tr>
                              <td className="py-3 px-4 text-gray-300 border-b border-gray-800">_gid</td>
                              <td className="py-3 px-4 text-gray-300 border-b border-gray-800">Google Analytics - Distinguer les utilisateurs</td>
                              <td className="py-3 px-4 text-gray-300 border-b border-gray-800">24 heures</td>
                            </tr>
                            <tr>
                              <td className="py-3 px-4 text-gray-300">_gat</td>
                              <td className="py-3 px-4 text-gray-300">Google Analytics - Limiter le taux de demandes</td>
                              <td className="py-3 px-4 text-gray-300">1 minute</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="my-12 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00]">
                        <Settings className="h-5 w-5" />
                      </div>
                      <h2 id="control" className="text-2xl md:text-3xl font-bold text-white m-0">
                        3. Comment contrôler les cookies
                      </h2>
                    </div>
                    
                    <p className="text-gray-300">
                      Vous pouvez contrôler et gérer les cookies de plusieurs façons :
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
                      <div className="p-5 rounded-xl bg-gray-900/40 border border-gray-800 hover:border-[#BFFF00]/30 transition-colors">
                        <div className="w-10 h-10 rounded-lg bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00] mb-4">
                          <Settings className="h-5 w-5" />
                        </div>
                        <h3 className="text-white font-semibold mb-2">Paramètres du navigateur</h3>
                        <p className="text-gray-400 text-sm m-0">
                          La plupart des navigateurs vous permettent de gérer vos préférences en matière de cookies dans les paramètres
                        </p>
                      </div>
                      
                      <div className="p-5 rounded-xl bg-gray-900/40 border border-gray-800 hover:border-[#BFFF00]/30 transition-colors">
                        <div className="w-10 h-10 rounded-lg bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00] mb-4">
                          <AlertCircle className="h-5 w-5" />
                        </div>
                        <h3 className="text-white font-semibold mb-2">Bannière de cookies</h3>
                        <p className="text-gray-400 text-sm m-0">
                          Lors de votre première visite, une bannière vous informe et vous permet d'accepter ou refuser
                        </p>
                      </div>
                      
                      <div className="p-5 rounded-xl bg-gray-900/40 border border-gray-800 hover:border-[#BFFF00]/30 transition-colors">
                        <div className="w-10 h-10 rounded-lg bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00] mb-4">
                          <Sliders className="h-5 w-5" />
                        </div>
                        <h3 className="text-white font-semibold mb-2">Centre de préférences</h3>
                        <p className="text-gray-400 text-sm m-0">
                          Utilisez notre centre de préférences accessible via le lien en bas de page
                        </p>
                      </div>
                    </div>
                    
                    <div className="p-4 rounded-lg bg-yellow-900/10 border border-yellow-900/20 my-6">
                      <div className="flex gap-3">
                        <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-1" />
                        <p className="text-gray-300 m-0">
                          Veuillez noter que la désactivation de certains cookies peut affecter votre expérience sur notre site et limiter certaines fonctionnalités.
                        </p>
                      </div>
                    </div>

                    <div className="mt-12 p-6 rounded-xl bg-gray-900/30 border border-gray-800">
                      <p className="text-sm text-gray-400 m-0">
                        Dernière mise à jour : {new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
} 