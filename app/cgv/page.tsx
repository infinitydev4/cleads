"use client"

import { motion } from "framer-motion"
import { ChevronRight, FileText, Scale, ClipboardList, CreditCard, Clock, UserCheck, Building, BookOpen, LockKeyhole, AlertTriangle, FileCheck, Rocket, LineChart, Globe, Zap } from "lucide-react"

export default function CGVPage() {
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
                <span>Conditions</span>
              </div>
            </div>
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl md:text-6xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-300"
            >
              Conditions Générales de Vente
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-gray-400 text-lg max-w-2xl mx-auto"
            >
              Cadre contractuel qui régit nos services et prestations
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
                  <li><a href="#article1" className="text-gray-400 hover:text-[#BFFF00] transition-colors">1. Objet et champ d'application</a></li>
                  <li><a href="#article2" className="text-gray-400 hover:text-[#BFFF00] transition-colors">2. Commandes et devis</a></li>
                  <li><a href="#article3" className="text-gray-400 hover:text-[#BFFF00] transition-colors">3. Prix et modalités de paiement</a></li>
                  <li><a href="#article4" className="text-gray-400 hover:text-[#BFFF00] transition-colors">4. Délais d'exécution</a></li>
                  <li><a href="#article5" className="text-gray-400 hover:text-[#BFFF00] transition-colors">5. Obligations du Client</a></li>
                  <li><a href="#article6" className="text-gray-400 hover:text-[#BFFF00] transition-colors">6. Obligations du Prestataire</a></li>
                  <li><a href="#article7" className="text-gray-400 hover:text-[#BFFF00] transition-colors">7. Propriété intellectuelle</a></li>
                  <li><a href="#article8" className="text-gray-400 hover:text-[#BFFF00] transition-colors">8. Confidentialité</a></li>
                  <li><a href="#article9" className="text-gray-400 hover:text-[#BFFF00] transition-colors">9. Garanties et responsabilité</a></li>
                  <li><a href="#article10" className="text-gray-400 hover:text-[#BFFF00] transition-colors">10. Force majeure</a></li>
                  <li><a href="#article11" className="text-gray-400 hover:text-[#BFFF00] transition-colors">11. Résiliation</a></li>
                  <li><a href="#article12" className="text-gray-400 hover:text-[#BFFF00] transition-colors">12. Droit applicable</a></li>
                </ul>
              </div>
            </div>

            {/* Contenu principal */}
            <div className="flex-1 max-w-3xl">
              <div className="rounded-2xl border border-gray-800 overflow-hidden bg-black/50 backdrop-blur-md shadow-[0_0_25px_rgba(191,255,0,0.05)]">
                <div className="p-6 md:p-10">
                  <div className="prose prose-lg prose-invert max-w-none">
                    <p id="intro" className="lead text-xl text-gray-300">
                      Les présentes conditions générales de vente (CGV) sont conclues entre la société Cleads SAS, ci-après dénommée "le Prestataire" et toute personne physique ou morale, ci-après dénommée "le Client", souhaitant bénéficier des services proposés par le Prestataire.
                    </p>

                    <div className="my-12 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00]">
                        <Scale className="h-5 w-5" />
                      </div>
                      <h2 id="article1" className="text-2xl md:text-3xl font-bold text-white m-0">
                        Article 1 - Objet et champ d'application
                      </h2>
                    </div>

                    <p className="text-gray-300">
                      Les présentes CGV ont pour objet de définir les conditions dans lesquelles le Prestataire fournit au Client les services suivants :
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
                      <div className="p-4 rounded-lg bg-gray-900/30 border border-gray-800 hover:border-[#BFFF00]/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00]">
                            <Rocket className="h-4 w-4" />
                          </div>
                          <span className="text-gray-300">Création de landing pages et sites web</span>
                        </div>
                      </div>
                      
                      <div className="p-4 rounded-lg bg-gray-900/30 border border-gray-800 hover:border-[#BFFF00]/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00]">
                            <LineChart className="h-4 w-4" />
                          </div>
                          <span className="text-gray-300">Services de marketing digital</span>
                        </div>
                      </div>
                      
                      <div className="p-4 rounded-lg bg-gray-900/30 border border-gray-800 hover:border-[#BFFF00]/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00]">
                            <Globe className="h-4 w-4" />
                          </div>
                          <span className="text-gray-300">Optimisation SEO</span>
                        </div>
                      </div>
                      
                      <div className="p-4 rounded-lg bg-gray-900/30 border border-gray-800 hover:border-[#BFFF00]/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00]">
                            <Zap className="h-4 w-4" />
                          </div>
                          <span className="text-gray-300">Conseil en stratégie digitale</span>
                        </div>
                      </div>
                    </div>
                    
                    <p className="text-gray-300">
                      Ces CGV s'appliquent à toutes les prestations réalisées par le Prestataire pour le compte du Client, à l'exclusion de toutes autres conditions. Le Client reconnaît avoir pris connaissance des présentes CGV avant de passer commande et les avoir acceptées sans réserve.
                    </p>

                    <div className="my-12 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00]">
                        <ClipboardList className="h-5 w-5" />
                      </div>
                      <h2 id="article2" className="text-2xl md:text-3xl font-bold text-white m-0">
                        Article 2 - Commandes et devis
                      </h2>
                    </div>

                    <p className="text-gray-300">
                      Toute commande fait l'objet d'un devis préalable, établi par le Prestataire et accepté par le Client. Le devis précise notamment :
                    </p>
                    
                    <div className="space-y-3 my-6 pl-4 border-l-2 border-[#BFFF00]/30">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00] flex-shrink-0">
                          <span className="text-xs font-bold">1</span>
                        </div>
                        <span className="text-gray-300">La nature des prestations à réaliser</span>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00] flex-shrink-0">
                          <span className="text-xs font-bold">2</span>
                        </div>
                        <span className="text-gray-300">Le prix des prestations</span>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00] flex-shrink-0">
                          <span className="text-xs font-bold">3</span>
                        </div>
                        <span className="text-gray-300">Les délais de réalisation estimés</span>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00] flex-shrink-0">
                          <span className="text-xs font-bold">4</span>
                        </div>
                        <span className="text-gray-300">La durée de validité du devis</span>
                      </div>
                    </div>
                    
                    <div className="p-4 rounded-lg bg-[#BFFF00]/5 border border-[#BFFF00]/20 my-6">
                      <p className="text-gray-300 m-0">
                        La commande n'est considérée comme définitive qu'après réception par le Prestataire du devis signé par le Client, accompagné de l'acompte éventuellement prévu.
                      </p>
                    </div>

                    <div className="my-12 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00]">
                        <CreditCard className="h-5 w-5" />
                      </div>
                      <h2 id="article3" className="text-2xl md:text-3xl font-bold text-white m-0">
                        Article 3 - Prix et modalités de paiement
                      </h2>
                    </div>

                    <p className="text-gray-300">
                      Les prix des services sont ceux en vigueur au jour de la passation de la commande. Ils sont libellés en euros et calculés hors taxes. La TVA au taux en vigueur s'ajoute le cas échéant aux prix indiqués.
                    </p>
                    
                    <p className="text-gray-300">
                      Sauf dispositions contraires prévues dans le devis, les modalités de paiement sont les suivantes :
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-8">
                      <div className="p-6 rounded-xl bg-gray-900/40 border border-gray-800 text-center">
                        <div className="w-12 h-12 rounded-full bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00] mx-auto mb-4">
                          <span className="text-xl font-bold">1</span>
                        </div>
                        <h3 className="text-white text-lg font-semibold mb-2">Acompte initial</h3>
                        <p className="text-gray-400 m-0">Un acompte de 30% à la signature du devis</p>
                      </div>
                      
                      <div className="p-6 rounded-xl bg-gray-900/40 border border-gray-800 text-center">
                        <div className="w-12 h-12 rounded-full bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00] mx-auto mb-4">
                          <span className="text-xl font-bold">2</span>
                        </div>
                        <h3 className="text-white text-lg font-semibold mb-2">Solde</h3>
                        <p className="text-gray-400 m-0">Le solde à la livraison des prestations</p>
                      </div>
                    </div>
                    
                    <p className="text-gray-300">
                      Les paiements s'effectuent par virement bancaire, carte bancaire ou tout autre moyen convenu dans le devis. Les factures sont payables à réception, sans escompte.
                    </p>
                    
                    <div className="p-4 rounded-lg bg-red-900/10 border border-red-900/20 my-6">
                      <div className="flex gap-3 items-start">
                        <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-1" />
                        <p className="text-gray-300 m-0">
                          Tout retard de paiement entraînera l'application de pénalités de retard au taux d'intérêt légal majoré de 10 points, ainsi qu'une indemnité forfaitaire pour frais de recouvrement de 40 euros, conformément aux articles L441-6 et D441-5 du Code de commerce.
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