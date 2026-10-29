"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { 
  Calendar,
  FileText,
  MessageSquare,
  Clock,
  Loader2,
} from "lucide-react"
import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { ScheduleCalendar } from "@/components/ui/schedule-calendar"
import type { Appointment as CalendarAppointment } from "@/components/ui/schedule-calendar"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { RescheduleForm } from "@/components/client/RescheduleForm"
import { toast } from "sonner"

interface ClientStats {
  totalAppointments: number
  upcomingAppointments: number
  unreadMessages: number
  pendingDocuments: number
}

export default function ClientPage() {
  const { data: session } = useSession()
  const [stats, setStats] = useState<ClientStats>({
    totalAppointments: 0,
    upcomingAppointments: 0,
    unreadMessages: 0,
    pendingDocuments: 0
  })
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isNewAppointmentDialogOpen, setIsNewAppointmentDialogOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        // Récupérer les rendez-vous du client
        const appointmentsResponse = await fetch("/api/client/appointments")
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

        // Calculer les statistiques
        const now = new Date()
        const upcomingAppointments = appointmentsData.filter((apt: any) => 
          new Date(apt.date) > now && apt.status !== "COMPLETED" && apt.status !== "CANCELLED"
        ).length

        setStats({
          totalAppointments: appointmentsData.length,
          upcomingAppointments,
          unreadMessages: 0, // À implémenter
          pendingDocuments: 0 // À implémenter
        })

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
    <div className="p-6 lg:p-8 space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
          </div>
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-2xl font-bold text-white">{stats.totalAppointments}</p>
              <p className="text-sm text-gray-400">Total des rendez-vous</p>
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
              <Clock className="w-6 h-6 text-[#BFFF00]" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-2xl font-bold text-white">{stats.upcomingAppointments}</p>
              <p className="text-sm text-gray-400">Rendez-vous à venir</p>
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
              <MessageSquare className="w-6 h-6 text-[#BFFF00]" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-2xl font-bold text-white">{stats.unreadMessages}</p>
              <p className="text-sm text-gray-400">Messages non lus</p>
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
              <FileText className="w-6 h-6 text-[#BFFF00]" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-2xl font-bold text-white">{stats.pendingDocuments}</p>
              <p className="text-sm text-gray-400">Documents en attente</p>
            </div>
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
            <h2 className="text-xl font-semibold text-white">Mes rendez-vous</h2>
            <p className="text-sm text-gray-400">Calendrier de vos rendez-vous</p>
          </div>
          <Button 
            variant="outline" 
            className="border-gray-800 bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
            onClick={() => router.push('/client/appointments')}
          >
            Voir tous les rendez-vous
          </Button>
        </div>
        <div className="h-[600px]">
          <ScheduleCalendar
            appointments={appointments}
            onAddAppointment={() => {
              // Vérifier s'il y a un rendez-vous en cours
              const hasActiveAppointment = appointments.some(apt => 
                apt.status !== "CANCELLED" && 
                apt.status !== "COMPLETED"
              )

              if (hasActiveAppointment) {
                toast.error("Vous avez déjà un rendez-vous en cours. Veuillez l'annuler avant d'en programmer un nouveau.")
                return
              }

              setIsNewAppointmentDialogOpen(true)
            }}
          />
        </div>
      </motion.div>

      {/* Dialog pour programmer un nouveau rendez-vous */}
      <Dialog open={isNewAppointmentDialogOpen} onOpenChange={setIsNewAppointmentDialogOpen}>
        <DialogContent className="sm:max-w-[600px] bg-gray-950 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              Programmer un nouveau rendez-vous
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Choisissez une date et une heure pour votre nouveau rendez-vous.
            </DialogDescription>
          </DialogHeader>
          <RescheduleForm
            appointmentId="new"
            onSuccess={() => {
              setIsNewAppointmentDialogOpen(false)
              // Rafraîchir la liste des rendez-vous
              const fetchAppointments = async () => {
                try {
                  setLoading(true)
                  const response = await fetch("/api/client/appointments")
                  if (!response.ok) throw new Error("Erreur lors de la récupération des rendez-vous")
                  const data = await response.json()
                  setAppointments(data.map((apt: any) => ({
                    id: apt.id,
                    clientName: apt.clientName,
                    email: apt.email,
                    phone: apt.phone,
                    date: new Date(apt.date),
                    status: apt.status,
                    type: apt.type,
                    notes: apt.notes || undefined
                  })))
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Une erreur est survenue")
                } finally {
                  setLoading(false)
                }
              }
              fetchAppointments()
            }}
            onCancel={() => setIsNewAppointmentDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
} 