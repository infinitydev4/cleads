"use client"

import { useRef } from "react"
import { motion } from "framer-motion"
import { XCircle, CheckCircle, Target, LineChart } from "lucide-react"

const diagnosticPoints = {
  problems: [
    {
      icon: XCircle,
      title: "Trafic non qualifié",
      description: "Visiteurs mal ciblés qui ne correspondent pas à votre audience idéale"
    },
    {
      icon: XCircle,
      title: "CTA peu visible",
      description: "Appels à l'action confus qui ne guident pas vers la conversion"
    },
    {
      icon: XCircle,
      title: "Design non optimisé",
      description: "Structure qui ne met pas en valeur votre proposition de valeur"
    }
  ],
  solutions: [
    {
      icon: CheckCircle,
      title: "Trafic ciblé",
      description: "Audience qualifiée qui correspond parfaitement à votre offre"
    },
    {
      icon: CheckCircle,
      title: "CTA stratégique",
      description: "Parcours utilisateur optimisé pour maximiser les conversions"
    },
    {
      icon: CheckCircle,
      title: "Design convertissant",
      description: "Structure testée et approuvée pour générer des résultats"
    }
  ]
}

function LandingPageWireframe() {
  return (
    <div className="w-full h-full bg-gray-950 p-4 rounded-xl">
    {/* Effet de scanning principal */}
      <motion.div
        initial={{ top: "-10%" }}
        animate={{ top: "110%" }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "linear",
          repeatDelay: 1
        }}
        className="absolute left-0 right-0 z-30 pointer-events-none"
      >
        {/* Ligne de scan principale */}
        <div className="relative h-[2px]">
          {/* Ligne centrale */}
          <div className="absolute inset-0 bg-[#BFFF00]" />
          
          {/* Effet de lueur */}
          <div className="absolute inset-0 bg-[#BFFF00] blur-md" />
          
          {/* Reflet vertical */}
          <div className="absolute left-0 right-0 h-[150px] bg-gradient-to-b from-[#BFFF00]/20 via-[#BFFF00]/5 to-transparent -top-[75px]" />

          {/* Points lumineux sur la ligne */}
          <motion.div 
            className="absolute -left-2 top-1/2 w-4 h-4 rounded-full bg-[#BFFF00] blur-sm -translate-y-1/2"
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
          <motion.div 
            className="absolute -right-2 top-1/2 w-4 h-4 rounded-full bg-[#BFFF00] blur-sm -translate-y-1/2"
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        </div>

        {/* Texte d'analyse */}
        <div className="absolute left-4 -top-6 bg-black/80 px-3 py-1 rounded-full border border-[#BFFF00]/20 backdrop-blur-sm">
          <motion.span 
            className="text-[10px] font-mono text-[#BFFF00]"
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 0.5, repeat: Infinity }}
          >
            SCANNING...
          </motion.span>
        </div>

        {/* Indicateurs de données */}
        <div className="absolute right-4 -bottom-6 flex gap-1">
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              className="w-1 h-4 bg-[#BFFF00]/50 rounded-full"
              animate={{ scaleY: [0.3, 1, 0.3] }}
              transition={{
                duration: 0.5,
                repeat: Infinity,
                delay: i * 0.15
              }}
            />
          ))}
        </div>
      </motion.div>

      {/* Grille d'analyse améliorée */}
      <div className="absolute inset-0 grid grid-cols-6 gap-px">
        {[...Array(36)].map((_, i) => (
          <motion.div
            key={i}
            className="border border-[#BFFF00]/5"
            animate={{ opacity: [0.05, 0.1, 0.05] }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: Math.random() * 2
            }}
          />
        ))}
      </div>

      {/* Points d'analyse améliorés */}
      {[
        { left: "25%", top: "30%" },
        { left: "75%", top: "40%" },
        { left: "45%", top: "60%" },
        { left: "65%", top: "25%" },
        { left: "35%", top: "70%" },
        { left: "55%", top: "45%" },
        { left: "85%", top: "65%" },
        { left: "15%", top: "55%" }
      ].map((position, i) => (
        <motion.div
          key={i}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ 
            scale: [0, 1.2, 1],
            opacity: [0, 1, 0]
          }}
          transition={{
            duration: 2,
            delay: i * 0.5,
            repeat: Infinity,
            repeatDelay: 3
          }}
          className="absolute"
          style={{
            left: position.left,
            top: position.top,
          }}
        >
          {/* Point central */}
          <div 
            className="w-2 h-2 rounded-full bg-[#EF4444]"
            style={{
              boxShadow: "0 0 20px #EF4444"
            }}
          />
          {/* Cercles d'analyse */}
          <div className="absolute inset-[-8px] border border-[#EF4444]/30 rounded-full animate-ping" />
          <div className="absolute inset-[-16px] border border-[#EF4444]/20 rounded-full animate-pulse" />
        </motion.div>
      ))}
      {/* Hero Section */}
      <div className="space-y-4 mb-6">
        <div className="h-3 w-24 bg-gray-800 rounded-full" /> {/* Tag line */}
        <div className="space-y-2">
          <div className="h-6 w-3/4 bg-white rounded-full" /> {/* Headline */}
          <div className="h-6 w-1/2 bg-white rounded-full" />
        </div>
        <div className="space-y-2"> {/* Sous-titres */}
          <div className="h-2 w-2/3 bg-gray-700 rounded-full" />
          <div className="h-2 w-1/2 bg-gray-700 rounded-full" />
        </div>
        <div className="h-10 w-32 bg-[#BFFF00] rounded-lg" /> {/* CTA Button */}
      </div>

      {/* Social Proof */}
      <div className="flex justify-between mb-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gray-800" /> {/* Avatar */}
            <div className="space-y-1">
              <div className="h-2 w-16 bg-gray-700 rounded-full" />
              <div className="h-2 w-12 bg-gray-800 rounded-full" />
            </div>
          </div>
        ))}
      </div>

      {/* Features Section */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-3 rounded-lg bg-gray-900 space-y-2">
            <div className="h-6 w-6 rounded-lg bg-[#BFFF00]/20" /> {/* Icon */}
            <div className="h-3 w-20 bg-gray-700 rounded-full" /> {/* Title */}
            <div className="h-2 w-full bg-gray-800 rounded-full" /> {/* Text */}
            <div className="h-2 w-2/3 bg-gray-800 rounded-full" />
          </div>
        ))}
      </div>

      {/* Results Section */}
      <div className="flex justify-between mb-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="text-center space-y-2">
            <div className="h-8 w-16 mx-auto bg-[#BFFF00] rounded-lg" /> {/* Stat */}
            <div className="h-2 w-24 bg-gray-700 rounded-full" /> {/* Label */}
          </div>
        ))}
      </div>

      {/* Final CTA */}
      <div className="space-y-3">
        <div className="h-4 w-48 mx-auto bg-white rounded-full" /> {/* Title */}
        <div className="h-12 w-40 mx-auto bg-[#BFFF00] rounded-xl" /> {/* Button */}
      </div>

      {/* Éléments de design */}
      <div className="absolute top-4 right-4 w-20 h-20 rounded-full border-2 border-[#BFFF00]/20" />
      {/* <div className="absolute bottom-8 left-8 w-16 h-16 rounded-full border-2 border-[#BFFF00]/20" />
      <div className="absolute top-1/2 right-12 w-12 h-12 rounded-full border-2 border-[#BFFF00]/20" /> */}
    </div>
  )
}

export function DiagnosticSection() {
  const containerRef = useRef<HTMLDivElement>(null)
  const beforeRef = useRef<HTMLDivElement>(null)
  const centerRef = useRef<HTMLDivElement>(null)
  const afterRef = useRef<HTMLDivElement>(null)

  return (
    <section ref={containerRef} className="relative py-16 md:py-24 overflow-hidden">
      <div className="container px-4">
        <div className="text-center mb-12 md:mb-16">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-2xl md:text-4xl font-bold mb-4"
          >
            DIAGNOSTIC DE VOTRE LANDING PAGE
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-gray-400 max-w-2xl mx-auto text-base md:text-lg"
          >
            Transformez votre trafic en résultats concrets grâce à une stratégie de conversion optimisée
          </motion.p>
        </div>

        {/* Version Mobile */}
        <div className="md:hidden space-y-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative rounded-xl overflow-hidden border-2 border-[#BFFF00] aspect-[3/4] mx-4"
          >
            <LandingPageWireframe />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-4 text-center backdrop-blur-sm bg-black/30">
              <p className="text-lg font-bold mb-1">Architecture Optimisée</p>
              <p className="text-sm text-gray-300">Structure convertissante</p>
            </div>
          </motion.div>

          {/* Problèmes avec lignes connectées */}
          <div className="space-y-4 relative">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <Target className="w-5 h-5 text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-red-500">AVANT</h3>
            </div>

            {/* Ligne verticale rouge */}
            <div className="absolute left-5 top-20 bottom-0 w-[2px] bg-gradient-to-b from-red-500/50 to-transparent" />

            {diagnosticPoints.problems.map((point, index) => (
              <motion.div
                key={point.title}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className="relative ml-8 bg-gray-950 rounded-xl p-4 border border-red-500/20"
              >
                {/* Ligne horizontale pour chaque carte */}
                <div className="absolute left-0 top-1/2 w-8 h-[2px] -translate-x-full bg-gradient-to-r from-transparent to-red-500/50" />
                
                <div className="flex items-start gap-3">
                  <point.icon className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold mb-1 text-sm">{point.title}</h4>
                    <p className="text-sm text-gray-400">{point.description}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Solutions avec lignes connectées */}
          <div className="space-y-4 relative">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-[#BFFF00]/10 flex items-center justify-center">
                <LineChart className="w-5 h-5 text-[#BFFF00]" />
              </div>
              <h3 className="text-xl font-bold text-[#BFFF00]">APRÈS</h3>
            </div>

            {/* Ligne verticale verte */}
            <div className="absolute left-5 top-20 bottom-0 w-[2px] bg-gradient-to-b from-[#BFFF00]/50 to-transparent" />

            {diagnosticPoints.solutions.map((point, index) => (
              <motion.div
                key={point.title}
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className="relative ml-8 bg-gray-950 rounded-xl p-4 border border-[#BFFF00]/20"
              >
                {/* Ligne horizontale pour chaque carte */}
                <div className="absolute left-0 top-1/2 w-8 h-[2px] -translate-x-full bg-gradient-to-r from-transparent to-[#BFFF00]/50" />

                <div className="flex items-start gap-3">
                  <point.icon className="w-5 h-5 text-[#BFFF00] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold mb-1 text-sm">{point.title}</h4>
                    <p className="text-sm text-gray-400">{point.description}</p>
                  </div>
                </div>

                {/* Effet de brillance animé */}
                <motion.div
                  initial={{ x: "-100%" }}
                  animate={{ x: "200%" }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "linear",
                    delay: index * 0.2
                  }}
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
                />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Version Desktop */}
        <div className="hidden md:grid lg:grid-cols-3 gap-8 relative">
          {/* Colonne Avant */}
          <div ref={beforeRef} className="space-y-6">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 mb-4">
                <Target className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-2xl font-bold text-red-500">AVANT</h3>
            </div>
            
            {diagnosticPoints.problems.map((point, index) => (
              <motion.div
                key={point.title}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-gray-950 rounded-xl p-6 border border-red-500/20"
              >
                <div className="flex items-start gap-4">
                  <point.icon className="w-6 h-6 text-red-500 shrink-0" />
                  <div>
                    <h4 className="font-bold mb-1">{point.title}</h4>
                    <p className="text-sm text-gray-400">{point.description}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Colonne Centrale - Mockup */}
          <div ref={centerRef} className="relative flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              className="relative w-full aspect-[3/4] rounded-xl overflow-hidden border-2 border-[#BFFF00]"
            >
              <LandingPageWireframe />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-6 text-center backdrop-blur-sm bg-black/30">
                <p className="text-lg font-bold mb-2">Architecture Optimisée</p>
                <p className="text-sm text-gray-300">Structure convertissante</p>
              </div>
            </motion.div>
          </div>

          {/* Colonne Après */}
          <div ref={afterRef} className="space-y-6">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#BFFF00]/10 mb-4">
                <LineChart className="w-8 h-8 text-[#BFFF00]" />
              </div>
              <h3 className="text-2xl font-bold text-[#BFFF00]">APRÈS</h3>
            </div>

            {diagnosticPoints.solutions.map((point, index) => (
              <motion.div
                key={point.title}
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-gray-950 rounded-xl p-6 border border-[#BFFF00]/20"
              >
                <div className="flex items-start gap-4">
                  <point.icon className="w-6 h-6 text-[#BFFF00] shrink-0" />
                  <div>
                    <h4 className="font-bold mb-1">{point.title}</h4>
                    <p className="text-sm text-gray-400">{point.description}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Animated Beams - Desktop only */}
        {/* <AnimatedBeam
          className="hidden md:block"
          containerRef={containerRef}
          fromRef={beforeRef}
          toRef={centerRef}
          curvature={50}
          reverse
          gradientStartColor="#EF4444"
          gradientStopColor="#BFFF00"
        />
        <AnimatedBeam
          className="hidden md:block"
          containerRef={containerRef}
          fromRef={afterRef}
          toRef={centerRef}
          curvature={50}
          gradientStartColor="#BFFF00"
          gradientStopColor="#BFFF00"
        /> */}
      </div>
    </section>
  )
} 