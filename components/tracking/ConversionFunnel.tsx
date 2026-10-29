"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { useConversionTracking } from "@/hooks/useConversionTracking"

const FUNNEL_STEPS = {
  "/": "landing",
  "/pricing": "pricing",
  "/contact": "contact",
  "/checkout": "checkout",
  "/success": "success",
} as const

export function ConversionFunnel() {
  const pathname = usePathname()
  const { trackConversion } = useConversionTracking()

  useEffect(() => {
    if (pathname && FUNNEL_STEPS[pathname as keyof typeof FUNNEL_STEPS]) {
      trackConversion({
        event: "funnel_step",
        action: "funnel_step",
        category: "Conversion",
        label: FUNNEL_STEPS[pathname as keyof typeof FUNNEL_STEPS],
        additionalParams: {
          step: FUNNEL_STEPS[pathname as keyof typeof FUNNEL_STEPS],
          previousStep: sessionStorage.getItem("previousFunnelStep"),
        }
      })

      sessionStorage.setItem(
        "previousFunnelStep",
        FUNNEL_STEPS[pathname as keyof typeof FUNNEL_STEPS]
      )
    }
  }, [pathname])

  return null
} 