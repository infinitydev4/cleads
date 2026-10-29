import { useState, useEffect } from "react"
import { Exception } from "@prisma/client"
import { useSession } from "next-auth/react"

interface ExceptionData {
  date: Date
  isAvailable: boolean
  reason?: string
}

export function useExceptions() {
  const { data: session } = useSession()
  const [exceptions, setExceptions] = useState<Exception[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchExceptions = async (startDate?: Date, endDate?: Date) => {
    try {
      setLoading(true)
      if (!session?.user) {
        throw new Error("Non authentifié")
      }

      const params = new URLSearchParams()
      if (startDate) params.append("startDate", startDate.toISOString())
      if (endDate) params.append("endDate", endDate.toISOString())

      const response = await fetch(`/api/exceptions?${params.toString()}`)
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Session expirée, veuillez vous reconnecter")
        }
        throw new Error("Erreur lors de la récupération des exceptions")
      }
      
      const data = await response.json()
      const exceptionsWithDates = data.map((exception: any) => ({
        ...exception,
        date: new Date(exception.date)
      }))
      setExceptions(exceptionsWithDates)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue")
    } finally {
      setLoading(false)
    }
  }

  const addException = async (data: ExceptionData) => {
    try {
      if (!session?.user) {
        throw new Error("Non authentifié")
      }

      const response = await fetch("/api/exceptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Session expirée, veuillez vous reconnecter")
        }
        throw new Error("Erreur lors de l'ajout de l'exception")
      }
      
      const newException = await response.json()
      return { ...newException, date: new Date(newException.date) }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue")
      throw err
    }
  }

  const deleteException = async (date: Date) => {
    try {
      if (!session?.user) {
        throw new Error("Non authentifié")
      }

      const response = await fetch(`/api/exceptions?date=${date.toISOString()}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Session expirée, veuillez vous reconnecter")
        }
        throw new Error("Erreur lors de la suppression de l'exception")
      }
      
      setExceptions(prev => prev.filter(exception => 
        exception.date.getTime() !== date.getTime()
      ))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue")
      throw err
    }
  }

  useEffect(() => {
    if (session?.user) {
      fetchExceptions()
    }
  }, [session])

  return {
    exceptions,
    loading,
    error,
    fetchExceptions,
    addException,
    deleteException,
    setExceptions,
  }
} 