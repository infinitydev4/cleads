"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { X, Check, Settings } from "lucide-react"
import { useCookieConsent } from "./CookieBanner"

export function CookieConsent() {
  const [showConsent, setShowConsent] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const { consent, options, updateConsent } = useCookieConsent()
  const [analyticsEnabled, setAnalyticsEnabled] = useState(options.analytics)
  const [marketingEnabled, setMarketingEnabled] = useState(options.marketing)

  useEffect(() => {
    // Vérifie si le consentement n'a pas encore été donné
    if (consent === null) {
      setShowConsent(true)
    } else {
      setShowConsent(false)
    }
  }, [consent])

  // Met à jour les états locaux quand les options changent
  useEffect(() => {
    setAnalyticsEnabled(options.analytics)
    setMarketingEnabled(options.marketing)
  }, [options])

  const acceptAll = () => {
    updateConsent("all")
    setShowConsent(false)
  }

  const acceptEssential = () => {
    updateConsent("essential")
    setShowConsent(false)
  }

  const acceptCustom = () => {
    updateConsent("custom", {
      analytics: analyticsEnabled,
      marketing: marketingEnabled
    })
    setShowConsent(false)
  }

  // Si le consentement a déjà été donné ou la bannière est fermée, ne pas afficher
  if (!showConsent) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6">
      <div className="mx-auto max-w-4xl rounded-2xl border border-gray-800 bg-black/80 p-6 backdrop-blur-md">
        {!showDetails ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <h3 className="text-xl font-semibold text-white">Respect de votre vie privée</h3>
              <button 
                onClick={() => {
                  // Si l'utilisateur ferme la bannière sans choisir, on applique les cookies essentiels
                  acceptEssential();
                }} 
                className="rounded-full bg-gray-800 p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <p className="text-sm text-gray-300">
              Nous utilisons des cookies pour améliorer votre expérience, réaliser des analyses et vous proposer des offres personnalisées. 
              Vous pouvez gérer vos préférences à tout moment. Pour plus d'informations, consultez notre{" "}
              <Link href="/mentions-legales" className="text-[#BFFF00] hover:underline">
                politique de confidentialité
              </Link>.
            </p>
            
            <div className="flex flex-col space-y-3 sm:flex-row sm:space-x-3 sm:space-y-0">
              <button
                onClick={acceptAll}
                className="rounded-lg bg-[#BFFF00] px-5 py-2.5 text-sm font-medium text-black hover:bg-[#a6e600] transition-colors"
              >
                Tout accepter
              </button>
              <button
                onClick={acceptEssential}
                className="rounded-lg border border-gray-600 bg-transparent px-5 py-2.5 text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
              >
                Cookies essentiels uniquement
              </button>
              <button
                onClick={() => setShowDetails(true)}
                className="rounded-lg border border-gray-600 bg-transparent px-5 py-2.5 text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors flex items-center justify-center"
              >
                <Settings className="mr-2 h-4 w-4" />
                Personnaliser
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <h3 className="text-xl font-semibold text-white">Paramètres des cookies</h3>
              <button 
                onClick={() => setShowDetails(false)} 
                className="rounded-full bg-gray-800 p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="space-y-4 divide-y divide-gray-800">
              <div className="flex items-center justify-between pb-4">
                <div>
                  <p className="font-medium text-white">Cookies essentiels</p>
                  <p className="text-xs text-gray-400">Nécessaires au fonctionnement du site. Toujours actifs.</p>
                </div>
                <div className="flex h-6 w-12 items-center rounded-full bg-[#BFFF00] px-1">
                  <div className="h-4 w-4 rounded-full bg-black"></div>
                </div>
              </div>
              
              <div className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium text-white">Cookies d'analyse</p>
                  <p className="text-xs text-gray-400">Nous aident à comprendre comment vous utilisez notre site.</p>
                </div>
                <button 
                  onClick={() => setAnalyticsEnabled(!analyticsEnabled)}
                  className={`flex h-6 w-12 items-center rounded-full px-1 transition-colors ${analyticsEnabled ? 'justify-end bg-[#BFFF00]' : 'justify-start bg-gray-700'}`}
                >
                  <div className="h-4 w-4 rounded-full bg-black"></div>
                </button>
              </div>
              
              <div className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium text-white">Cookies marketing</p>
                  <p className="text-xs text-gray-400">Permettent de vous offrir du contenu personnalisé.</p>
                </div>
                <button 
                  onClick={() => setMarketingEnabled(!marketingEnabled)}
                  className={`flex h-6 w-12 items-center rounded-full px-1 transition-colors ${marketingEnabled ? 'justify-end bg-[#BFFF00]' : 'justify-start bg-gray-700'}`}
                >
                  <div className="h-4 w-4 rounded-full bg-black"></div>
                </button>
              </div>
            </div>
            
            <div className="flex flex-col space-y-3 pt-2 sm:flex-row sm:space-x-3 sm:space-y-0">
              <button
                onClick={acceptCustom}
                className="rounded-lg bg-[#BFFF00] px-5 py-2.5 text-sm font-medium text-black hover:bg-[#a6e600] transition-colors flex items-center justify-center"
              >
                <Check className="mr-2 h-4 w-4" />
                Enregistrer mes préférences
              </button>
              <button
                onClick={acceptAll}
                className="rounded-lg border border-gray-600 bg-transparent px-5 py-2.5 text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
              >
                Tout accepter
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
} 