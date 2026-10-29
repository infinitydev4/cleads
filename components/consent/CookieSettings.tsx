"use client"

import { useState, useEffect } from "react"
import { X, Check, Settings, Shield } from "lucide-react"
import { useCookieConsent } from "./CookieBanner"

export function CookieSettings() {
  const [showSettings, setShowSettings] = useState(false)
  const { options, updateConsent } = useCookieConsent()
  const [analyticsEnabled, setAnalyticsEnabled] = useState(options.analytics)
  const [marketingEnabled, setMarketingEnabled] = useState(options.marketing)

  // Met à jour les états locaux quand les options changent
  useEffect(() => {
    setAnalyticsEnabled(options.analytics)
    setMarketingEnabled(options.marketing)
  }, [options])

  const savePreferences = () => {
    updateConsent("custom", {
      analytics: analyticsEnabled,
      marketing: marketingEnabled
    })
    setShowSettings(false)
  }
  
  const acceptAll = () => {
    updateConsent("all")
    setShowSettings(false)
  }

  return (
    <>
      <button
        onClick={() => setShowSettings(true)}
        className="fixed bottom-24 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gray-800 text-white shadow-lg transition-transform hover:scale-110"
        aria-label="Paramètres des cookies"
      >
        <Shield className="h-7 w-7" aria-hidden="true" />
      </button>

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl border border-gray-800 bg-black p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <h3 className="text-xl font-semibold text-white">Paramètres des cookies</h3>
              <button 
                onClick={() => setShowSettings(false)} 
                className="rounded-full bg-gray-800 p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <p className="mt-3 text-sm text-gray-300">
              Gérez vos préférences de cookies. Vous pouvez activer ou désactiver différentes catégories de cookies et modifier vos préférences à tout moment.
            </p>
            
            <div className="mt-6 space-y-4 divide-y divide-gray-800">
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
            
            <div className="mt-6 flex flex-col space-y-3 pt-2 sm:flex-row sm:space-x-3 sm:space-y-0">
              <button
                onClick={savePreferences}
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
        </div>
      )}
    </>
  )
} 