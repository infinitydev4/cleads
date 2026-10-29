"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { 
  Calendar, 
  Users, 
  Clock, 
  ArrowUpRight, 
  ArrowDownRight,
  Loader2,
  TrendingUp,
  Activity,
} from "lucide-react"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScheduleCalendar } from "@/components/ui/schedule-calendar"
import type { Appointment as CalendarAppointment } from "@/components/ui/schedule-calendar"
import { useRouter } from "next/navigation"
import {
  ChartTooltip,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"
import { 
  Area, 
  AreaChart, 
  Bar, 
  BarChart, 
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer 
} from "recharts"

interface DashboardStats {
  totalAppointments: number
  totalClients: number
  upcomingAppointments: number
  completedAppointments: number
}

interface ConversionData {
  date: string
  taux: number
}

interface AppointmentChartData {
  date: string
  realises: number
  prevus: number
}

export default function DashboardPage() {
  const router = useRouter()
  const [stats, setStats] = useState<DashboardStats>({
    totalAppointments: 0,
    totalClients: 0,
    upcomingAppointments: 0,
    completedAppointments: 0
  })
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([])
  const [conversionData, setConversionData] = useState<ConversionData[]>([])
  const [appointmentsData, setAppointmentsData] = useState<AppointmentChartData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        // Récupérer les rendez-vous
        const appointmentsResponse = await fetch("/api/appointments")
        if (!appointmentsResponse.ok) throw new Error("Erreur lors de la récupération des rendez-vous")
        const appointmentsData = await appointmentsResponse.json()
        setAppointments(appointmentsData.map((apt: any) => ({
          id: apt.id,
          clientName: apt.clientName,
          email: apt.email,
          phone: apt.phone,
          date: new Date(apt.date),
          status: apt.status,
          type: apt.type,
          notes: apt.notes || undefined
        })))

        // Récupérer les clients
        const clientsResponse = await fetch("/api/clients")
        if (!clientsResponse.ok) throw new Error("Erreur lors de la récupération des clients")
        const clientsData = await clientsResponse.json()

        // Calculer les statistiques
        const now = new Date()
        const upcomingAppointments = appointmentsData.filter((apt: any) => 
          new Date(apt.date) > now && apt.status !== "COMPLETED" && apt.status !== "CANCELLED"
        ).length

        const completedAppointments = appointmentsData.filter((apt: any) => 
          apt.status === "COMPLETED"
        ).length

        setStats({
          totalAppointments: appointmentsData.length,
          totalClients: clientsData.length,
          upcomingAppointments,
          completedAppointments
        })

        // Préparer les données pour les graphiques
        const last7Days = Array.from({ length: 7 }, (_, i) => {
          const date = new Date()
          date.setDate(date.getDate() - i)
          return format(date, "d MMM", { locale: fr })
        }).reverse()

        // Données de conversion (exemple)
        const conversionChartData = last7Days.map(date => ({
          date,
          taux: Math.random() * 100
        }))
        setConversionData(conversionChartData)

        // Données des rendez-vous
        const appointmentsChartData = last7Days.map(date => ({
          date,
          realises: Math.floor(Math.random() * 10),
          prevus: Math.floor(Math.random() * 10)
        }))
        setAppointmentsData(appointmentsChartData)

      } catch (err) {
        setError(err instanceof Error ? err.message : "Une erreur est survenue")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-[#BFFF00]" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-red-500">{error}</p>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gray-950 border border-gray-800 rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-[#BFFF00]/10 rounded-lg">
              <Calendar className="w-6 h-6 text-[#BFFF00]" />
            </div>
            <div className="text-sm text-gray-400">
              {format(new Date(), "d MMMM", { locale: fr })}
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-2xl font-bold text-white">{stats.totalAppointments}</p>
              <p className="text-sm text-gray-400">Total rendez-vous</p>
            </div>
            <div className="flex items-center text-green-500 text-sm">
              <ArrowUpRight className="w-4 h-4 mr-1" />
              <span>+{stats.upcomingAppointments} à venir</span>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gray-950 border border-gray-800 rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-[#BFFF00]/10 rounded-lg">
              <Users className="w-6 h-6 text-[#BFFF00]" />
            </div>
            <div className="text-sm text-gray-400">
              Ce mois-ci
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-2xl font-bold text-white">{stats.totalClients}</p>
              <p className="text-sm text-gray-400">Total clients</p>
            </div>
            <div className="flex items-center text-green-500 text-sm">
              <ArrowUpRight className="w-4 h-4 mr-1" />
              <span>+{stats.completedAppointments} terminés</span>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gray-950 border border-gray-800 rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-[#BFFF00]/10 rounded-lg">
              <Clock className="w-6 h-6 text-[#BFFF00]" />
            </div>
            <div className="text-sm text-gray-400">
              Aujourd'hui
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-2xl font-bold text-white">{stats.upcomingAppointments}</p>
              <p className="text-sm text-gray-400">Rendez-vous à venir</p>
            </div>
            <div className="flex items-center text-red-500 text-sm">
              <ArrowDownRight className="w-4 h-4 mr-1" />
              <span>-{stats.completedAppointments} terminés</span>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-gray-950 border border-gray-800 rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-[#BFFF00]/10 rounded-lg">
              <Calendar className="w-6 h-6 text-[#BFFF00]" />
            </div>
            <div className="text-sm text-gray-400">
              Ce mois-ci
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-2xl font-bold text-white">{stats.completedAppointments}</p>
              <p className="text-sm text-gray-400">Rendez-vous terminés</p>
            </div>
            <div className="flex items-center text-green-500 text-sm">
              <ArrowUpRight className="w-4 h-4 mr-1" />
              <span>+{((stats.completedAppointments / stats.totalAppointments) * 100).toFixed(1)}%</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Graphiques */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Graphique de conversion */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-gray-950 border border-gray-800 rounded-xl p-6"
        >
          <h2 className="text-lg font-semibold mb-4">Taux de conversion</h2>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={conversionData}>
                <defs>
                  <linearGradient id="colorTaux" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#BFFF00" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#BFFF00" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis 
                  dataKey="date" 
                  stroke="#6b7280"
                  tick={{ fill: '#6b7280' }}
                />
                <YAxis 
                  stroke="#6b7280"
                  tick={{ fill: '#6b7280' }}
                />
                <ChartTooltip />
                <Area
                  type="monotone"
                  dataKey="taux"
                  stroke="#BFFF00"
                  fillOpacity={1}
                  fill="url(#colorTaux)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Graphique des rendez-vous */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-gray-950 border border-gray-800 rounded-xl p-6"
        >
          <h2 className="text-lg font-semibold mb-4">Rendez-vous</h2>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={appointmentsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis 
                  dataKey="date" 
                  stroke="#6b7280"
                  tick={{ fill: '#6b7280' }}
                />
                <YAxis 
                  stroke="#6b7280"
                  tick={{ fill: '#6b7280' }}
                />
                <ChartTooltip />
                <Bar dataKey="realises" fill="#BFFF00" name="Realises" />
                <Bar dataKey="prevus" fill="#4b5563" name="Prevus" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* Calendar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-gray-950 border border-gray-800 rounded-xl p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-white">Calendrier des rendez-vous</h2>
            <p className="text-sm text-gray-400">Vue d'ensemble de vos rendez-vous</p>
          </div>
          <Button 
            variant="outline" 
            className="border-gray-800 bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
            onClick={() => router.push('/dashboard/appointments')}
          >
            Voir tous les rendez-vous
          </Button>
        </div>
        <div className="h-[600px]">
          <ScheduleCalendar
            appointments={appointments}
            onAddAppointment={() => {
              // Gérer l'ajout de rendez-vous
            }}
          />
        </div>
      </motion.div>
    </div>
  )
} 