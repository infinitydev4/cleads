"use client"

import Image from "next/image"
import { motion } from "framer-motion"

const teamMembers = [
  {
    name: "Jonathan Lalinec",
    role: "Fondateur & CEO",
    image: "/placeholder.svg",
  },
  {
    name: "Marie Laurent",
    role: "Directrice Créative",
    image: "/placeholder.svg",
  },
  {
    name: "Thomas Bernard",
    role: "Lead Developer",
    image: "/placeholder.svg",
  },
  {
    name: "Sophie Dupont",
    role: "Copywriter",
    image: "/placeholder.svg",
  },
]

export function TeamSection() {
  return (
    <section className="py-16 md:py-24 bg-gray-950">
      <div className="container px-4">
        <h2 className="mb-12 text-center text-3xl font-bold tracking-tight md:text-5xl">
          NOTRE ÉQUIPE
        </h2>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {teamMembers.map((member, index) => (
            <motion.div
              key={member.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
              className="group relative"
            >
              <div className="relative aspect-square overflow-hidden rounded-2xl">
                {/* Fond avec effet de grain */}
                <div className="absolute inset-0 bg-black opacity-50 mix-blend-overlay rounded-2xl" 
                  style={{ backgroundImage: 'url("/noise.png")' }} 
                />
                
                {/* Image */}
                <div className="relative h-full w-full transform transition-transform duration-500 group-hover:scale-105">
                  <Image
                    src={member.image}
                    alt={member.name}
                    fill
                    className="object-cover rounded-2xl"
                  />
                </div>

                {/* Bordure animée */}
                <div className="absolute inset-0 border-2 border-[#BFFF00] opacity-0 transition-opacity duration-300 group-hover:opacity-100 rounded-2xl" />
                
                {/* Overlay au hover */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 rounded-2xl" />
              </div>

              {/* Texte */}
              <div className="absolute bottom-0 left-0 right-0 p-6 transform transition-transform duration-300 group-hover:translate-y-0">
                <h3 className="text-xl font-bold text-white mb-1">{member.name}</h3>
                <p className="text-[#BFFF00] text-sm font-medium">{member.role}</p>
              </div>

              {/* Badge position */}
              <div className="absolute -top-2 -right-2 bg-[#BFFF00] px-4 py-1.5 rounded-full shadow-lg">
                <span className="text-xs font-bold text-black">EXPERT</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
} 