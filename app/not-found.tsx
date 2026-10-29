"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Home } from "lucide-react"

export default function NotFound() {
  return (
    <div className="h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full relative">
        {/* Illustration animée */}
        <div className="relative h-[50vh] max-h-[400px] mx-auto mb-8">
          {/* Cercle principal */}
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 1, type: "spring" }}
            className="absolute inset-0 border-4 border-[#BFFF00] rounded-full"
          />

          {/* Lignes de code */}
          <div className="absolute inset-0 flex flex-col justify-center items-center gap-2">
            {[...Array(5)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ x: -100, opacity: 0 }}
                animate={{ x: 0, opacity: 0.5 }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="w-32 h-1.5 bg-gray-800 rounded-full"
                style={{
                  transform: `translateX(${i % 2 ? "15%" : "-15%"})`
                }}
              />
            ))}
          </div>

          {/* Éléments flottants */}
          <div className="absolute inset-0">
            {/* Carrés flottants */}
            {[...Array(4)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ 
                  opacity: [0, 1, 0],
                  scale: [0.8, 1, 0.8],
                  y: [-10, 10, -10]
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  delay: i * 0.5,
                }}
                className="absolute w-6 h-6 border-2 border-[#BFFF00] rounded-lg"
                style={{
                  left: `${25 + (i * 15)}%`,
                  top: `${20 + (i * 15)}%`,
                  opacity: 0.3
                }}
              />
            ))}

            {/* Points de connexion */}
            {[...Array(15)].map((_, i) => (
              <motion.div
                key={`dot-${i}`}
                initial={{ opacity: 0 }}
                animate={{ 
                  opacity: [0, 1, 0],
                  scale: [0.8, 1.2, 0.8],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  delay: Math.random() * 2,
                }}
                className="absolute w-1 h-1 bg-[#BFFF00]"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                }}
              />
            ))}
          </div>

          {/* 404 Glitch Effect */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <div className="relative">
              <motion.div
                animate={{ 
                  x: [-2, 2, -2],
                  y: [-1, 1, -1],
                }}
                transition={{
                  duration: 0.3,
                  repeat: Infinity,
                }}
                className="text-[80px] md:text-[100px] font-bold text-[#BFFF00] opacity-20 select-none"
              >
                404
              </motion.div>
              <motion.div
                animate={{ 
                  x: [2, -2, 2],
                  y: [1, -1, 1],
                }}
                transition={{
                  duration: 0.3,
                  repeat: Infinity,
                }}
                className="absolute inset-0 flex items-center justify-center text-[80px] md:text-[100px] font-bold text-[#BFFF00]/50 select-none"
              >
                404
              </motion.div>
            </div>
          </motion.div>

          {/* Lignes de connexion animées */}
          <div className="absolute inset-0">
            <motion.div
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.5 }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0"
            >
              <svg className="w-full h-full" viewBox="0 0 100 100">
                <motion.path
                  d="M20,50 L80,50"
                  stroke="#BFFF00"
                  strokeWidth="0.2"
                  fill="none"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <motion.path
                  d="M50,20 L50,80"
                  stroke="#BFFF00"
                  strokeWidth="0.2"
                  fill="none"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                />
              </svg>
            </motion.div>
          </div>
        </div>

        {/* Texte et Bouton */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
          className="text-center space-y-4"
        >
          <div className="space-y-2">
            <h1 className="text-3xl md:text-5xl font-bold text-white">
              Page introuvable
            </h1>
            <p className="text-lg text-gray-400 max-w-lg mx-auto">
              La page que vous recherchez semble avoir disparu dans le cyberespace.
            </p>
          </div>
          <Link href="/">
            <Button className="bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90 text-base px-6 py-4">
              <Home className="w-5 h-5 mr-2" />
              Retour à l'accueil
            </Button>
          </Link>
        </motion.div>
      </div>
    </div>
  )
} 