"use client"

import { motion } from "framer-motion"

const steps = [
  {
    number: 1,
    title: "Consultation",
    description: "Nous discutons de votre projet, vos objectifs et votre audience cible pour comprendre vos besoins spécifiques."
  },
  {
    number: 2,
    title: "Création",
    description: "Notre équipe conçoit votre landing page avec un copywriting persuasif et un design optimisé pour les conversions."
  },
  {
    number: 3,
    title: "Livraison",
    description: "Vous recevez votre landing page prête à l'emploi en 72 heures, avec un suivi pour maximiser vos résultats."
  }
]

export function HowItWorksSection() {
  return (
    <section className="py-16 md:py-24 bg-black">
      <div className="container px-4">
        <h2 className="mb-12 text-center text-3xl font-bold tracking-tight md:text-5xl">
          COMMENT ÇA MARCHE
        </h2>

        <div className="grid gap-8 md:grid-cols-3">
          {steps.map((step, index) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="relative p-6 rounded-lg border border-gray-800 bg-black group hover:border-[#BFFF00] transition-colors duration-300"
            >
              <div className="absolute -top-5 -left-5 flex h-10 w-10 items-center justify-center rounded-lg bg-[#BFFF00] text-xl font-bold text-black">
                {step.number}
              </div>
              <h3 className="mt-4 mb-3 text-xl font-bold group-hover:text-[#BFFF00] transition-colors">
                {step.title}
              </h3>
              <p className="text-gray-400">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
} 