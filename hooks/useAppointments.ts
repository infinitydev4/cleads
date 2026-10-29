import { useState, useEffect } from "react"
import { Appointment, AppointmentStatus, AppointmentType } from "@prisma/client"

interface AppointmentData {
  clientName: string
  email: string
  phone: string
  date: Date
  type: AppointmentType
  notes?: string
}

export function useAppointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAppointments = async (date?: Date, status?: AppointmentStatus) => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (date) params.append("date", date.toISOString())
      if (status) params.append("status", status)

      const response = await fetch(`/api/appointments?${params.toString()}`)
      if (!response.ok) throw new Error("Erreur lors de la récupération des rendez-vous")
      
      const data = await response.json()
      setAppointments(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue")
    } finally {
      setLoading(false)
    }
  }

  const createAppointment = async (data: AppointmentData) => {
    try {
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!response.ok) throw new Error("Erreur lors de la création du rendez-vous")
      
      const newAppointment = await response.json()
      setAppointments(prev => [...prev, newAppointment])
      return newAppointment
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue")
      throw err
    }
  }

  useEffect(() => {
    fetchAppointments()
  }, [])

  return {
    appointments,
    loading,
    error,
    fetchAppointments,
    createAppointment,
  }
} 