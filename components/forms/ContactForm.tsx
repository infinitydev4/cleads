"use client"

import { useState } from "react"
import { useConversionTracking } from "@/hooks/useConversionTracking"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { TrackedButton } from "@/components/tracking/TrackedButton"

export function ContactForm() {
  const { trackFormSubmission } = useConversionTracking()
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  })

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    
    try {
      // Logique de soumission...
      
      // Track form submission
      trackFormSubmission("contact_form", {
        ...formData,
        source: "contact_page",
        userType: "prospect",
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
    }
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Input
              name="name"
              placeholder="Votre nom"
              value={formData.name}
              onChange={handleChange}
              required
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
            />
          </div>
        </div>
        
        <Input
          name="subject"
          placeholder="Sujet"
          value={formData.subject}
          onChange={handleChange}
          required
        />
        
        <Textarea
          name="message"
          placeholder="Votre message"
          value={formData.message}
          onChange={handleChange}
          required
          rows={6}
        />
      </div>

      <TrackedButton
        type="submit"
        trackingName="contact_form_submit"
        location="contact_page"
        className="w-full bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
      >
        Envoyer le message
      </TrackedButton>
    </form>
  )
} 