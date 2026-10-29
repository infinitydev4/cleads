"use client"

import { ExceptionsManager } from "@/components/dashboard/ExceptionsManager"
import { motion } from "framer-motion"

export default function ExceptionsPage() {
  return (
    <div className="p-6 lg:p-8 min-h-[calc(100vh-4rem)]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Gestion des exceptions</h1>
          <p className="text-gray-400">
            Gérez les jours fériés, congés et autres exceptions dans votre calendrier
          </p>
        </div>

        <div className="bg-gray-950/50 rounded-xl p-6">
          <ExceptionsManager />
        </div>
      </motion.div>
    </div>
  )
} 