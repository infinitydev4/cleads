"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { 
  Clock,
  Plus,
  Save,
  Trash2,
  Copy,
  Calendar,
  ArrowRight,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useAvailability } from "@/hooks/useAvailability"
import { useBreakTime } from "@/hooks/useBreakTime"
import { useExceptions } from "@/hooks/useExceptions"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ExceptionsManager } from "@/components/dashboard/ExceptionsManager"
import { toast } from "sonner"

interface TimeSlot {
  id: number
  day: string
  startTime: string
  endTime: string
  isActive: boolean
}

const daysOfWeek = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
]

const defaultTimeSlots: TimeSlot[] = daysOfWeek.map((day, index) => ({
  id: index + 1,
  day,
  startTime: "09:00",
  endTime: "17:00",
  isActive: index < 5, // Actif du lundi au vendredi par défaut
}))

export default function AvailabilityPage() {
  const { availabilities, loading: loadingAvailabilities, error: availabilityError, updateAvailability } = useAvailability()
  const { breakTime, loading: loadingBreakTime, error: breakTimeError, updateBreakTime } = useBreakTime()
  const { exceptions, loading: loadingExceptions, error: exceptionsError, addException, deleteException, fetchExceptions, setExceptions } = useExceptions()
  
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>(defaultTimeSlots)
  const [isBreakEnabled, setIsBreakEnabled] = useState(true)
  const [breakTimeState, setBreakTimeState] = useState({ start: "12:00", end: "13:00" })
  const [isSaving, setIsSaving] = useState(false)
  const [isExceptionDialogOpen, setIsExceptionDialogOpen] = useState(false)

  useEffect(() => {
    if (availabilities.length > 0) {
      const updatedSlots = daysOfWeek.map((day, index) => {
        const availability = availabilities.find(a => a.dayOfWeek === index + 1)
        return {
          id: index + 1,
          day,
          startTime: availability?.startTime || "09:00",
          endTime: availability?.endTime || "17:00",
          isActive: availability?.isActive ?? (index < 5),
        }
      })
      setTimeSlots(updatedSlots)
    }
  }, [availabilities])

  useEffect(() => {
    if (breakTime) {
      setIsBreakEnabled(breakTime.isActive)
      setBreakTimeState({
        start: breakTime.startTime,
        end: breakTime.endTime,
      })
    }
  }, [breakTime])

  const handleTimeChange = async (
    id: number,
    field: "startTime" | "endTime",
    value: string
  ) => {
    const updatedSlots = timeSlots.map(slot =>
      slot.id === id ? { ...slot, [field]: value } : slot
    )
    setTimeSlots(updatedSlots)

    const slot = updatedSlots.find(s => s.id === id)
    if (slot) {
      await updateAvailability({
        dayOfWeek: id,
        startTime: slot.startTime,
        endTime: slot.endTime,
        isActive: slot.isActive,
      })
    }
  }

  const toggleDayActive = async (id: number) => {
    const updatedSlots = timeSlots.map(slot =>
      slot.id === id ? { ...slot, isActive: !slot.isActive } : slot
    )
    setTimeSlots(updatedSlots)

    const slot = updatedSlots.find(s => s.id === id)
    if (slot) {
      await updateAvailability({
        dayOfWeek: id,
        startTime: slot.startTime,
        endTime: slot.endTime,
        isActive: slot.isActive,
      })
    }
  }

  const copyToAllDays = async (fromId: number) => {
    const sourceSlot = timeSlots.find(slot => slot.id === fromId)
    if (!sourceSlot) return

    const updatedSlots = timeSlots.map(slot => ({
      ...slot,
      startTime: sourceSlot.startTime,
      endTime: sourceSlot.endTime,
    }))
    setTimeSlots(updatedSlots)

    // Mettre à jour toutes les disponibilités
    await Promise.all(
      updatedSlots.map(slot =>
        updateAvailability({
          dayOfWeek: slot.id,
          startTime: slot.startTime,
          endTime: slot.endTime,
          isActive: slot.isActive,
        })
      )
    )
  }

  const handleBreakTimeChange = async (field: "start" | "end", value: string) => {
    const newBreakTime = { ...breakTimeState, [field]: value }
    setBreakTimeState(newBreakTime)
    await updateBreakTime({
      startTime: newBreakTime.start,
      endTime: newBreakTime.end,
      isActive: isBreakEnabled,
    })
  }

  const handleBreakToggle = async (enabled: boolean) => {
    setIsBreakEnabled(enabled)
    await updateBreakTime({
      startTime: breakTimeState.start,
      endTime: breakTimeState.end,
      isActive: enabled,
    })
  }

  const handleSaveAll = async () => {
    setIsSaving(true)
    try {
      // Sauvegarder toutes les disponibilités
      await Promise.all(
        timeSlots.map(slot =>
          updateAvailability({
            dayOfWeek: slot.id,
            startTime: slot.startTime,
            endTime: slot.endTime,
            isActive: slot.isActive,
          })
        )
      )

      // Sauvegarder la pause déjeuner
      await updateBreakTime({
        startTime: breakTimeState.start,
        endTime: breakTimeState.end,
        isActive: isBreakEnabled,
      })

      // Rafraîchir les exceptions
      await fetchExceptions()
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error)
    } finally {
      setIsSaving(false)
    }
  }

  if (loadingAvailabilities || loadingBreakTime || loadingExceptions) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-[#BFFF00]" />
      </div>
    )
  }

  if (availabilityError || breakTimeError || exceptionsError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-red-500">Une erreur est survenue lors du chargement des données</p>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Disponibilites</h1>
          <p className="text-gray-400">Gerez vos horaires de disponibilite</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <Button 
            className="bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
            onClick={handleSaveAll}
            disabled={isSaving}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Enregistrer
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Horaires de disponibilite</h2>
          
          <div className="space-y-6">
            {timeSlots.map((slot) => (
              <div
                key={slot.id}
                className={cn(
                  "p-4 rounded-lg border transition-colors",
                  slot.isActive
                    ? "bg-gray-900/50 border-gray-800"
                    : "bg-gray-900/20 border-gray-800/50"
                )}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={slot.isActive}
                      onCheckedChange={() => toggleDayActive(slot.id)}
                    />
                    <span className="font-medium text-white">{slot.day}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToAllDays(slot.id)}
                    className="text-gray-400 hover:text-white"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gray-400" />
                    <select
                      value={slot.startTime}
                      onChange={(e) => handleTimeChange(slot.id, "startTime", e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded-md px-2 py-1 text-sm text-white"
                      disabled={!slot.isActive}
                    >
                      {Array.from({ length: 24 }, (_, i) => i).map((hour) => (
                        <option key={hour} value={`${hour.toString().padStart(2, "0")}:00`}>
                          {`${hour.toString().padStart(2, "0")}:00`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <ArrowRight className="hidden sm:block h-4 w-4 text-gray-400" />
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gray-400" />
                    <select
                      value={slot.endTime}
                      onChange={(e) => handleTimeChange(slot.id, "endTime", e.target.value)}
                      className="bg-gray-900 border border-gray-800 rounded-md px-2 py-1 text-sm text-white"
                      disabled={!slot.isActive}
                    >
                      {Array.from({ length: 24 }, (_, i) => i).map((hour) => (
                        <option key={hour} value={`${hour.toString().padStart(2, "0")}:00`}>
                          {`${hour.toString().padStart(2, "0")}:00`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Additional Settings */}
        <div className="space-y-6">
          {/* Break Time */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gray-950 border border-gray-800 rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-white">Pause déjeuner</h2>
              <Switch
                checked={isBreakEnabled}
                onCheckedChange={handleBreakToggle}
              />
            </div>

            <div className={cn("space-y-4", !isBreakEnabled && "opacity-50")}>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <select
                    value={breakTimeState.start}
                    onChange={(e) => handleBreakTimeChange("start", e.target.value)}
                    className="bg-gray-900 border border-gray-800 rounded-md px-2 py-1 text-sm text-white"
                    disabled={!isBreakEnabled}
                  >
                    {Array.from({ length: 24 }, (_, i) => i).map((hour) => (
                      <option key={hour} value={`${hour.toString().padStart(2, "0")}:00`}>
                        {`${hour.toString().padStart(2, "0")}:00`}
                      </option>
                    ))}
                  </select>
                </div>
                <ArrowRight className="hidden sm:block h-4 w-4 text-gray-400" />
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <select
                    value={breakTimeState.end}
                    onChange={(e) => handleBreakTimeChange("end", e.target.value)}
                    className="bg-gray-900 border border-gray-800 rounded-md px-2 py-1 text-sm text-white"
                    disabled={!isBreakEnabled}
                  >
                    {Array.from({ length: 24 }, (_, i) => i).map((hour) => (
                      <option key={hour} value={`${hour.toString().padStart(2, "0")}:00`}>
                        {`${hour.toString().padStart(2, "0")}:00`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Exceptions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-gray-950 border border-gray-800 rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-white">Exceptions</h2>
              <Button 
                className="bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
                onClick={() => setIsExceptionDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Ajouter
              </Button>
            </div>

            <div className="space-y-4">
              {exceptions.map((exception) => {
                const exceptionDate = new Date(exception.date)
                return (
                  <div 
                    key={exceptionDate.toISOString()} 
                    className="flex items-center justify-between p-4 rounded-lg border border-gray-800 bg-gray-900/50"
                  >
                    <div className="flex items-center gap-3">
                      <Calendar className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="font-medium text-white">
                          {format(exceptionDate, "d MMMM yyyy", { locale: fr })}
                        </p>
                        <p className="text-sm text-gray-400">
                          {exception.isAvailable ? "Disponible" : "Fermé"}
                          {exception.reason && ` (${exception.reason})`}
                        </p>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-red-400 hover:text-red-500 hover:bg-red-500/10"
                      onClick={async () => {
                        try {
                          // Supprimer l'exception de l'interface immédiatement
                          setExceptions(prev => prev.filter(e => e.date.getTime() !== exceptionDate.getTime()))
                          
                          // Envoyer la requête au serveur
                          await deleteException(exceptionDate)
                          toast.success("Exception supprimée avec succès")
                        } catch (error) {
                          // En cas d'erreur, remettre l'exception dans l'interface
                          setExceptions(prev => [...prev, exception])
                          toast.error("Erreur lors de la suppression de l'exception")
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )
              })}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Dialog pour ajouter une exception */}
      <Dialog open={isExceptionDialogOpen} onOpenChange={setIsExceptionDialogOpen}>
        <DialogContent className="sm:max-w-[600px] bg-gray-950 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              Ajouter une exception
            </DialogTitle>
          </DialogHeader>
          <ExceptionsManager 
            onClose={() => setIsExceptionDialogOpen(false)} 
            onExceptionAdded={(newException) => {
              setExceptions(prev => [...prev, {
                ...newException,
                date: new Date(newException.date)
              }])
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
} 