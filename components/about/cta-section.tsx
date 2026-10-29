"use client"

import { BookingDialog } from "@/components/modal/booking-dialog"
export function CTASection() {
  return (
    <section className="py-16 md:py-24 bg-gray-950">
      <div className="container px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-4 md:mb-6">
            Prêt à Booster vos Conversions ?
          </h2>
          <p className="text-sm md:text-base text-gray-400 mb-6 md:mb-8 px-4 md:px-0">
            Réservez un appel gratuit de 30 minutes pour discuter de votre projet 
            et découvrir comment nous pouvons vous aider.
          </p>
          <BookingDialog />
        </div>
      </div>
    </section>
  )
} 