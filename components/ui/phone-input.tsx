"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { ChevronDown } from "lucide-react"
import { countries } from "@/lib/countries"
import { cn } from "@/lib/utils"

interface PhoneInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string
  onChange: (value: string) => void
  onCountryChange?: (country: string) => void
  label?: string
}

export function PhoneInput({ 
  className,
  label,
  value,
  onChange,
  onCountryChange,
  ...props 
}: PhoneInputProps) {
  const [isFocused, setIsFocused] = React.useState(false)
  const [hasValue, setHasValue] = React.useState(false)
  const [isOpen, setIsOpen] = React.useState(false)
  const [selectedCountry, setSelectedCountry] = React.useState({
    code: "FR",
    dial_code: "+33",
    flag: "🇫🇷"
  })

  // Formater le numéro avec l'indicatif
  const formatPhoneNumber = (number: string, country = selectedCountry) => {
    // Enlever tous les caractères non numériques sauf le +
    const cleaned = number.replace(/[^\d+]/g, '')
    
    // Si le numéro commence déjà par l'indicatif, ne pas l'ajouter
    if (cleaned.startsWith(country.dial_code)) {
      return cleaned
    }
    
    // Si le numéro commence par un +, enlever l'ancien indicatif
    if (cleaned.startsWith('+')) {
      const withoutPrefix = cleaned.replace(/^\+\d+/, '')
      return `${country.dial_code}${withoutPrefix}`
    }
    
    // Sinon, ajouter l'indicatif
    return `${country.dial_code}${cleaned}`
  }

  // Détecter automatiquement le pays de l'utilisateur
  React.useEffect(() => {
    const fetchCountry = async () => {
      try {
        const response = await fetch("/api/ip")
        if (!response.ok) throw new Error("Erreur lors de la récupération du pays")
        const data = await response.json()
        const countryCode = data.country_code
        const country = countries.find(c => c.code === countryCode)
        if (country) {
          setSelectedCountry(country)
          onCountryChange?.(country.code)
          // Mettre à jour le numéro avec le nouvel indicatif
          if (value) {
            const formattedNumber = formatPhoneNumber(value)
            onChange(formattedNumber)
          }
        }
      } catch (error) {
        console.error("Erreur:", error)
      }
    }

    fetchCountry()
  }, [])

  // Mettre à jour le numéro quand le pays change
  const handleCountryChange = (country: typeof selectedCountry) => {
    setSelectedCountry(country)
    setIsOpen(false)
    onCountryChange?.(country.code)
    
    // Reformater le numéro avec le nouvel indicatif
    const formattedNumber = formatPhoneNumber(value, country)
    onChange(formattedNumber)
  }

  React.useEffect(() => {
    setHasValue(Boolean(value))
  }, [value])

  return (
    <div className="relative">
      {label && (
        <motion.label
          initial={false}
          animate={{
            y: isFocused || hasValue ? -24 : 0,
            scale: isFocused || hasValue ? 0.85 : 1,
            color: isFocused ? "#BFFF00" : "#9CA3AF",
          }}
          className="absolute left-[4.5rem] top-1/2 -translate-y-1/2 pointer-events-none origin-left transition-colors"
        >
          {label}
        </motion.label>
      )}

      <div className="relative flex">
        {/* Sélecteur de pays */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "flex items-center gap-1 px-3 h-14 rounded-l-lg border border-r-0",
            "border-gray-800 bg-gray-950/50 text-sm transition-colors",
            isFocused ? "border-[#BFFF00]" : ""
          )}
        >
          <span className="text-lg">{selectedCountry.flag}</span>
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </button>

        {/* Liste des pays */}
        {isOpen && (
          <div className="absolute top-full left-0 mt-1 w-64 max-h-60 overflow-y-auto rounded-lg border border-gray-800 bg-gray-950 shadow-xl z-50">
            <div className="p-2">
              {countries.map((country) => (
                <button
                  key={country.code}
                  type="button"
                  onClick={() => handleCountryChange(country)}
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-gray-900 transition-colors"
                >
                  <span className="text-lg">{country.flag}</span>
                  <span className="text-sm text-gray-300">{country.code}</span>
                  <span className="text-sm text-gray-400 ml-auto">{country.dial_code}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input téléphone */}
        <div className="flex-1 relative">
          <input
            type="tel"
            value={value}
            onChange={(e) => {
              const formattedNumber = formatPhoneNumber(e.target.value)
              onChange(formattedNumber)
            }}
            className={cn(
              "flex h-14 w-full rounded-r-lg border border-gray-800 bg-gray-950/50 pl-2 pr-3 py-2 text-sm",
              "ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none",
              "focus-visible:border-[#BFFF00] focus-visible:ring-0 focus-visible:ring-offset-0",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "transition-colors duration-200",
              className
            )}
            onFocus={() => setIsFocused(true)}
            onBlur={(e) => {
              setIsFocused(false)
              setHasValue(Boolean(e.target.value))
            }}
            {...props}
          />
        </div>
      </div>
    </div>
  )
} 