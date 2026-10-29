"use client"

import { useState, useEffect } from "react"

type ConsentOptions = {
  analytics: boolean
  marketing: boolean
}

// Événement personnalisé pour communiquer entre composants
const CONSENT_CHANGE_EVENT = "cookie-consent-change"

export function useCookieConsent() {
  const [consent, setConsent] = useState<string | null>(null)
  const [options, setOptions] = useState<ConsentOptions>({
    analytics: false,
    marketing: false
  })

  // Fonction pour déclencher l'événement de changement de consentement
  const triggerConsentChange = () => {
    // Crée un événement personnalisé
    const event = new Event(CONSENT_CHANGE_EVENT)
    window.dispatchEvent(event)
  }

  useEffect(() => {
    // Charge le statut du consentement depuis localStorage
    const loadConsent = () => {
      try {
        const savedConsent = localStorage.getItem("cookie-consent")
        const analyticsEnabled = localStorage.getItem("cookie-analytics") === "true"
        const marketingEnabled = localStorage.getItem("cookie-marketing") === "true"

        setConsent(savedConsent)
        setOptions({
          analytics: analyticsEnabled,
          marketing: marketingEnabled
        })
      } catch (error) {
        // En cas d'erreur (e.g. localStorage non disponible en mode privé)
        console.error("Erreur lors de l'accès à localStorage:", error)
      }
    }

    // Charge le consentement au montage
    loadConsent()

    // Écoute les changements de consentement depuis d'autres composants
    const handleConsentChange = () => {
      loadConsent()
    }

    window.addEventListener(CONSENT_CHANGE_EVENT, handleConsentChange)
    
    return () => {
      window.removeEventListener(CONSENT_CHANGE_EVENT, handleConsentChange)
    }
  }, [])

  const updateConsent = (type: string, newOptions?: ConsentOptions) => {
    try {
      // Met à jour l'état local
      setConsent(type)
      localStorage.setItem("cookie-consent", type)

      // Met à jour les options
      if (newOptions) {
        setOptions(newOptions)
        localStorage.setItem("cookie-analytics", newOptions.analytics ? "true" : "false")
        localStorage.setItem("cookie-marketing", newOptions.marketing ? "true" : "false")
      } else if (type === "all") {
        const allOptions = { analytics: true, marketing: true }
        setOptions(allOptions)
        localStorage.setItem("cookie-analytics", "true")
        localStorage.setItem("cookie-marketing", "true")
      } else if (type === "essential") {
        const essentialOptions = { analytics: false, marketing: false }
        setOptions(essentialOptions)
        localStorage.setItem("cookie-analytics", "false")
        localStorage.setItem("cookie-marketing", "false")
      }

      // Notifie les autres composants du changement
      triggerConsentChange()
    } catch (error) {
      console.error("Erreur lors de la mise à jour du consentement:", error)
    }
  }

  return {
    consent,
    options,
    updateConsent,
    hasConsented: consent !== null,
    hasAnalyticsConsent: options.analytics,
    hasMarketingConsent: options.marketing
  }
} 