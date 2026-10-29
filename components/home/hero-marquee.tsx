"use client"

import { cn } from "@/lib/utils"
import Image from "next/image"

const realizations = [
  {
    name: "SaaS Landing",
    image: "/illustrations/saas.png",
    type: "Landing Page"
  },
  {
    name: "E-commerce",
    image: "/illustrations/ecommerce.png",
    type: "Page produit"
  },
  {
    name: "Site Agence",
    image: "/illustrations/site-agence.png",
    type: "Page d'accueil"
  },
  {
    name: "Cours en ligne",
    image: "/illustrations/elearning.png",
    type: "Page de vente"
  },
  {
    name: "App Landing",
    image: "/illustrations/landing-page.png",
    type: "Landing Page"
  },
  {
    name: "Webinar",
    image: "/illustrations/webinar.png",
    type: "Page d'inscription"
  }
]

const RealizationCard = ({ image, name, type }: {
  image: string
  name: string
  type: string
}) => {
  return (
    <div className={cn(
      "relative w-[160px] cursor-pointer overflow-hidden rounded-xl border-2 border-[#BFFF00] bg-black p-2 mx-2 my-4",
      "hover:scale-105 transition-transform duration-200"
    )}>
      <div className="relative aspect-video w-full overflow-hidden rounded-lg">
        <Image
          src={image}
          alt={name}
          fill
          className="object-cover"
        />
      </div>
      <div className="mt-2">
        <h3 className="font-medium text-white">{name}</h3>
        <p className="text-xs text-[#BFFF00]">{type}</p>
      </div>
      <div className="absolute top-2 right-2 rounded-full bg-[#BFFF00] px-2 py-1">
        <span className="text-xs font-bold text-black">NEW</span>
      </div>
    </div>
  )
}

export function HeroMarquee() {
  const columns = [
    realizations.slice(0, 2),
    realizations.slice(2, 4),
    realizations.slice(0, 2),
    realizations.slice(2, 4),
  ]

  return (
    <div className="relative h-[500px] w-[800px] overflow-hidden">
      <div className="relative flex h-full w-full flex-row items-center justify-center gap-6 [perspective:1000px]">
        <div
          className="flex flex-row items-center gap-6"
          style={{
            transform:
              "translateX(-50px) translateY(0px) translateZ(-100px) rotateX(20deg) rotateY(-10deg) rotateZ(10deg)",
          }}
        >
          {columns.map((column, colIndex) => (
            <div key={colIndex} className="flex flex-col gap-4 animate-marquee-vertical">
              {[...column, ...column, ...column].map((item, index) => (
                <RealizationCard
                  key={`${colIndex}-${index}`}
                  {...item}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Effets de fondu */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-black"></div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black"></div>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-black"></div>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/4 bg-gradient-to-l from-black"></div>
      </div>
    </div>
  )
} 