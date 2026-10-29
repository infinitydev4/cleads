"use client"

import { useCallback } from "react"

interface ConversionEvent {
  event: string
  action: string
  category: string
  label?: string
  value?: number
  currency?: string
  additionalParams?: Record<string, any>
}

export const useConversionTracking = () => {
  const trackConversion = useCallback((event: ConversionEvent) => {
    if (window.dataLayer) {
      window.dataLayer.push({
        ...event,
        timestamp: new Date().toISOString(),
      })
    }
  }, [])

  const trackCTA = useCallback((buttonName: string, pageLocation: string) => {
    trackConversion({
      event: "cta_click",  
      action: "click",
      category: "CTA",
      label: buttonName,
      additionalParams: {
        location: pageLocation,
        path: window.location.pathname,
      }
    })
  }, [])

  const trackFormSubmission = useCallback((formName: string, formData: Record<string, any>) => {
    trackConversion({
      event: "form_submit",
      action: "submit",
      category: "Form",
      label: formName,
      additionalParams: {
        formData: formData,
      }
    })
  }, [])

  const trackPurchase = useCallback((orderData: {
    transactionId: string
    value: number
    currency: string
    items?: any[]
  }) => {
    trackConversion({
      event: "purchase",
      action: "purchase",
      category: "Ecommerce",
      value: orderData.value,
      currency: orderData.currency,
      additionalParams: {
        transactionId: orderData.transactionId,
        items: orderData.items,
      }
    })
  }, [])

  const trackAppointment = useCallback((appointmentData: {
    date: string
    time: string
    type: string
    source: string
  }) => {
    trackConversion({
      event: "appointment_booked",
      action: "book",
      category: "Appointment",
      label: appointmentData.type,
      additionalParams: {
        ...appointmentData,
        timestamp: new Date().toISOString(),
      }
    })
  }, [])

  const trackEngagement = useCallback((action: string, details: Record<string, any>) => {
    trackConversion({
      event: "engagement",
      action,
      category: "Engagement",
      additionalParams: {
        ...details,
        sessionDuration: Date.now() - (window as any).sessionStart,
      }
    })
  }, [])

  return {
    trackConversion,
    trackCTA,
    trackFormSubmission,
    trackPurchase,
    trackAppointment,
    trackEngagement,
  }
} 