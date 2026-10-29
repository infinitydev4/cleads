"use client"

import { usePathname, useSearchParams } from "next/navigation"
import Script from "next/script"
import { useEffect } from "react"

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID || "GTM-WKPXQHCV"

export const GTM_TRIGGERS = {
  CTA_CLICK: "cta_click",
  FORM_SUBMIT: "form_submit",
  PURCHASE: "purchase",
  PAGE_VIEW: "page_view",
  SCROLL_DEPTH: "scroll_depth",
  TIME_ON_PAGE: "time_on_page",
  APPOINTMENT_BOOKED: "appointment_booked",
  APPOINTMENT_ERROR: "appointment_error",
  APPOINTMENT_STEP: "appointment_step",
  CALENDAR_INTERACTION: "calendar_interaction",
  MODAL_OPEN: "modal_open",
  MODAL_CLOSE: "modal_close",
  FORM_START: "form_start",
  FORM_COMPLETE: "form_complete",
  SCROLL_MILESTONE: "scroll_milestone",
  TIME_SPENT: "time_spent",
  CONTACT_FORM_START: "contact_form_start",
  CONTACT_FORM_COMPLETE: "contact_form_complete",
  CONTACT_FORM_ERROR: "contact_form_error",
} as const

export default function GoogleTagManager() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!pathname) return

    window.dataLayer = window.dataLayer || []
    window.dataLayer.push({
      event: "pageview",
      page: pathname,
      search: searchParams?.toString(),
    })
  }, [pathname, searchParams])

  useEffect(() => {
    window.dataLayer.push({
      event: GTM_TRIGGERS.SCROLL_DEPTH,
      scrollDepth: "50%",
    })
  }, [])

  useEffect(() => {
    const handleScroll = () => {
      const scrollPercent = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100
      
      if (scrollPercent >= 25) {
        window.dataLayer.push({
          event: GTM_TRIGGERS.SCROLL_MILESTONE,
          scrollDepth: "25%"
        })
      }
      if (scrollPercent >= 50) {
        window.dataLayer.push({
          event: GTM_TRIGGERS.SCROLL_MILESTONE,
          scrollDepth: "50%"
        })
      }
      if (scrollPercent >= 75) {
        window.dataLayer.push({
          event: GTM_TRIGGERS.SCROLL_MILESTONE,
          scrollDepth: "75%"
        })
      }
      if (scrollPercent >= 90) {
        window.dataLayer.push({
          event: GTM_TRIGGERS.SCROLL_MILESTONE,
          scrollDepth: "90%"
        })
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const handleBookingSteps = () => {
      window.dataLayer.push({
        event: GTM_TRIGGERS.APPOINTMENT_STEP,
        step: "start",
        location: "booking_modal"
      })
    }

    // ... reste du code existant
  }, [])

  useEffect(() => {
    const startTime = Date.now()
    
    const trackTimeSpent = () => {
      const timeSpent = Math.floor((Date.now() - startTime) / 1000)
      window.dataLayer.push({
        event: GTM_TRIGGERS.TIME_SPENT,
        timeSpentSeconds: timeSpent,
        page: window.location.pathname
      })
    }

    // Track toutes les 30 secondes
    const interval = setInterval(trackTimeSpent, 30000)
    
    // Track au départ de la page
    window.addEventListener('beforeunload', trackTimeSpent)
    
    return () => {
      clearInterval(interval)
      window.removeEventListener('beforeunload', trackTimeSpent)
    }
  }, [])

  return (
    <>
      {/* Google Tag Manager - Script */}
      <Script
        id="gtm-script"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${GTM_ID}');
          `,
        }}
      />
      
      {/* Google Tag Manager - NoScript */}
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
          height="0"
          width="0"
          style={{ display: "none", visibility: "hidden" }}
        />
      </noscript>
    </>
  )
} 