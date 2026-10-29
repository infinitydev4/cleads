"use client"

import { useState, useEffect } from "react"
import { MessageCircle } from "lucide-react"

export function WhatsAppButton() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true)
    }, 2000)

    return () => clearTimeout(timer)
  }, [])

  return (
    <a
      href="https://wa.me/123456789"
      target="_blank"
      rel="noopener noreferrer"
      className={`fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#BFFF00] text-black shadow-lg transition-transform hover:scale-110 ${
        isVisible ? "opacity-100 scale-100" : "opacity-0 scale-90"
      }`}
      aria-label="Nous contacter sur WhatsApp"
    >
      <span className="sr-only">Ouvrir WhatsApp</span>
      <MessageCircle className="h-7 w-7" aria-hidden="true" />
    </a>
  )
}

