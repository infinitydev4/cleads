"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { 
  Calendar as CalendarIcon,
  Grid2X2,
  List,
  Search,
  Clock,
  Phone,
  Mail,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
  RotateCcw,
  Plus,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScheduleCalendar } from "@/components/ui/schedule-calendar"
import { Appointment, AppointmentStatus } from "@prisma/client"
import type { Appointment as CalendarAppointment } from "@/components/ui/schedule-calendar"
import { convertFromUTC, formatAppointmentDate } from "@/lib/date-utils"
import React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { RescheduleForm } from "@/components/client/RescheduleForm"

type ViewMode = "grid" | "list" | "calendar"

export default function ClientAppointmentsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [searchQuery, setSearchQuery] = useState("")
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [isRescheduleDialogOpen, setIsRescheduleDialogOpen] = useState(false)
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false)
  const [isReschedulingFlow, setIsReschedulingFlow] = useState(false)
  const [isNewAppointmentDialogOpen, setIsNewAppointmentDialogOpen] = useState(false)

  useEffect(() => {
    const fetchAppointments = async () => {
      try {
        setLoading(true)
        const response = await fetch("/api/client/appointments")
        if (!response.ok) throw new Error("Erreur lors de la récupération des rendez-vous")
        const data = await response.json()
        // Trier les rendez-vous par date et heure
        const sortedAppointments = data.sort((a: Appointment, b: Appointment) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        )
        setAppointments(sortedAppointments)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Une erreur est survenue")
      } finally {
        setLoading(false)
      }
    }

    fetchAppointments()
  }, [])

  const filterAppointments = (appointments: Appointment[], query: string) => {
    if (!query) return appointments
    return appointments.filter(apt => {
      const searchStr = query.toLowerCase()
      return (
        apt.type.toLowerCase().includes(searchStr) ||
        apt.status.toLowerCase().includes(searchStr)
      )
    })
  }

  const filteredAppointments = filterAppointments(appointments, searchQuery)

  // Fonction modifiée pour gérer le flux de reprogrammation
  const handleStartReschedule = (appointment: Appointment) => {
    setSelectedAppointment(appointment)
    setIsReschedulingFlow(true)
    setIsCancelDialogOpen(true)
  }

  // Fonction modifiée pour la gestion de l'annulation
  const handleCancelAppointment = async (appointment: Appointment) => {
    try {
      const response = await fetch(`/api/appointments/${appointment.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: AppointmentStatus.CANCELLED,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(error || "Erreur lors de l'annulation du rendez-vous")
      }

      // Mettre à jour la liste des rendez-vous
      setAppointments(prev => 
        prev.map(apt => 
          apt.id === appointment.id 
            ? { ...apt, status: AppointmentStatus.CANCELLED }
            : apt
        )
      )

      toast.success("Rendez-vous annulé avec succès")
      setIsCancelDialogOpen(false)

      // Si nous sommes dans le flux de reprogrammation, ouvrir le dialogue de reprogrammation
      if (isReschedulingFlow) {
        setIsRescheduleDialogOpen(true)
      }
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'annulation du rendez-vous")
    }
  }

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
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Mes rendez-vous</h1>
          <p className="text-gray-400">Consultez vos rendez-vous</p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {/* Nouveau bouton */}
          <Button
            className="bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
            onClick={() => setIsNewAppointmentDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Programmer un rendez-vous
          </Button>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Rechercher..."
              className="pl-10 bg-gray-950 border-gray-800 text-white w-full sm:w-[300px]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-1 bg-gray-950 border border-gray-800 rounded-lg p-1">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "px-3",
                viewMode === "grid" && "bg-gray-900 text-[#BFFF00]"
              )}
              onClick={() => setViewMode("grid")}
            >
              <Grid2X2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "px-3",
                viewMode === "list" && "bg-gray-900 text-[#BFFF00]"
              )}
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "px-3",
                viewMode === "calendar" && "bg-gray-900 text-[#BFFF00]"
              )}
              onClick={() => setViewMode("calendar")}
            >
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      {viewMode === "grid" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAppointments.map((appointment) => (
            <motion.div
              key={appointment.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gray-950 border border-gray-800 rounded-xl p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    {appointment.type}
                  </h3>
                </div>
                {appointment.status !== AppointmentStatus.CANCELLED && 
                 appointment.status !== AppointmentStatus.COMPLETED && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-yellow-500 hover:text-yellow-400 hover:bg-yellow-500/10"
                      onClick={() => handleStartReschedule(appointment)}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                      onClick={() => {
                        setSelectedAppointment(appointment)
                        setIsCancelDialogOpen(true)
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <span>
                    {formatAppointmentDate(convertFromUTC(new Date(appointment.date)))}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <span>{appointment.phone}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-gray-400" />
                  <span>{appointment.email}</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {appointment.status === AppointmentStatus.COMPLETED ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : appointment.status === AppointmentStatus.CANCELLED ? (
                      <XCircle className="h-4 w-4 text-red-500" />
                    ) : (
                      <Clock className="h-4 w-4 text-yellow-500" />
                    )}
                    <span className="text-sm font-medium">
                      {appointment.status === AppointmentStatus.COMPLETED
                        ? "Terminé"
                        : appointment.status === AppointmentStatus.CANCELLED
                        ? "Annulé"
                        : "En attente"}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {viewMode === "list" && (
        <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left p-4 text-sm font-medium text-gray-400">
                  Type
                </th>
                <th className="text-left p-4 text-sm font-medium text-gray-400">
                  Date & Heure
                </th>
                <th className="text-left p-4 text-sm font-medium text-gray-400">
                  Statut
                </th>
                <th className="text-right p-4 text-sm font-medium text-gray-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAppointments.map((appointment) => (
                <tr
                  key={appointment.id}
                  className="border-b border-gray-800 hover:bg-gray-900/50"
                >
                  <td className="p-4">
                    <div>
                      <div className="font-medium text-white">
                        {appointment.type}
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="text-sm">
                      {formatAppointmentDate(convertFromUTC(new Date(appointment.date)))}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      {appointment.status === AppointmentStatus.COMPLETED ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : appointment.status === AppointmentStatus.CANCELLED ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <Clock className="h-4 w-4 text-yellow-500" />
                      )}
                      <span className="text-sm">
                        {appointment.status === AppointmentStatus.COMPLETED
                          ? "Terminé"
                          : appointment.status === AppointmentStatus.CANCELLED
                          ? "Annulé"
                          : "En attente"}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    {appointment.status !== AppointmentStatus.CANCELLED && 
                     appointment.status !== AppointmentStatus.COMPLETED && (
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-yellow-500 hover:text-yellow-400 hover:bg-yellow-500/10"
                          onClick={() => handleStartReschedule(appointment)}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                          onClick={() => {
                            setSelectedAppointment(appointment)
                            setIsCancelDialogOpen(true)
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === "calendar" && (
        <div className="h-[calc(100vh-200px)]">
          <ScheduleCalendar
            appointments={appointments.map(apt => {
              const localDate = convertFromUTC(new Date(apt.date))
              return {
                id: apt.id,
                clientName: apt.clientName,
                email: apt.email,
                phone: apt.phone,
                date: localDate,
                status: apt.status,
                type: apt.type,
                notes: apt.notes || undefined
              } as CalendarAppointment
            })}
            onAddAppointment={() => {
              // Vérifier s'il y a un rendez-vous en cours
              const hasActiveAppointment = appointments.some(apt => 
                apt.status !== AppointmentStatus.CANCELLED && 
                apt.status !== AppointmentStatus.COMPLETED
              )

              if (hasActiveAppointment) {
                toast.error("Vous avez déjà un rendez-vous en cours. Veuillez l'annuler avant d'en programmer un nouveau.")
                return
              }

              setIsNewAppointmentDialogOpen(true)
            }}
          />
        </div>
      )}

      {/* Dialog de confirmation d'annulation modifié */}
      <Dialog open={isCancelDialogOpen} onOpenChange={(open) => {
        setIsCancelDialogOpen(open)
        if (!open) setIsReschedulingFlow(false)
      }}>
        <DialogContent className="sm:max-w-[425px] bg-gray-950 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              {isReschedulingFlow ? "Étape 1: Annuler le rendez-vous actuel" : "Annuler le rendez-vous"}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              {isReschedulingFlow 
                ? "Pour reprogrammer votre rendez-vous, nous devons d'abord annuler le rendez-vous actuel. Ensuite, vous pourrez choisir une nouvelle date."
                : "Êtes-vous sûr de vouloir annuler ce rendez-vous ? Cette action ne peut pas être annulée."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-6">
            <Button
              variant="ghost"
              onClick={() => {
                setIsCancelDialogOpen(false)
                setIsReschedulingFlow(false)
              }}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedAppointment && handleCancelAppointment(selectedAppointment)}
              className="bg-red-500 hover:bg-red-600"
            >
              {isReschedulingFlow ? "Continuer vers la reprogrammation" : "Confirmer l'annulation"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de reprogrammation modifié */}
      <Dialog 
        open={isRescheduleDialogOpen} 
        onOpenChange={(open) => {
          setIsRescheduleDialogOpen(open)
          if (!open) setIsReschedulingFlow(false)
        }}
      >
        <DialogContent className="sm:max-w-[600px] bg-gray-950 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              Étape 2: Choisir une nouvelle date
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Votre ancien rendez-vous a été annulé. Choisissez maintenant une nouvelle date et heure qui vous convient.
            </DialogDescription>
          </DialogHeader>
          {selectedAppointment && (
            <RescheduleForm
              appointmentId={selectedAppointment.id}
              onSuccess={() => {
                setIsRescheduleDialogOpen(false)
                setIsReschedulingFlow(false)
                // Rafraîchir la liste des rendez-vous
                const fetchAppointments = async () => {
                  try {
                    setLoading(true)
                    const response = await fetch("/api/client/appointments")
                    if (!response.ok) throw new Error("Erreur lors de la récupération des rendez-vous")
                    const data = await response.json()
                    const sortedAppointments = data.sort((a: Appointment, b: Appointment) => 
                      new Date(a.date).getTime() - new Date(b.date).getTime()
                    )
                    setAppointments(sortedAppointments)
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Une erreur est survenue")
                  } finally {
                    setLoading(false)
                  }
                }
                fetchAppointments()
              }}
              onCancel={() => {
                setIsRescheduleDialogOpen(false)
                setIsReschedulingFlow(false)
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Nouveau Dialog pour programmer un rendez-vous */}
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
                  const sortedAppointments = data.sort((a: Appointment, b: Appointment) => 
                    new Date(a.date).getTime() - new Date(b.date).getTime()
                  )
                  setAppointments(sortedAppointments)
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