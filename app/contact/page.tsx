"use client"

import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Phone, Mail, MapPin, Clock, Send, ArrowRight } from "lucide-react"
import { useConversionTracking } from "@/hooks/useConversionTracking"
import { useState } from "react"
import { TrackedButton } from "@/components/tracking/TrackedButton"
import { GTM_TRIGGERS } from "@/components/analytics/GoogleTagManager"
import { toast } from "sonner"
import { Toaster } from "@/components/ui/toaster"

const contactInfo = [
  {
    icon: Phone,
    title: "Téléphone",
    value: "+33767036848",
    href: "tel:+33767036848"
  },
  {
    icon: Mail,
    title: "Email",
    value: "contact@cleads.fr",
    href: "mailto:contact@cleads.fr"
  },
  {
    icon: MapPin,
    title: "Adresse",
    value: "39 Boulevard Albert Einstien,44300 Nantes",
    href: "https://goo.gl/maps/Nantes"
  },
  {
    icon: Clock,
    title: "Horaires",
    value: "Lun-Ven: 9h-20h",
    href: null
  }
]

export default function ContactPage() {
  const { trackConversion } = useConversionTracking()
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  })

  const handleFormStart = () => {
    trackConversion({
      event: GTM_TRIGGERS.CONTACT_FORM_START,
      action: "start",
      category: "Form",
      label: "contact_form"
    })
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Erreur lors de l'envoi du message")
      }

      toast.success("Message envoyé avec succès ! Vous recevrez un email de confirmation.", {
        duration: 5000,
      })
      
      trackConversion({
        event: GTM_TRIGGERS.CONTACT_FORM_COMPLETE,
        action: "complete",
        category: "Form",
        label: "contact_form",
        additionalParams: { formData }
      })

      // Reset form
      setFormData({
        name: "",
        email: "",
        subject: "",
        message: "",
      })

    } catch (error) {
      console.error("Error submitting form:", error)
      toast.error(error instanceof Error ? error.message : "Une erreur est survenue lors de l'envoi du message", {
        duration: 5000,
      })
      
      trackConversion({
        event: GTM_TRIGGERS.CONTACT_FORM_ERROR,
        action: "error",
        category: "Form",
        label: "contact_form",
        additionalParams: { error: error instanceof Error ? error.message : "Unknown error" }
      })
    }
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  return (
    <main className="bg-black text-white">
      <Toaster />
      
      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 md:py-32">
        {/* Effet de grain */}
        <div 
          className="absolute inset-0 opacity-20" 
          style={{ backgroundImage: 'url("/noise.png")' }}
        />
        
        <div className="container px-4">
          <div className="max-w-4xl mx-auto text-center">
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl md:text-6xl font-bold mb-6"
            >
              Discutons de Votre Projet
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-lg md:text-xl text-gray-400"
            >
              Nous sommes là pour vous aider à créer une landing page qui convertit.
              Prenez contact avec nous pour en discuter.
            </motion.p>
          </div>
        </div>
      </section>

      {/* Contact Grid */}
      <section className="py-16 md:py-24 bg-gray-950">
        <div className="container px-4">
          <div className="grid md:grid-cols-2 gap-12 lg:gap-24">
            {/* Contact Form */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="relative"
            >
              <div className="sticky top-24">
                <h2 className="text-2xl md:text-3xl font-bold mb-8">
                  Envoyez-nous un message
                </h2>
                <form 
                  onSubmit={handleSubmit}
                  onFocus={handleFormStart}
                  className="space-y-6"
                >
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Input
                          name="name"
                          placeholder="Votre nom"
                          value={formData.name}
                          onChange={handleChange}
                          required
                          className="bg-gray-900/50 border-gray-800 focus:border-[#BFFF00] focus:ring-[#BFFF00]/10 placeholder:text-gray-500"
                        />
                      </div>
                      <div>
                        <Input
                          name="email"
                          type="email"
                          placeholder="Votre email"
                          value={formData.email}
                          onChange={handleChange}
                          required
                          className="bg-gray-900/50 border-gray-800 focus:border-[#BFFF00] focus:ring-[#BFFF00]/10 placeholder:text-gray-500"
                        />
                      </div>
                    </div>
                    
                    <Input
                      name="subject"
                      placeholder="Sujet"
                      value={formData.subject}
                      onChange={handleChange}
                      required
                      className="bg-gray-900/50 border-gray-800 focus:border-[#BFFF00] focus:ring-[#BFFF00]/10 placeholder:text-gray-500"
                    />
                    
                    <Textarea
                      name="message"
                      placeholder="Votre message"
                      value={formData.message}
                      onChange={handleChange}
                      required
                      rows={6}
                      className="bg-gray-900/50 border-gray-800 focus:border-[#BFFF00] focus:ring-[#BFFF00]/10 placeholder:text-gray-500 resize-none"
                    />
                  </div>

                  <TrackedButton
                    type="submit"
                    trackingName="contact_page_submit"
                    location="contact_page"
                    icon={<Send className="h-4 w-4" />}
                    className="w-full mt-4"
                  >
                    Envoyer le message
                  </TrackedButton>
                </form>
              </div>
            </motion.div>

            {/* Contact Info */}
            <div>
              <h2 className="text-2xl md:text-3xl font-bold mb-8">
                Informations de contact
              </h2>
              <div className="grid gap-8">
                {contactInfo.map((info, index) => (
                  <motion.div
                    key={info.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    {info.href ? (
                      <a 
                        href={info.href}
                        target={info.href.startsWith('http') ? '_blank' : undefined}
                        rel={info.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                        className="group block p-6 rounded-2xl bg-black/50 border border-gray-800 hover:border-[#BFFF00] transition-colors"
                      >
                        <div className="flex items-start gap-4">
                          <div className="p-3 rounded-xl bg-[#BFFF00]/10 text-[#BFFF00]">
                            <info.icon className="h-6 w-6" />
                          </div>
                          <div>
                            <h3 className="font-medium mb-1 group-hover:text-[#BFFF00]">
                              {info.title}
                            </h3>
                            <p className="text-gray-400">{info.value}</p>
                          </div>
                          <ArrowRight className="h-5 w-5 ml-auto text-gray-600 group-hover:text-[#BFFF00] group-hover:translate-x-1 transition-all" />
                        </div>
                      </a>
                    ) : (
                      <div className="p-6 rounded-2xl bg-black/50 border border-gray-800">
                        <div className="flex items-start gap-4">
                          <div className="p-3 rounded-xl bg-[#BFFF00]/10 text-[#BFFF00]">
                            <info.icon className="h-6 w-6" />
                          </div>
                          <div>
                            <h3 className="font-medium mb-1">{info.title}</h3>
                            <p className="text-gray-400">{info.value}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>

              {/* Map */}
              <div className="mt-12">
                <div className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-gray-800">
                  <iframe
                    src="https://www.google.com/maps/embed/v1/place?key=AIzaSyD0Sw9piZhOGh2U3oDJKePqqaw4VxPxMEw&q=39+Boulevard+Albert+Einstein,+44300+Nantes,+France&zoom=15&language=fr&maptype=roadmap"
                    width="100%"
                    height="100%"
                    style={{ 
                      border: 0,
                      filter: 'grayscale(100%) invert(92%) hue-rotate(180deg) brightness(85%) contrast(85%)'
                    }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    className="absolute inset-0"
                  />
                  {/* Overlay plus prononcé pour l'effet sombre */}
                  <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/40 mix-blend-color-dodge pointer-events-none" />
                  
                  {/* Effet de grain */}
                  <div 
                    className="absolute inset-0 opacity-20 mix-blend-overlay pointer-events-none" 
                    style={{ backgroundImage: 'url("/noise.png")' }}
                  />
                  
                  {/* Point de localisation amélioré */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                    <div className="relative">
                      <div className="w-4 h-4 bg-[#BFFF00] rounded-full shadow-[0_0_20px_rgba(191,255,0,0.5)]" />
                      <div className="absolute inset-0 w-4 h-4 bg-[#BFFF00] rounded-full animate-ping opacity-75" />
                      {/* Effet de lueur supplémentaire */}
                      <div className="absolute -inset-4 bg-[#BFFF00]/20 rounded-full blur-md" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

