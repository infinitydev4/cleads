import { useState, useEffect } from "react"
import { BreakTime } from "@prisma/client"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"

interface BreakTimeData {
  startTime: string
  endTime: string
  isActive: boolean
}

export function useBreakTime() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [breakTime, setBreakTime] = useState<BreakTime | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchBreakTime = async () => {
    try {
      setLoading(true)
      if (status === "unauthenticated") {
        router.push("/auth/login")
        return
      }

      if (!session?.user) {
        return
      }

      const response = await fetch("/api/break-time")
      if (!response.ok) {
        if (response.status === 401) {
          router.push("/auth/login")
          return
        }
        throw new Error("Erreur lors de la récupération de la pause déjeuner")
      }
      
      const data = await response.json()
      setBreakTime(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue")
    } finally {
      setLoading(false)
    }
  }

  const updateBreakTime = async (data: BreakTimeData) => {
    try {
      if (status === "unauthenticated") {
        router.push("/auth/login")
        return
      }

      if (!session?.user) {
        return
      }

      const response = await fetch("/api/break-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        if (response.status === 401) {
          router.push("/auth/login")
          return
        }
        throw new Error("Erreur lors de la mise à jour de la pause déjeuner")
      }
      
      const updatedBreakTime = await response.json()
      setBreakTime(updatedBreakTime)
      return updatedBreakTime
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue")
      throw err
    }
  }

  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      fetchBreakTime()
    }
  }, [session, status])

  return {
    breakTime,
    loading,
    error,
    fetchBreakTime,
    updateBreakTime,
  }
} 