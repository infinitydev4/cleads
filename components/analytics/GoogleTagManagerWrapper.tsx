"use client"

import Script from "next/script"
import { useCookieConsent } from "@/components/consent/CookieBanner"

export default function GoogleTagManagerWrapper() {
  const { hasAnalyticsConsent } = useCookieConsent()
  
  // Si l'utilisateur n'a pas consenti aux cookies d'analyse, ne charge pas GTM
  if (!hasAnalyticsConsent) return null

  return (
    <>
      <Script
        id="gtm-script"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${process.env.NEXT_PUBLIC_GTM_ID}');
          `,
        }}
      />
    </>
  )
} 