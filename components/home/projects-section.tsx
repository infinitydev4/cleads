"use client"

import { motion } from "framer-motion"
import { ProjectCard } from "@/components/project-card"

const projects = [
  {
    name: "SPLIIT",
    image: "/placeholder.svg",
    personName: "JONATHAN LALINEC",
    role: "CEO",
    bgColor: "bg-[#BFFF00]"
  },
  {
    name: "LINKERFLOW",
    image: "/placeholder.svg",
    personName: "MARTIN M.",
    role: "CEO",
    bgColor: "bg-[#BFFF00]"
  },
  {
    name: "DRIVVN",
    image: "/placeholder.svg",
    personName: "SOPHIE T.",
    role: "CMO",
    bgColor: "bg-[#BFFF00]"
  },
]

export function ProjectsSection() {
  return (
    <section className="relative overflow-hidden py-16 md:py-24">
      <div className="container relative z-10 px-4 pt-16">
        <motion.h2 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12 text-center text-3xl font-bold tracking-tight md:text-5xl"
        >
          VOICI NOS DERNIÈRES LANDING PAGES
        </motion.h2>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project, index) => (
            <motion.div
              key={project.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <ProjectCard
                name={project.name}
                image={project.image}
                personName={project.personName}
                role={project.role}
                bgColor={project.bgColor}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
} 