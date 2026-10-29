"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { 
  Calendar as CalendarIcon,
  Grid2X2,
  List,
  Search,
  Filter,
  MoreVertical,
  Clock,
  Phone,
  Mail,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScheduleCalendar } from "@/components/ui/schedule-calendar"
import { Appointment, AppointmentStatus } from "@prisma/client"
import type { Appointment as CalendarAppointment } from "@/components/ui/schedule-calendar"
import { convertFromUTC, formatAppointmentDate } from "@/lib/date-utils"
import React from "react"

type ViewMode = "grid" | "list" | "calendar"

export default function AppointmentsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [searchQuery, setSearchQuery] = useState("")
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Détecter le fuseau horaire de l'utilisateur
  const userTimezone = React.useMemo(() => {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  }, [])

  // Fonction pour convertir une date UTC en date locale
  const convertToLocalDate = React.useCallback((utcDate: Date) => {
    return new Date(utcDate.getTime() + (new Date().getTimezoneOffset() * 60000))
  }, [])

  useEffect(() => {
    const fetchAppointments = async () => {
      try {
        setLoading(true)
        const response = await fetch("/api/appointments")
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
        apt.clientName.toLowerCase().includes(searchStr) ||
        apt.email.toLowerCase().includes(searchStr) ||
        apt.phone.toLowerCase().includes(searchStr) ||
        apt.status.toLowerCase().includes(searchStr)
      )
    })
  }

  const filteredAppointments = filterAppointments(appointments, searchQuery)

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
          <h1 className="text-2xl font-bold text-white mb-1">Rendez-vous</h1>
          <p className="text-gray-400">Gérez vos rendez-vous et consultations</p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Rechercher un client..."
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

          {/* Filter button */}
          <Button variant="outline" size="icon" className="border-gray-800 bg-[#BFFF00]">
            <Filter className="h-4 w-4 text-black" />
          </Button>
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
                    {appointment.clientName}
                  </h3>
                  <p className="text-sm text-gray-400">{appointment.type}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>Modifier</DropdownMenuItem>
                    <DropdownMenuItem>Annuler</DropdownMenuItem>
                    <DropdownMenuItem 
                      className="text-red-500 hover:text-red-500 hover:bg-red-500/10"
                      onClick={async () => {
                        if (confirm("Êtes-vous sûr de vouloir supprimer ce rendez-vous ?")) {
                          try {
                            const response = await fetch(`/api/appointments/${appointment.id}`, {
                              method: "DELETE",
                            });
                            if (!response.ok) throw new Error("Erreur lors de la suppression");
                            setAppointments(appointments.filter(apt => apt.id !== appointment.id));
                          } catch (error) {
                            console.error("Erreur:", error);
                            alert("Erreur lors de la suppression du rendez-vous");
                          }
                        }
                      }}
                    >
                      Supprimer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
                  <span>{appointment.email || "Non renseigné"}</span>
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
                  Client
                </th>
                <th className="text-left p-4 text-sm font-medium text-gray-400">
                  Date & Heure
                </th>
                <th className="text-left p-4 text-sm font-medium text-gray-400">
                  Type
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
                        {appointment.clientName}
                      </div>
                      <div className="text-sm text-gray-400">
                        {appointment.email}
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="text-sm">
                      {formatAppointmentDate(convertFromUTC(new Date(appointment.date)))}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="text-sm">{appointment.type}</div>
                  </td>
                  <td className="p-4">
                    <div
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium",
                        appointment.status === AppointmentStatus.COMPLETED
                          ? "bg-green-500/10 text-green-500"
                          : appointment.status === AppointmentStatus.CANCELLED
                          ? "bg-red-500/10 text-red-500"
                          : "bg-yellow-500/10 text-yellow-500"
                      )}
                    >
                      {appointment.status === AppointmentStatus.COMPLETED ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <Clock className="h-3 w-3" />
                      )}
                      {appointment.status === AppointmentStatus.COMPLETED
                        ? "Terminé"
                        : appointment.status === AppointmentStatus.CANCELLED
                        ? "Annulé"
                        : "En attente"}
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>Modifier</DropdownMenuItem>
                        <DropdownMenuItem>Annuler</DropdownMenuItem>
                        <DropdownMenuItem 
                          className="text-red-500 hover:text-red-500 hover:bg-red-500/10"
                          onClick={async () => {
                            if (confirm("Êtes-vous sûr de vouloir supprimer ce rendez-vous ?")) {
                              try {
                                const response = await fetch(`/api/appointments/${appointment.id}`, {
                                  method: "DELETE",
                                });
                                if (!response.ok) throw new Error("Erreur lors de la suppression");
                                setAppointments(appointments.filter(apt => apt.id !== appointment.id));
                              } catch (error) {
                                console.error("Erreur:", error);
                                alert("Erreur lors de la suppression du rendez-vous");
                              }
                            }
                          }}
                        >
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
              // Convertir la date UTC en date locale
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
              // Gérer l'ajout de rendez-vous
            }}
          />
        </div>
      )}
    </div>
  )
} 