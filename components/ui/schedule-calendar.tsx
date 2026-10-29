"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { fr } from "date-fns/locale"
import { 
  format, 
  addDays, 
  startOfWeek, 
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval, 
  isSameDay,
  isSameMonth,
  addMonths,
  subMonths,
} from "date-fns"
import { cn } from "@/lib/utils"
import { Button } from "./button"
import { useConversionTracking } from "@/hooks/useConversionTracking"
import { TrackedButton } from "@/components/tracking/TrackedButton"
import { AppointmentStatus, AppointmentType } from "@prisma/client"

export interface Appointment {
  id: string
  clientName: string
  email: string
  phone: string
  date: Date
  status: AppointmentStatus
  type: AppointmentType
  notes?: string | null
}

interface ScheduleCalendarProps {
  appointments: Appointment[]
  onAddAppointment?: () => void
}

export function ScheduleCalendar({ appointments, onAddAppointment }: ScheduleCalendarProps) {
  const { trackConversion } = useConversionTracking()
  const [currentDate, setCurrentDate] = React.useState(new Date())
  const [view, setView] = React.useState<"day" | "week" | "month">("week")

  const timeSlots = Array.from({ length: 28 }, (_, i) => {
    const hour = Math.floor(i / 2) + 8
    const minutes = i % 2 === 0 ? "00" : "30"
    return `${hour.toString().padStart(2, "0")}:${minutes}`
  })

  const getAppointmentColor = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return "bg-[#BFFF00]/90"
      case "CANCELLED":
        return "bg-red-500/10"
      case "CONFIRMED":
        return "bg-[#BFFF00]/20"
      default:
        return "bg-gray-500/10"
    }
  }

  const getAppointmentTextColor = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return "text-black"
      case "CANCELLED":
        return "text-red-400"
      case "CONFIRMED":
        return "text-[#BFFF00]"
      default:
        return "text-gray-400"
    }
  }

  const getAppointmentTitle = (type: string) => {
    switch (type) {
      case "LANDING_PAGE":
        return "Landing Page"
      case "ECOMMERCE":
        return "E-commerce"
      case "SAAS":
        return "SaaS"
      default:
        return "Autre"
    }
  }

  const getDaysToShow = () => {
    switch (view) {
      case "day":
        return [currentDate]
      case "week":
        return eachDayOfInterval({
          start: startOfWeek(currentDate, { locale: fr }),
          end: endOfWeek(currentDate, { locale: fr }),
        })
      case "month":
        return eachDayOfInterval({
          start: startOfMonth(currentDate),
          end: endOfMonth(currentDate),
        })
    }
  }

  const handleDateNavigation = (direction: "prev" | "next") => {
    switch (view) {
      case "day":
        setCurrentDate(direction === "prev" ? addDays(currentDate, -1) : addDays(currentDate, 1))
        break
      case "week":
        setCurrentDate(direction === "prev" ? addDays(currentDate, -7) : addDays(currentDate, 7))
        break
      case "month":
        setCurrentDate(direction === "prev" ? subMonths(currentDate, 1) : addMonths(currentDate, 1))
        break
    }
  }

  const handleDateSelect = (date: Date) => {
    trackConversion({
      event: "date_select",
      action: "select",
      category: "Calendar",
      label: "date_selection",
      additionalParams: {
        date: date.toISOString(),
        view: view,
      }
    })
  }

  const handleViewChange = (newView: "day" | "week" | "month") => {
    setView(newView)
    trackConversion({
      event: "view_change",
      action: "change",
      category: "Calendar",
      label: newView,
    })
  }

  const renderMonthView = () => {
    const days = getDaysToShow()
    const weeks = []
    let week = []

    // Ajouter les jours du mois précédent pour compléter la première semaine
    const firstDay = days[0]
    const prevMonthDays = eachDayOfInterval({
      start: startOfWeek(firstDay, { locale: fr }),
      end: addDays(firstDay, -1)
    })
    week.push(...prevMonthDays)

    // Ajouter tous les jours du mois
    for (const day of days) {
      week.push(day)
      if (week.length === 7) {
        weeks.push(week)
        week = []
      }
    }

    // Compléter la dernière semaine avec les jours du mois suivant
    if (week.length > 0) {
      const remainingDays = 7 - week.length
      const nextMonthDays = eachDayOfInterval({
        start: days[days.length - 1],
        end: addDays(days[days.length - 1], remainingDays)
      }).slice(1)
      week.push(...nextMonthDays)
      weeks.push(week)
    }

    return (
      <div className="grid grid-cols-7 h-full">
        {/* Jours de la semaine */}
        {eachDayOfInterval({
          start: startOfWeek(currentDate, { locale: fr }),
          end: endOfWeek(currentDate, { locale: fr })
        }).map((day) => (
          <div
            key={day.toString()}
            className="h-12 flex items-center justify-center border-b border-gray-800"
          >
            <span className="text-sm text-gray-400">
              {format(day, "EEE", { locale: fr })}
            </span>
          </div>
        ))}

        {/* Grille des jours */}
        {weeks.map((week, weekIndex) => (
          <React.Fragment key={weekIndex}>
            {week.map((day) => {
              const isCurrentMonth = isSameMonth(day, currentDate)
              const dayAppointments = appointments.filter((apt) => 
                isSameDay(new Date(apt.date), day)
              )

              return (
                <div
                  key={day.toString()}
                  className={cn(
                    "min-h-[120px] p-2 border border-gray-800",
                    !isCurrentMonth && "bg-gray-900/50",
                    isSameDay(day, new Date()) && "bg-[#BFFF00]/10"
                  )}
                  onClick={() => handleDateSelect(day)}
                >
                  <div className="text-sm font-medium mb-2 text-center">
                    <span className={cn(
                      "text-gray-400",
                      isCurrentMonth && "text-white",
                      isSameDay(day, new Date()) && "text-[#BFFF00]"
                    )}>
                      {format(day, "d")}
                    </span>
                  </div>
                  {dayAppointments.length > 0 && (
                    <div 
                      className={cn(
                        "flex items-center justify-center p-1.5 rounded-lg transition-all duration-200 cursor-pointer",
                        "hover:bg-[#BFFF00]/5 group"
                      )}
                      onClick={(e) => {
                        e.stopPropagation()
                        // TODO: Ouvrir une modale avec les détails des rendez-vous
                      }}
                    >
                      <div className={cn(
                        "flex items-center gap-2 px-2 py-1 rounded-md text-xs",
                        "bg-[#BFFF00]/10 text-[#BFFF00] group-hover:bg-[#BFFF00]/20"
                      )}>
                        <div className="font-medium">
                          {dayAppointments.length}
                        </div>
                        <div className="text-[10px]">
                          {dayAppointments.length > 1 ? "rendez-vous" : "rendez-vous"}
                        </div>
                      </div>
                      </div>
                    )}
                </div>
              )
            })}
          </React.Fragment>
        ))}
      </div>
    )
  }

  const renderDayView = () => {
    return (
      <div className="flex flex-col h-full">
        {/* Time column */}
        <div className="w-full border-b border-gray-800">
          <div className="h-12 flex items-center justify-center">
            <span className="text-sm text-gray-400">
              {format(currentDate, "EEEE", { locale: fr })}
            </span>
            <span className="text-lg font-semibold text-white ml-2">
              {format(currentDate, "d MMMM", { locale: fr })}
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="relative">
            {timeSlots.map((time) => (
              <div
                key={time}
                className={cn(
                  "flex border-t border-gray-800 min-h-[45px]",
                  time.endsWith("30") && "bg-gray-900/30"
                )}
              >
                <div className={cn(
                  "w-20 flex-shrink-0 border-r border-gray-800 p-2 text-xs text-gray-400 sticky left-0 bg-gray-950",
                  time.endsWith("30") && "text-[10px] text-gray-500 bg-gray-950/95"
                )}>
                  {time}
                </div>
                <div className="flex flex-1">
            {appointments
                    .filter((apt) => isSameDay(new Date(apt.date), currentDate))
                    .filter((apt) => format(new Date(apt.date), "HH:mm") === time)
              .map((apt) => (
                <div
                  key={apt.id}
                        className={cn(
                          "rounded-lg p-2 text-xs border transition-all duration-200",
                          "mb-2 mt-2 mx-1",
                          getAppointmentColor(apt.status),
                          apt.status === "COMPLETED" ? "border-[#BFFF00]" : "border-transparent",
                          "hover:scale-[1.02] hover:shadow-lg hover:shadow-[#BFFF00]/10"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "font-medium truncate",
                            getAppointmentTextColor(apt.status)
                          )}>
                            {getAppointmentTitle(apt.type)}
                          </div>
                          <div className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded-full",
                            apt.status === "COMPLETED" ? "bg-[#BFFF00]/20 text-[#BFFF00]" :
                            apt.status === "CANCELLED" ? "bg-red-500/10 text-red-400" :
                            "bg-gray-500/10 text-gray-400"
                          )}>
                            {apt.status.toLowerCase()}
                          </div>
                        </div>
                        <div className={cn(
                          "truncate text-[10px]",
                          getAppointmentTextColor(apt.status)
                        )}>{apt.clientName}</div>
                      </div>
                    ))}
                </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Calendar Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-white">
            {format(currentDate, "MMMM yyyy", { locale: fr })}
          </h2>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="border-gray-800 bg-[#BFFF00]"
              onClick={() => handleDateNavigation("prev")}
            >
              <ChevronLeft className="h-4 w-4 text-black" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-gray-800 bg-[#BFFF00]"
              onClick={() => handleDateNavigation("next")}
            >
              <ChevronRight className="h-4 w-4 text-black" />
            </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex items-center gap-1 bg-gray-950 border border-gray-800 rounded-lg p-1">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "px-2 sm:px-3 text-xs sm:text-sm",
                view === "day" && "bg-gray-900 text-[#BFFF00]"
              )}
              onClick={() => handleViewChange("day")}
            >
              Jour
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "px-2 sm:px-3 text-xs sm:text-sm",
                view === "week" && "bg-gray-900 text-[#BFFF00]"
              )}
              onClick={() => handleViewChange("week")}
            >
              Semaine
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "px-2 sm:px-3 text-xs sm:text-sm",
                view === "month" && "bg-gray-900 text-[#BFFF00]"
              )}
              onClick={() => handleViewChange("month")}
            >
              Mois
            </Button>
          </div>

          <TrackedButton
            onClick={onAddAppointment}
            trackingName="add_appointment"
            location="calendar"
            className="hover:bg-[#BFFF00] hover:text-black"
            size = "sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            Ajouter
          </TrackedButton>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-auto bg-gray-950 border border-gray-800 rounded-xl">
        {view === "month" && renderMonthView()}
        {view === "day" && renderDayView()}
        {view === "week" && (
          <div className="flex flex-col h-full">
            {/* Week header */}
            <div className="flex min-w-[800px] border-b border-gray-800">
              <div className="w-20 flex-shrink-0" /> {/* Espace pour la colonne des heures */}
              {getDaysToShow().map((day) => (
                <div
                  key={day.toString()}
                  className="flex-1 p-2 text-center"
                >
                  <div className="text-xs text-gray-400">
                    {format(day, "EEE", { locale: fr })}
                  </div>
                  <div className={cn(
                    "text-sm font-semibold",
                    isSameDay(day, new Date()) ? "text-[#BFFF00]" : "text-white"
                  )}>
                    {format(day, "d")}
                  </div>
                </div>
              ))}
            </div>
            {/* Week content */}
            <div className="flex-1 overflow-y-auto overflow-x-auto">
              <div className="relative min-w-[800px]">
                {timeSlots.map((time) => (
                  <div
                    key={time}
                    className={cn(
                      "flex border-t border-gray-800 min-h-[45px]",
                      time.endsWith("30") && "bg-gray-900/30"
                    )}
                  >
                    <div className={cn(
                      "w-20 flex-shrink-0 border-r border-gray-800 p-2 text-xs text-gray-400 sticky left-0 bg-gray-950",
                      time.endsWith("30") && "text-[10px] text-gray-500 bg-gray-950/95"
                    )}>
                    {time}
                  </div>
                    <div className="flex flex-1">
                {getDaysToShow().map((day) => (
                  <div
                    key={day.toString()}
                      className={cn(
                            "flex-1 min-w-[100px] p-2 border-r border-gray-800 last:border-r-0",
                            time.endsWith("30") && "bg-gray-900/30"
                          )}
                        >
                      {appointments
                            .filter((apt) => isSameDay(new Date(apt.date), day))
                            .filter((apt) => format(new Date(apt.date), "HH:mm") === time)
                        .map((apt) => (
                          <div
                            key={apt.id}
                                className={cn(
                                  "rounded-lg p-2 text-xs border transition-all duration-200",
                                  "mb-2 mx-1",
                                  getAppointmentColor(apt.status),
                                  apt.status === "COMPLETED" ? "border-[#BFFF00]" : "border-transparent",
                                  "hover:scale-[1.02] hover:shadow-lg hover:shadow-[#BFFF00]/10"
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  <div className={cn(
                                    "font-medium truncate",
                                    getAppointmentTextColor(apt.status)
                                  )}>
                                    {getAppointmentTitle(apt.type)}
                                  </div>
                                  <div className={cn(
                                    "text-[10px] px-1.5 py-0.5 rounded-full",
                                    apt.status === "COMPLETED" ? "bg-[#BFFF00]/20 text-[#BFFF00]" :
                                    apt.status === "CANCELLED" ? "bg-red-500/10 text-red-400" :
                                    "bg-gray-500/10 text-gray-400"
                                  )}>
                                    {apt.status.toLowerCase()}
                                  </div>
                                </div>
                                <div className={cn(
                                  "truncate text-[10px]",
                                  getAppointmentTextColor(apt.status)
                                )}>{apt.clientName}</div>
                              </div>
                            ))}
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
} 