"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Users } from "lucide-react"
import { useEffect, useState } from "react"

interface BookingNotificationProps {
  isOpen: boolean
}

export function BookingNotification({ isOpen }: BookingNotificationProps) {
  const [bookingsToday, setBookingsToday] = useState(3)
  const [shouldShow, setShouldShow] = useState(false)

  // Simuler des réservations aléatoires avec limite à 11
  useEffect(() => {
    if (isOpen) {
      const timer = setInterval(() => {
        setBookingsToday(prev => {
          // Ne pas dépasser 11 réservations
          if (prev >= 11) {
            clearInterval(timer)
            return prev
          }
          return prev + 1
        })
      }, Math.random() * 45000 + 30000) // Entre 30 et 75 secondes pour plus de réalisme

      return () => clearInterval(timer)
    }
  }, [isOpen])

  // Afficher la notification après un délai
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        setShouldShow(true)
      }, 3000) // Délai légèrement plus long pour laisser le dialogue s'ouvrir

      return () => clearTimeout(timer)
    } else {
      setShouldShow(false)
    }
  }, [isOpen])

  return (
    <AnimatePresence>
      {shouldShow && bookingsToday < 11 && (
        <motion.div
          initial={{ opacity: 0, y: 100, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          exit={{ opacity: 0, y: 100, x: "-50%" }}
          transition={{ type: "spring", damping: 20, stiffness: 100 }}
          className="fixed md:absolute bottom-4 md:bottom-12 left-1/2 md:left-[calc(50%-65px)] -translate-x-1/2 md:translate-x-0 w-[90%] md:w-[330px] z-50"
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            transition={{ repeat: Infinity, duration: 2, repeatType: "reverse" }}
            className="flex items-center justify-center gap-3 bg-gray-950/95 border border-gray-800 backdrop-blur-sm 
              px-4 py-3 md:py-2 rounded-t-xl md:rounded-full shadow-xl w-full md:w-auto"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#BFFF00]/20">
              <Users className="w-4 h-4 text-[#BFFF00]" />
            </div>
            <p className="text-sm text-white whitespace-nowrap">
              <span className="font-semibold text-[#BFFF00]">
                {bookingsToday === 10 ? "Dernière place disponible" : `${bookingsToday} personnes`}
              </span>
              {bookingsToday === 10 ? " aujourd'hui !" : " ont réservé aujourd'hui !"}
            </p>
            {/* Effet de pulse */}
            {/* <div className="absolute inset-0 rounded-full animate-ping bg-[#BFFF00]/10" /> */}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
} 