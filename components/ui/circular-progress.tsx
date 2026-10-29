"use client"

import { motion } from "framer-motion"
import { useEffect, useState } from "react"

interface CircularProgressProps {
  value: number
  size?: number
  strokeWidth?: number
  color?: string
  children?: React.ReactNode
}

export function CircularProgress({
  value,
  size = 120,
  strokeWidth = 12,
  color = "#BFFF00",
  children
}: CircularProgressProps) {
  const [progress, setProgress] = useState(0)
  
  const center = size / 2
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  useEffect(() => {
    // Reset progress when component mounts
    setProgress(0)
    
    // Animate to target value
    const timer = setTimeout(() => {
      setProgress(value)
    }, 500) // Délai avant le début de l'animation

    return () => clearTimeout(timer)
  }, [value])

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Cercle de fond */}
      <svg
        className="transform -rotate-90"
        width={size}
        height={size}
      >
        <circle
          className="text-gray-800"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={center}
          cy={center}
        />
        <motion.circle
          initial={{ strokeDashoffset: circumference }}
          animate={{ 
            strokeDashoffset: ((100 - progress) / 100) * circumference 
          }}
          transition={{ 
            duration: 2, 
            ease: "easeInOut",
            delay: 0.5 // Délai supplémentaire pour l'effet
          }}
          strokeWidth={strokeWidth}
          stroke={color}
          fill="transparent"
          r={radius}
          cx={center}
          cy={center}
          style={{
            strokeDasharray: circumference,
            strokeLinecap: "round"
          }}
        />
      </svg>

      {/* Score au centre avec animation */}
      <div className="absolute inset-0 flex items-center justify-center">
        {children || (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ 
              opacity: 1, 
              scale: 1 
            }}
            transition={{ 
              duration: 0.5,
              delay: 1 // Apparaît après le début du remplissage
            }}
          >
            <motion.span 
              className="text-2xl font-bold"
              style={{ color }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 1 }}
            >
              {Math.round(progress)}%
            </motion.span>
          </motion.div>
        )}
      </div>

      {/* Effet de brillance */}
      <div 
        className="absolute inset-0 rounded-full opacity-20"
        style={{
          background: `radial-gradient(circle at 30% 30%, ${color}, transparent)`
        }}
      />
    </div>
  )
} 