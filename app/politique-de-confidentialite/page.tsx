"use client"

import { motion } from "framer-motion"
import { ChevronRight, Shield, Lock, Eye, Users, Database, Globe, FileText, AlertCircle, Clock, User, Mail, LineChart } from "lucide-react"

export default function PolitiqueConfidentialitePage() {
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
                <span>Confidentialité</span>
              </div>
            </div>
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl md:text-6xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-300"
            >
              Politique de Confidentialité
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-gray-400 text-lg max-w-2xl mx-auto"
            >
              Comment nous protégeons vos données personnelles et respectons votre vie privée
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
                  <li><a href="#responsable" className="text-gray-400 hover:text-[#BFFF00] transition-colors">1. Responsable du traitement</a></li>
                  <li><a href="#donnees" className="text-gray-400 hover:text-[#BFFF00] transition-colors">2. Données collectées</a></li>
                  <li><a href="#finalites" className="text-gray-400 hover:text-[#BFFF00] transition-colors">3. Finalités et bases légales</a></li>
                  <li><a href="#destinataires" className="text-gray-400 hover:text-[#BFFF00] transition-colors">4. Destinataires des données</a></li>
                  <li><a href="#duree" className="text-gray-400 hover:text-[#BFFF00] transition-colors">5. Durée de conservation</a></li>
                  <li><a href="#securite" className="text-gray-400 hover:text-[#BFFF00] transition-colors">6. Sécurité des données</a></li>
                  <li><a href="#transfert" className="text-gray-400 hover:text-[#BFFF00] transition-colors">7. Transfert de données</a></li>
                  <li><a href="#droits" className="text-gray-400 hover:text-[#BFFF00] transition-colors">8. Vos droits</a></li>
                  <li><a href="#cookies" className="text-gray-400 hover:text-[#BFFF00] transition-colors">9. Cookies</a></li>
                  <li><a href="#modification" className="text-gray-400 hover:text-[#BFFF00] transition-colors">10. Modification</a></li>
                </ul>
              </div>
            </div>

            {/* Contenu principal */}
            <div className="flex-1 max-w-3xl">
              <div className="rounded-2xl border border-gray-800 overflow-hidden bg-black/50 backdrop-blur-md shadow-[0_0_25px_rgba(191,255,0,0.05)]">
                <div className="p-6 md:p-10">
                  <div className="prose prose-lg prose-invert max-w-none">
                    <p id="intro" className="lead text-xl text-gray-300">
                      Chez Cleads, nous accordons une grande importance à la protection de vos données personnelles. Cette politique de confidentialité vous explique comment nous collectons, utilisons, partageons et protégeons vos informations lorsque vous utilisez notre site web et nos services.
                    </p>

                    <div className="my-12 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00]">
                        <Shield className="h-5 w-5" />
                      </div>
                      <h2 id="responsable" className="text-2xl md:text-3xl font-bold text-white m-0">
                        1. Responsable du traitement
                      </h2>
                    </div>

                    <div className="bg-gray-900/50 rounded-xl p-6 my-6 border border-gray-800">
                      <p className="mb-1 text-gray-300">
                        Le responsable du traitement des données personnelles est :
                      </p>
                      <p className="mb-1">
                        <strong className="text-[#BFFF00]">Cleads SAS</strong>
                      </p>
                      <p className="mb-1">
                        <strong className="text-[#BFFF00]">Adresse :</strong> <span className="text-gray-300">39 Boulevard Albert Einstein, 44300 Nantes, France</span>
                      </p>
                      <p className="mb-1">
                        <strong className="text-[#BFFF00]">Email :</strong> <span className="text-gray-300">contact@cleads.fr</span>
                      </p>
                      <p>
                        <strong className="text-[#BFFF00]">Téléphone :</strong> <span className="text-gray-300">+33 7 67 03 68 48</span>
                      </p>
                    </div>

                    <div className="my-12 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00]">
                        <Database className="h-5 w-5" />
                      </div>
                      <h2 id="donnees" className="text-2xl md:text-3xl font-bold text-white m-0">
                        2. Données collectées
                      </h2>
                    </div>

                    <p className="text-gray-300">Nous collectons les catégories de données suivantes :</p>
                    
                    <div className="grid md:grid-cols-2 gap-4 my-6">
                      <div className="p-5 rounded-xl bg-gray-900/30 border border-gray-800 hover:border-[#BFFF00]/30 transition-colors">
                        <div className="flex items-start gap-3">
                          <div className="h-8 w-8 rounded-lg bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00] flex-shrink-0 mt-1">
                            <User className="h-4 w-4" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-white mb-2">Données d'identification</h3>
                            <p className="text-gray-400 text-sm">Nom, prénom, adresse email, numéro de téléphone</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-5 rounded-xl bg-gray-900/30 border border-gray-800 hover:border-[#BFFF00]/30 transition-colors">
                        <div className="flex items-start gap-3">
                          <div className="h-8 w-8 rounded-lg bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00] flex-shrink-0 mt-1">
                            <Eye className="h-4 w-4" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-white mb-2">Données de connexion</h3>
                            <p className="text-gray-400 text-sm">Adresse IP, données de navigation, historique de connexion</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-5 rounded-xl bg-gray-900/30 border border-gray-800 hover:border-[#BFFF00]/30 transition-colors">
                        <div className="flex items-start gap-3">
                          <div className="h-8 w-8 rounded-lg bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00] flex-shrink-0 mt-1">
                            <LineChart className="h-4 w-4" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-white mb-2">Données commerciales</h3>
                            <p className="text-gray-400 text-sm">Historique des achats, abonnements, préférences</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-5 rounded-xl bg-gray-900/30 border border-gray-800 hover:border-[#BFFF00]/30 transition-colors">
                        <div className="flex items-start gap-3">
                          <div className="h-8 w-8 rounded-lg bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00] flex-shrink-0 mt-1">
                            <Mail className="h-4 w-4" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-white mb-2">Données de communication</h3>
                            <p className="text-gray-400 text-sm">Messages envoyés via notre formulaire de contact</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="my-12 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00]">
                        <FileText className="h-5 w-5" />
                      </div>
                      <h2 id="finalites" className="text-2xl md:text-3xl font-bold text-white m-0">
                        3. Finalités et bases légales du traitement
                      </h2>
                    </div>
                    
                    <p className="text-gray-300">Nous traitons vos données personnelles pour les finalités suivantes :</p>
                    
                    <div className="space-y-4 my-6">
                      <div className="p-4 rounded-lg bg-gradient-to-r from-gray-900/50 to-black border-l-4 border-[#BFFF00]">
                        <div className="flex justify-between">
                          <h3 className="font-semibold text-white">Fournir nos services</h3>
                          <span className="text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-300">Exécution du contrat</span>
                        </div>
                        <p className="text-gray-400 text-sm mt-1">Création de sites web, landing pages, services de marketing</p>
                      </div>
                      
                      <div className="p-4 rounded-lg bg-gradient-to-r from-gray-900/50 to-black border-l-4 border-[#BFFF00]">
                        <div className="flex justify-between">
                          <h3 className="font-semibold text-white">Améliorer notre site et nos services</h3>
                          <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-300">Intérêt légitime</span>
                        </div>
                        <p className="text-gray-400 text-sm mt-1">Analyse de l'utilisation et optimisation de l'expérience utilisateur</p>
                      </div>
                      
                      <div className="p-4 rounded-lg bg-gradient-to-r from-gray-900/50 to-black border-l-4 border-[#BFFF00]">
                        <div className="flex justify-between">
                          <h3 className="font-semibold text-white">Communiquer avec vous</h3>
                          <span className="text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-300">Exécution du contrat</span>
                        </div>
                        <p className="text-gray-400 text-sm mt-1">Concernant nos services, support client et suivi</p>
                      </div>
                      
                      <div className="p-4 rounded-lg bg-gradient-to-r from-gray-900/50 to-black border-l-4 border-[#BFFF00]">
                        <div className="flex justify-between">
                          <h3 className="font-semibold text-white">Vous envoyer des informations commerciales</h3>
                          <span className="text-xs px-2 py-1 rounded-full bg-purple-500/20 text-purple-300">Consentement</span>
                        </div>
                        <p className="text-gray-400 text-sm mt-1">Sur nos services et offres promotionnelles</p>
                      </div>
                      
                      <div className="p-4 rounded-lg bg-gradient-to-r from-gray-900/50 to-black border-l-4 border-[#BFFF00]">
                        <div className="flex justify-between">
                          <h3 className="font-semibold text-white">Respecter nos obligations légales</h3>
                          <span className="text-xs px-2 py-1 rounded-full bg-orange-500/20 text-orange-300">Obligation légale</span>
                        </div>
                        <p className="text-gray-400 text-sm mt-1">Conformité avec les lois et réglementations applicables</p>
                      </div>
                    </div>

                    <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent my-10"></div>

                    {/* Je continue avec les sections suivantes en gardant un style cohérent */}
                    <div className="my-12 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00]">
                        <Users className="h-5 w-5" />
                      </div>
                      <h2 id="destinataires" className="text-2xl md:text-3xl font-bold text-white m-0">
                        4. Destinataires des données
                      </h2>
                    </div>
                    
                    <p className="text-gray-300">Vos données personnelles peuvent être partagées avec :</p>
                    <ul className="space-y-3 list-none pl-0 my-6">
                      <li className="flex items-start gap-3">
                        <div className="h-6 w-6 rounded-full bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00] mt-1 flex-shrink-0">
                          <span className="text-xs font-bold">1</span>
                        </div>
                        <span className="text-gray-300">Les membres de notre équipe ayant besoin d'y accéder pour fournir nos services</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <div className="h-6 w-6 rounded-full bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00] mt-1 flex-shrink-0">
                          <span className="text-xs font-bold">2</span>
                        </div>
                        <span className="text-gray-300">Nos sous-traitants techniques (hébergement, CRM, email marketing)</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <div className="h-6 w-6 rounded-full bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00] mt-1 flex-shrink-0">
                          <span className="text-xs font-bold">3</span>
                        </div>
                        <span className="text-gray-300">Des partenaires commerciaux, avec votre consentement préalable</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <div className="h-6 w-6 rounded-full bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00] mt-1 flex-shrink-0">
                          <span className="text-xs font-bold">4</span>
                        </div>
                        <span className="text-gray-300">Les autorités administratives ou judiciaires lorsque la loi l'exige</span>
                      </li>
                    </ul>

                    <div className="my-12 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-[#BFFF00]/10 flex items-center justify-center text-[#BFFF00]">
                        <Clock className="h-5 w-5" />
                      </div>
                      <h2 id="duree" className="text-2xl md:text-3xl font-bold text-white m-0">
                        5. Durée de conservation
                      </h2>
                    </div>

                    <p className="text-gray-300">Nous conservons vos données personnelles pour la durée nécessaire à la réalisation des finalités pour lesquelles elles ont été collectées :</p>
                    
                    <div className="overflow-x-auto my-6">
                      <table className="min-w-full bg-gray-900/30 rounded-xl border border-gray-800">
                        <thead>
                          <tr>
                            <th className="py-3 px-4 text-left text-sm font-semibold text-[#BFFF00] border-b border-gray-800">Type de données</th>
                            <th className="py-3 px-4 text-left text-sm font-semibold text-[#BFFF00] border-b border-gray-800">Durée de conservation</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="py-3 px-4 text-gray-300 border-b border-gray-800">Données de compte</td>
                            <td className="py-3 px-4 text-gray-300 border-b border-gray-800">Pendant toute la durée de votre relation commerciale avec nous, puis 3 ans à compter de votre dernière activité</td>
                          </tr>
                          <tr>
                            <td className="py-3 px-4 text-gray-300 border-b border-gray-800">Données de facturation</td>
                            <td className="py-3 px-4 text-gray-300 border-b border-gray-800">10 ans (obligation légale comptable)</td>
                          </tr>
                          <tr>
                            <td className="py-3 px-4 text-gray-300 border-b border-gray-800">Données de navigation et cookies</td>
                            <td className="py-3 px-4 text-gray-300 border-b border-gray-800">13 mois maximum</td>
                          </tr>
                          <tr>
                            <td className="py-3 px-4 text-gray-300">Données de prospection commerciale</td>
                            <td className="py-3 px-4 text-gray-300">3 ans à compter du dernier contact</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-12 p-6 rounded-xl bg-gray-900/30 border border-gray-800">
                      <p className="text-sm text-gray-400">
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
  );
} 