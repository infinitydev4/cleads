import { useState, useEffect } from "react"
import { Appointment, AppointmentStatus } from "@prisma/client"
import { format, startOfDay, endOfDay, subDays } from "date-fns"
import { fr } from "date-fns/locale"

interface DashboardStats {
  todayAppointments: number
  newClients: number
  conversionRate: number
  averageCallDuration: number
}

interface ConversionData {
  date: string
  taux: number
}

interface AppointmentsData {
  date: string
  réalisés: number
  prévus: number
}

const initialStats: DashboardStats = {
  todayAppointments: 0,
  newClients: 0,
  conversionRate: 0,
  averageCallDuration: 0,
}

const initialConversionData: ConversionData[] = []
const initialAppointmentsData: AppointmentsData[] = []
const initialUpcomingAppointments: Appointment[] = []

export function useDashboard() {
  const [stats, setStats] = useState<DashboardStats>(initialStats)
  const [conversionData, setConversionData] = useState<ConversionData[]>(initialConversionData)
  const [appointmentsData, setAppointmentsData] = useState<AppointmentsData[]>(initialAppointmentsData)
  const [upcomingAppointments, setUpcomingAppointments] = useState<Appointment[]>(initialUpcomingAppointments)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true)
        
        // Récupérer les rendez-vous d'aujourd'hui
        const today = new Date()
        const todayStart = startOfDay(today)
        const todayEnd = endOfDay(today)
        
        const todayAppointments = await fetch(
          `/api/appointments?date=${todayStart.toISOString()}`
        ).then(res => res.json())

        // Récupérer les rendez-vous des 7 derniers jours pour les graphiques
        const last7Days = Array.from({ length: 7 }, (_, i) => {
          const date = subDays(today, i)
          return {
            date: format(date, "EEE", { locale: fr }),
            start: startOfDay(date),
            end: endOfDay(date),
          }
        }).reverse()

        const appointmentsPromises = last7Days.map(day =>
          fetch(`/api/appointments?date=${day.start.toISOString()}`).then(res => res.json())
        )

        const allAppointments = await Promise.all(appointmentsPromises)

        // Calculer les statistiques
        const newStats = {
          todayAppointments: todayAppointments?.length || 0,
          newClients: todayAppointments?.filter((apt: Appointment) => 
            format(new Date(apt.createdAt), "yyyy-MM-dd") === format(today, "yyyy-MM-dd")
          ).length || 0,
          conversionRate: calculateConversionRate(todayAppointments || []),
          averageCallDuration: 28, // À implémenter avec les données réelles
        }

        // Calculer les données de conversion
        const newConversionData = last7Days.map((day, index) => ({
          date: day.date,
          taux: calculateConversionRate(allAppointments[index] || []),
        }))

        // Calculer les données des rendez-vous
        const newAppointmentsData = last7Days.map((day, index) => ({
          date: day.date,
          réalisés: (allAppointments[index] || []).filter((apt: Appointment) => 
            apt.status === AppointmentStatus.COMPLETED
          ).length,
          prévus: (allAppointments[index] || []).length,
        }))

        // Récupérer les prochains rendez-vous
        const upcomingAppointments = await fetch("/api/appointments").then(res => res.json())

        setStats(newStats)
        setConversionData(newConversionData)
        setAppointmentsData(newAppointmentsData)
        setUpcomingAppointments((upcomingAppointments || []).slice(0, 5))
      } catch (err) {
        setError(err instanceof Error ? err.message : "Une erreur est survenue")
        // En cas d'erreur, on garde les données initiales
        setStats(initialStats)
        setConversionData(initialConversionData)
        setAppointmentsData(initialAppointmentsData)
        setUpcomingAppointments(initialUpcomingAppointments)
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardData()
  }, [])

  const calculateConversionRate = (appointments: Appointment[]) => {
    if (!appointments || appointments.length === 0) return 0
    const completed = appointments.filter(apt => apt.status === AppointmentStatus.COMPLETED).length
    return Math.round((completed / appointments.length) * 100)
  }

  return {
    stats,
    conversionData,
    appointmentsData,
    upcomingAppointments,
    loading,
    error,
  }
} 