"use client"

import { motion } from "framer-motion"
import { ChevronRight } from "lucide-react"

export default function MentionsLegalesPage() {
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
                <span>Mentions Légales</span>
              </div>
            </div>
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl md:text-6xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-300"
            >
              Mentions Légales
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-gray-400 text-lg max-w-2xl mx-auto"
            >
              Informations légales concernant l'utilisation de notre site et services
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
                  <li><a href="#editeur" className="text-gray-400 hover:text-[#BFFF00] transition-colors">Éditeur du site</a></li>
                  <li><a href="#hebergement" className="text-gray-400 hover:text-[#BFFF00] transition-colors">Hébergement</a></li>
                  <li><a href="#propriete" className="text-gray-400 hover:text-[#BFFF00] transition-colors">Propriété intellectuelle</a></li>
                  <li><a href="#donnees" className="text-gray-400 hover:text-[#BFFF00] transition-colors">Données personnelles</a></li>
                  <li><a href="#cookies" className="text-gray-400 hover:text-[#BFFF00] transition-colors">Cookies</a></li>
                  <li><a href="#loi" className="text-gray-400 hover:text-[#BFFF00] transition-colors">Loi applicable</a></li>
                  <li><a href="#modification" className="text-gray-400 hover:text-[#BFFF00] transition-colors">Modification</a></li>
                </ul>
              </div>
            </div>

            {/* Contenu principal */}
            <div className="flex-1 max-w-3xl">
              <div className="rounded-2xl border border-gray-800 overflow-hidden bg-black/50 backdrop-blur-md shadow-[0_0_25px_rgba(191,255,0,0.05)]">
                <div className="p-6 md:p-10">
                  <div className="prose prose-lg prose-invert max-w-none">
                    <h2 id="editeur" className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-white mb-6">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#BFFF00]"></span>
                      <span className="inline-block w-3 h-3 rounded-full bg-[#BFFF00]/50"></span>
                      Éditeur du site
                    </h2>
                    <p className="text-gray-300">
                      Le site Cleads est édité par la société Cleads.
                    </p>
                    <div className="bg-gray-900/50 rounded-xl p-6 my-6 border border-gray-800">
                      <p className="mb-2">
                        <strong className="text-[#BFFF00]">Siège social :</strong> <span className="text-gray-300">39 Boulevard Albert Einstein, 44300 Nantes, France</span>
                      </p>
                      <p className="mb-2">
                        <strong className="text-[#BFFF00]">Téléphone :</strong> <span className="text-gray-300">+33 7 67 03 68 48</span>
                      </p>
                      <p>
                        <strong className="text-[#BFFF00]">Email :</strong> <span className="text-gray-300">contact@cleads.fr</span>
                      </p>
                    </div>
                    <p className="text-gray-300">
                      <strong className="text-white">Directeur de la publication :</strong> Mr Oullami
                    </p>

                    <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent my-10"></div>

                    <h2 id="hebergement" className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-white mb-6">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#BFFF00]"></span>
                      <span className="inline-block w-3 h-3 rounded-full bg-[#BFFF00]/50"></span>
                      Hébergement
                    </h2>
                    <p className="text-gray-300">
                      Le site est hébergé par Vercel Inc., dont le siège social est situé à l'adresse suivante : 340 S Lemon Ave #4133 Walnut, CA 91789, USA.
                    </p>

                    <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent my-10"></div>

                    <h2 id="propriete" className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-white mb-6">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#BFFF00]"></span>
                      <span className="inline-block w-3 h-3 rounded-full bg-[#BFFF00]/50"></span>
                      Propriété intellectuelle
                    </h2>
                    <p className="text-gray-300">
                      L'ensemble des éléments constituant le site Cleads (textes, graphismes, logiciels, photographies, images, vidéos, sons, plans, logos, marques, etc.) ainsi que le site lui-même, sont la propriété exclusive de Cleads ou des titulaires de droits avec lesquels Cleads a passé des accords.
                    </p>
                    <p className="text-gray-300">
                      Ces éléments sont protégés par les lois françaises et internationales relatives à la propriété intellectuelle.
                    </p>
                    <p className="text-gray-300">
                      Toute reproduction, représentation, modification, publication, adaptation ou exploitation de tout ou partie des éléments du site est strictement interdite sans l'autorisation préalable et écrite de Cleads.
                    </p>

                    <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent my-10"></div>

                    <h2 id="donnees" className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-white mb-6">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#BFFF00]"></span>
                      <span className="inline-block w-3 h-3 rounded-full bg-[#BFFF00]/50"></span>
                      Données personnelles
                    </h2>
                    <p className="text-gray-300">
                      Conformément à la loi « Informatique et Libertés » du 6 janvier 1978 modifiée et au Règlement Général sur la Protection des Données (RGPD), vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation, de portabilité et d'opposition aux données vous concernant.
                    </p>
                    <p className="text-gray-300">
                      Pour plus d'informations sur la façon dont nous traitons vos données, veuillez consulter notre <a href="/politique-de-confidentialite" className="text-[#BFFF00] hover:underline relative inline-block after:absolute after:bottom-0 after:left-0 after:w-0 after:h-0.5 after:bg-[#BFFF00] after:transition-all hover:after:w-full">Politique de confidentialité</a>.
                    </p>

                    <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent my-10"></div>

                    <h2 id="cookies" className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-white mb-6">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#BFFF00]"></span>
                      <span className="inline-block w-3 h-3 rounded-full bg-[#BFFF00]/50"></span>
                      Cookies
                    </h2>
                    <p className="text-gray-300">
                      Le site utilise des cookies pour améliorer l'expérience utilisateur. Pour plus d'informations sur notre utilisation des cookies, veuillez consulter notre <a href="/cookies" className="text-[#BFFF00] hover:underline relative inline-block after:absolute after:bottom-0 after:left-0 after:w-0 after:h-0.5 after:bg-[#BFFF00] after:transition-all hover:after:w-full">Politique de cookies</a>.
                    </p>

                    <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent my-10"></div>

                    <h2 id="loi" className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-white mb-6">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#BFFF00]"></span>
                      <span className="inline-block w-3 h-3 rounded-full bg-[#BFFF00]/50"></span>
                      Loi applicable et juridiction
                    </h2>
                    <p className="text-gray-300">
                      Les présentes mentions légales sont soumises au droit français. En cas de litige, les tribunaux français seront seuls compétents.
                    </p>

                    <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent my-10"></div>

                    <h2 id="modification" className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-white mb-6">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#BFFF00]"></span>
                      <span className="inline-block w-3 h-3 rounded-full bg-[#BFFF00]/50"></span>
                      Modification des mentions légales
                    </h2>
                    <p className="text-gray-300">
                      Cleads se réserve le droit de modifier les présentes mentions légales à tout moment. L'utilisateur est invité à les consulter régulièrement.
                    </p>

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
  )
} 