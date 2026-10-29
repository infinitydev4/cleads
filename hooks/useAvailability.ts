import { useState, useEffect } from "react"
import { Availability } from "@prisma/client"
import { useSession } from "next-auth/react"

interface AvailabilityData {
  dayOfWeek: number
  startTime: string
  endTime: string
  isActive: boolean
}

export function useAvailability() {
  const { data: session } = useSession()
  const [availabilities, setAvailabilities] = useState<Availability[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAvailabilities = async () => {
    try {
      setLoading(true)
      if (!session?.user) {
        throw new Error("Non authentifié")
      }

      const response = await fetch("/api/availability")
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Session expirée, veuillez vous reconnecter")
        }
        throw new Error("Erreur lors de la récupération des disponibilités")
      }
      
      const data = await response.json()
      setAvailabilities(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue")
    } finally {
      setLoading(false)
    }
  }

  const updateAvailability = async (data: AvailabilityData) => {
    try {
      if (!session?.user) {
        throw new Error("Non authentifié")
      }

      const response = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Session expirée, veuillez vous reconnecter")
        }
        throw new Error("Erreur lors de la mise à jour des disponibilités")
      }
      
      const updatedAvailability = await response.json()
      setAvailabilities(prev => 
        prev.map(avail => 
          avail.dayOfWeek === data.dayOfWeek ? updatedAvailability : avail
        )
      )
      return updatedAvailability
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue")
      throw err
    }
  }

  useEffect(() => {
    if (session?.user) {
      fetchAvailabilities()
    }
  }, [session])

  return {
    availabilities,
    loading,
    error,
    fetchAvailabilities,
    updateAvailability,
  }
} 