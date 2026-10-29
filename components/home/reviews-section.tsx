"use client"

import { Marquee } from "@/components/magicui/marquee"
import { Quote } from "lucide-react"

type Testimonial = {
  name: string
  role: string
  initials: string
  text: string
}

const testimonials: Testimonial[] = [
  {
    name: "Mathieu D.",
    role: "CEO, Spliit",
    initials: "MD",
    text: "Game changer pour nos Ads, il y a un avant et un après sur notre business"
  },
  {
    name: "Thomas B.",
    role: "Founder, Webflow Pro",
    initials: "TB",
    text: "Pas facile d'expliquer quelque chose que personne ne connait, la présentation nous aura permis de faire mieux que qui que ce soit"
  },
  {
    name: "Marc L.",
    role: "CEO, SaaS Platform",
    initials: "ML",
    text: "Nous avons confié nos Ads à l'équipe lesquelles des Ads tournent en continu, depuis qu'on fait nos LP avec Benoît, nos conversions ont explosé"
  },
  {
    name: "Clément D.",
    role: "Co-Founder, Drivvn",
    initials: "CD",
    text: "Benoît nous a challengé sur nos Ads pour qu'il n'y ait plus un taux de conversion beaucoup plus haut et un coût d'acquisition plus bas"
  },
  {
    name: "Nordine M.",
    role: "CEO, Linkerflow",
    initials: "NM",
    text: "Ce n'est pas une simple exécution que propose les équipes de Cleads, c'est un plan marketing pour chaque Landing Page"
  },
  {
    name: "Victoire M.",
    role: "CMO, TechStart",
    initials: "VM",
    text: "Il a été crucial pour nous de créer des Landing dédiées à nos partenaires pour montrer nos produits et de véhiculer les messages"
  }
]

const TestimonialCard = ({ initials, name, role, text }: Testimonial) => {
  return (
    <div className="relative flex items-center gap-4 rounded-2xl border border-gray-800 bg-black/50 px-6 py-4 backdrop-blur-sm w-[400px] mx-2">
      <div className="absolute -top-2 -left-3 flex h-8 w-8 items-center justify-center rounded-xl bg-[#BFFF00] rotate-12">
        <Quote className="h-4 w-4 text-black" />
      </div>

      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-[#BFFF00] bg-black">
        <span className="text-[#BFFF00] font-bold">{initials}</span>
      </div>
      <div className="flex-1">
        <p className="text-sm text-gray-300">"{text}"</p>
        <div className="mt-2">
          <p className="font-medium text-white">{name}</p>
          <p className="text-xs text-gray-400">{role}</p>
        </div>
      </div>
    </div>
  )
}

export function ReviewsSection() {
  // Séparation des témoignages en deux rangées
  const firstRow = testimonials.slice(0, testimonials.length / 2)
  const secondRow = testimonials.slice(testimonials.length / 2)

  return (
    <section className="py-16 md:py-24 bg-black">
      <div className="container px-4">
        <h2 className="mb-12 text-center text-3xl font-bold tracking-tight md:text-5xl">
          CE QUE DISENT NOS CLIENTS
        </h2>

        <div className="relative flex w-full flex-col items-center justify-center overflow-hidden">
          <Marquee pauseOnHover className="[--duration:40s]">
            {firstRow.map((testimonial, index) => (
              <TestimonialCard key={`first-${index}`} {...testimonial} />
            ))}
          </Marquee>
          <div className="my-4"></div>
          <Marquee reverse pauseOnHover className="[--duration:40s]">
            {secondRow.map((testimonial, index) => (
              <TestimonialCard key={`second-${index}`} {...testimonial} />
            ))}
          </Marquee>
          
          {/* Effet de fondu sur les bords */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-black"></div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/4 bg-gradient-to-l from-black"></div>
        </div>
      </div>
    </section>
  )
} 