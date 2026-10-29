"use client"

import { useCookieConsent } from "@/components/consent/CookieBanner"

export default function GoogleTagManagerNoScript() {
  const { hasAnalyticsConsent } = useCookieConsent()
  
  // Si l'utilisateur n'a pas consenti aux cookies d'analyse, ne charge pas GTM
  if (!hasAnalyticsConsent) return null

  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${process.env.NEXT_PUBLIC_GTM_ID}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
      />
    </noscript>
  )
} 