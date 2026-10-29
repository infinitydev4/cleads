"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ArrowRight, Download, Mail, Phone, User, CheckCircle } from "lucide-react"

interface FormData {
  firstName: string
  lastName: string
  email: string
  phone: string
}

export default function EbookPage() {
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState<FormData>({
    firstName: "",
    lastName: "",
    email: "",
    phone: ""
  })

  const steps = [
    {
      title: "Identité",
      description: "Commencez par vous présenter",
      fields: ["firstName", "lastName"]
    },
    {
      title: "Contact",
      description: "Comment pouvons-nous vous joindre ?",
      fields: ["email", "phone"]
    },
    {
      title: "Téléchargement",
      description: "Votre guide est prêt !",
      fields: []
    }
  ]

  const handleNext = () => {
    if (step < 3) setStep(step + 1)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Logique d'envoi du formulaire
    handleNext()
  }

  return (
    <div className="min-h-screen bg-black text-white pb-20 pt-[72px] md:pt-20">
      {/* Header avec progression */}
      <div className="fixed top-0 left-0 right-0 z-50">
        <div className="h-1 bg-gray-800">
          <motion.div
            className="h-full bg-[#BFFF00]"
            initial={{ width: "0%" }}
            animate={{ width: `${(step / 3) * 100}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>

      <div className="container px-4 pt-20">
        {/* En-tête avec preview de l'ebook */}
        <div className="text-center mb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative w-48 h-64 mx-auto mb-8"
          >
            <div className="absolute inset-0 bg-[#BFFF00]/20 blur-2xl" />
            <div className="relative bg-gray-900 w-full h-full rounded-lg border-2 border-[#BFFF00] overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-b from-black/0 to-black/60" />
              <div className="absolute bottom-4 left-4 right-4">
                <h3 className="text-sm font-bold mb-1">Guide Expert</h3>
                <p className="text-xs text-gray-400">Les secrets des landing pages qui convertissent</p>
              </div>
            </div>
          </motion.div>
          <h1 className="text-2xl md:text-4xl font-bold mb-4">
            Téléchargez votre guide gratuit
          </h1>
          <p className="text-gray-400 max-w-md mx-auto">
            Découvrez les techniques secrètes pour créer des landing pages qui convertissent à plus de 30%
          </p>
        </div>

        {/* Formulaire par étapes */}
        <div className="max-w-md mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-gray-900/50 backdrop-blur-xl rounded-2xl p-6 border border-white/10"
            >
              <div className="mb-6">
                <h2 className="text-xl font-bold mb-2">{steps[step - 1].title}</h2>
                <p className="text-gray-400 text-sm">{steps[step - 1].description}</p>
              </div>

              {step === 1 && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-4">
                    <div className="relative">
                      <Input
                        type="text"
                        placeholder="Prénom"
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        className="pl-10 bg-black/50 border-white/10 text-white placeholder:text-gray-500"
                        required
                      />
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    </div>
                    <div className="relative">
                      <Input
                        type="text"
                        placeholder="Nom"
                        value={formData.lastName}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                        className="pl-10 bg-black/50 border-white/10 text-white placeholder:text-gray-500"
                        required
                      />
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
                  >
                    Continuer <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </form>
              )}

              {step === 2 && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-4">
                    <div className="relative">
                      <Input
                        type="email"
                        placeholder="Email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="pl-10 bg-black/50 border-white/10 text-white placeholder:text-gray-500"
                        required
                      />
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    </div>
                    <div className="relative">
                      <Input
                        type="tel"
                        placeholder="Téléphone"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="pl-10 bg-black/50 border-white/10 text-white placeholder:text-gray-500"
                        required
                      />
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
                  >
                    Finaliser <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </form>
              )}

              {step === 3 && (
                <div className="text-center">
                  <div className="mb-6">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-16 h-16 rounded-full bg-[#BFFF00]/20 flex items-center justify-center mx-auto mb-4"
                    >
                      <CheckCircle className="w-8 h-8 text-[#BFFF00]" />
                    </motion.div>
                    <h3 className="text-xl font-bold mb-2">Félicitations !</h3>
                    <p className="text-gray-400 text-sm">
                      Votre guide est prêt à être téléchargé
                    </p>
                  </div>
                  <Button
                    onClick={() => window.open("/ebook.pdf", "_blank")}
                    className="w-full bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
                  >
                    Télécharger <Download className="ml-2 w-4 h-4" />
                  </Button>
                </div>
              )}

              {/* Indicateur d'étapes */}
              <div className="flex justify-center mt-6 gap-2">
                {[1, 2, 3].map((i) => (
                  <motion.div
                    key={i}
                    className={`w-2 h-2 rounded-full ${
                      i === step ? "bg-[#BFFF00]" : "bg-gray-700"
                    }`}
                    animate={{
                      scale: i === step ? 1.2 : 1,
                    }}
                  />
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
} 