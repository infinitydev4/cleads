"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"

interface TimeLeft {
  hours: number
  minutes: number
  seconds: number
}

export function CountdownTimer() {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({ hours: 72, minutes: 0, seconds: 0 })

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(current => {
        const totalSeconds = current.hours * 3600 + current.minutes * 60 + current.seconds - 1
        
        if (totalSeconds <= 0) {
          clearInterval(timer)
          return { hours: 0, minutes: 0, seconds: 0 }
        }

        return {
          hours: Math.floor(totalSeconds / 3600),
          minutes: Math.floor((totalSeconds % 3600) / 60),
          seconds: totalSeconds % 60
        }
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const TimeUnit = ({ value, label }: { value: number, label: string }) => (
    <div className="flex flex-col items-center">
      <motion.div 
        className="bg-gray-900 rounded-lg p-3 md:p-4 min-w-[60px] md:min-w-[80px] border border-gray-800"
        initial={{ scale: 1 }}
        animate={{ scale: [1, 1.1, 1], transition: { duration: 0.3 } }}
        key={value} // Pour déclencher l'animation à chaque changement
      >
        <span className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-[#BFFF00] to-green-400 bg-clip-text text-transparent">
          {value.toString().padStart(2, '0')}
        </span>
      </motion.div>
      <span className="text-xs text-gray-400 mt-2">{label}</span>
    </div>
  )

  return (
    <div className="flex flex-col items-center">
      <div className="flex gap-4 mb-6">
        <TimeUnit value={timeLeft.hours} label="heures" />
        <div className="text-2xl md:text-3xl font-bold text-[#BFFF00] self-start mt-3 md:mt-4">:</div>
        <TimeUnit value={timeLeft.minutes} label="minutes" />
        <div className="text-2xl md:text-3xl font-bold text-[#BFFF00] self-start mt-3 md:mt-4">:</div>
        <TimeUnit value={timeLeft.seconds} label="secondes" />
      </div>
    </div>
  )
} 