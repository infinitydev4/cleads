import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"

interface NotificationSettings {
  email: boolean
  push: boolean
  appointments: boolean
  appointmentReminders: boolean
  appointmentChanges: boolean
  appointmentCancellations: boolean
  newMessages: boolean
  contactForm: boolean
  systemUpdates: boolean
  securityAlerts: boolean
  newsletters: boolean
  specialOffers: boolean
}

export function useNotificationSettings() {
  const { data: session } = useSession()
  const [settings, setSettings] = useState<NotificationSettings>({
    email: true,
    push: true,
    appointments: true,
    appointmentReminders: true,
    appointmentChanges: true,
    appointmentCancellations: true,
    newMessages: true,
    contactForm: true,
    systemUpdates: true,
    securityAlerts: true,
    newsletters: false,
    specialOffers: false,
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (session?.user?.id) {
      fetchNotificationSettings()
    }
  }, [session?.user?.id])

  const fetchNotificationSettings = async () => {
    try {
      const response = await fetch("/api/settings/notifications")
      if (response.ok) {
        const data = await response.json()
        setSettings(data)
      }
    } catch (error) {
      console.error("Erreur lors de la récupération des paramètres de notification:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const updateNotificationSettings = async (newSettings: Partial<NotificationSettings>) => {
    try {
      const response = await fetch("/api/settings/notifications", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newSettings),
      })

      if (response.ok) {
        setSettings((prev) => ({ ...prev, ...newSettings }))
        toast.success("Paramètres de notification mis à jour")
      } else {
        throw new Error("Erreur lors de la mise à jour")
      }
    } catch (error) {
      console.error("Erreur lors de la mise à jour des paramètres:", error)
      toast.error("Erreur lors de la mise à jour des paramètres")
      // Revenir aux paramètres précédents en cas d'erreur
      fetchNotificationSettings()
    }
  }

  return {
    settings,
    isLoading,
    updateNotificationSettings,
  }
} 