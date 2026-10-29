"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { fr } from "date-fns/locale"
import { format } from "date-fns"
import { toast } from "sonner"
import { Loader2, Clock, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
import { AppointmentType } from "@prisma/client"

interface RescheduleFormProps {
  appointmentId: string
  onSuccess: () => void
  onCancel: () => void
}

export function RescheduleForm({
  appointmentId,
  onSuccess,
  onCancel,
}: RescheduleFormProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [selectedTime, setSelectedTime] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  
  // Champs pour un nouveau rendez-vous
  const [type, setType] = useState<AppointmentType>(AppointmentType.CONSULTATION)

  const isNewAppointment = appointmentId === "new"

  // Charger les créneaux disponibles quand une date est sélectionnée
  useEffect(() => {
    if (selectedDate) {
      const fetchAvailableSlots = async () => {
        setLoadingSlots(true)
        try {
          const response = await fetch(
            `/api/appointments/available-slots?date=${selectedDate.toISOString()}`
          )
          if (!response.ok) throw new Error("Erreur lors de la récupération des créneaux")
          const data = await response.json()
          setAvailableSlots(data.slots || [])
        } catch (error) {
          console.error(error)
          toast.error("Erreur lors de la récupération des créneaux disponibles")
        } finally {
          setLoadingSlots(false)
        }
      }

      fetchAvailableSlots()
    }
  }, [selectedDate])

  const handleTimeSelect = (time: string) => {
    if (selectedSlot === time) {
      setSelectedSlot(null)
      setShowConfirmation(false)
    } else {
      setSelectedSlot(time)
      setSelectedTime(time)
      setShowConfirmation(true)
    }
  }

  const handleSubmit = async () => {
    if (!selectedDate || !selectedTime) {
      toast.error("Veuillez sélectionner une date et une heure")
      return
    }

    setLoading(true)
    try {
      // Créer la date complète
      const [hours, minutes] = selectedTime.split(":")
      const dateTime = new Date(selectedDate)
      dateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0)

      if (isNewAppointment) {
        // Créer un nouveau rendez-vous
        const response = await fetch("/api/client/appointments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            date: dateTime.toISOString(),
            type,
          }),
        })

        if (!response.ok) throw new Error("Erreur lors de la création du rendez-vous")
      } else {
        // Mettre à jour le rendez-vous existant
        const response = await fetch(`/api/appointments/${appointmentId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            date: dateTime.toISOString(),
          }),
        })

        if (!response.ok) throw new Error("Erreur lors de la reprogrammation")
      }

      toast.success(isNewAppointment ? "Rendez-vous créé avec succès" : "Rendez-vous reprogrammé avec succès")
      onSuccess()
    } catch (error) {
      console.error(error)
      toast.error(isNewAppointment ? "Erreur lors de la création du rendez-vous" : "Erreur lors de la reprogrammation du rendez-vous")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {isNewAppointment && (
        <div className="mb-6">
          <Label htmlFor="type">Type de rendez-vous</Label>
          <select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value as AppointmentType)}
            className="w-full bg-gray-950 border border-gray-800 rounded-md px-3 py-2 text-sm"
          >
            <option value={AppointmentType.CONSULTATION}>Consultation</option>
            <option value={AppointmentType.SUIVI}>Suivi</option>
            <option value={AppointmentType.URGENCE}>Urgence</option>
            <option value={AppointmentType.LANDING_PAGE}>Landing Page</option>
            <option value={AppointmentType.ECOMMERCE}>E-commerce</option>
            <option value={AppointmentType.SAAS}>SaaS</option>
            <option value={AppointmentType.OTHER}>Autre</option>
          </select>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-2">
            Sélectionnez une date
          </h3>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            locale={fr}
            className="rounded-md border border-gray-800 h-[330px]"
            disabled={(date) => date < new Date()}
          />
        </div>

        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-2">
            Créneaux disponibles
          </h3>
          <div className="border border-gray-800 rounded-md p-4 h-[330px]">
            {!selectedDate ? (
              <p className="text-sm text-gray-400">
                Veuillez d'abord sélectionner une date
              </p>
            ) : loadingSlots ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-[#BFFF00]" />
              </div>
            ) : availableSlots.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 h-full overflow-y-auto pr-2">
                {availableSlots.map((time) => (
                  <div
                    key={time}
                    className={cn(
                      "relative group transition-all duration-200",
                      selectedSlot === time && "col-span-2"
                    )}
                  >
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full relative bg-gray-950 border-gray-800 text-gray-300 hover:bg-gray-900 hover:text-white",
                          selectedSlot === time && "bg-[#BFFF00] border-[#BFFF00] text-black hover:bg-[#BFFF00]/90 hover:text-black"
                        )}
                        onClick={() => handleTimeSelect(time)}
                      >
                        <Clock className={cn(
                          "h-4 w-4 mr-2",
                          selectedSlot === time ? "text-black" : "text-gray-400"
                        )} />
                        {time}
                      </Button>
                      {selectedSlot === time && (
                        <Button
                          className="bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90 whitespace-nowrap border-[#BFFF00]"
                          onClick={handleSubmit}
                          disabled={loading}
                        >
                          {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Check className="h-4 w-4 mr-2" />
                              Confirmer
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                Aucun créneau disponible pour cette date
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <Button
          variant="ghost"
          onClick={onCancel}
          disabled={loading}
        >
          Annuler
        </Button>
      </div>
    </div>
  )
} 