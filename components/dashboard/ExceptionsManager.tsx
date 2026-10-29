"use client"

import { useState, useEffect } from "react"
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useExceptions } from "@/hooks/useExceptions"
import { format, isSameDay } from "date-fns"
import { fr } from "date-fns/locale"
import { Loader2, Info } from "lucide-react"
import { toast } from "sonner"
import { isHoliday, getFrenchHolidays } from "@/lib/holidays"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Exception } from "@prisma/client"

interface ExceptionsManagerProps {
  onClose?: () => void
  onExceptionAdded?: (newException: Exception) => void
}

const PREDEFINED_REASONS = [
  { id: "jour_ferie", label: "Jour férié" },
  { id: "conge", label: "Congé" },
  { id: "maladie", label: "Maladie" },
  { id: "formation", label: "Formation" },
  { id: "autre", label: "Autre" },
] as const

export function ExceptionsManager({ onClose }: ExceptionsManagerProps) {
  const { exceptions, loading, addException, deleteException, fetchExceptions, setExceptions } = useExceptions()
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date())
  const [selectedReason, setSelectedReason] = useState<string>("jour_ferie")
  const [customReason, setCustomReason] = useState("")
  const [isAvailable, setIsAvailable] = useState(false)
  const [holidays, setHolidays] = useState<{ date: Date; name: string }[]>([])

  useEffect(() => {
    // Charger les jours fériés pour l'année en cours et l'année suivante
    const currentYear = new Date().getFullYear()
    const holidaysList = [
      ...getFrenchHolidays(currentYear),
      ...getFrenchHolidays(currentYear + 1)
    ]
    setHolidays(holidaysList)
  }, [])

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date)
    if (date) {
      const holiday = isHoliday(date)
      if (holiday.isHoliday) {
        setSelectedReason("jour_ferie")
        setIsAvailable(false)
      }
    }
  }

  const handleAddException = async () => {
    if (!selectedDate) {
      toast.error("Veuillez sélectionner une date")
      return
    }

    const tempId = `temp-${Date.now()}`
    try {
      const finalReason = selectedReason === "autre" ? customReason : 
        PREDEFINED_REASONS.find(r => r.id === selectedReason)?.label || ""

      // Créer l'objet exception temporaire avec un ID unique
      const tempException = {
        id: tempId,
        userId: "",
        date: selectedDate,
        isAvailable,
        reason: finalReason || null,
        createdAt: new Date(),
        updatedAt: new Date()
      } as Exception

      // Ajouter l'exception temporaire à l'état local
      setExceptions(prev => [...prev, tempException])

      // Envoyer la requête au serveur
      const newException = await addException({
        date: selectedDate,
        isAvailable,
        reason: finalReason || undefined
      })
      
      // Remplacer l'exception temporaire par celle du serveur
      setExceptions(prev => prev.filter(e => e.id !== tempId).concat(newException))
      
      toast.success("Exception ajoutée avec succès")
      setCustomReason("")
      setSelectedReason("jour_ferie")
      setIsAvailable(false)
      onClose?.()
    } catch (error) {
      // En cas d'erreur, retirer l'exception temporaire
      setExceptions(prev => prev.filter(e => e.id !== tempId))
      toast.error("Erreur lors de l'ajout de l'exception")
    }
  }

  const handleDeleteException = async (date: Date) => {
    try {
      await deleteException(date)
      toast.success("Exception supprimée avec succès")
      fetchExceptions()
    } catch (error) {
      toast.error("Erreur lors de la suppression de l'exception")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[#BFFF00]" />
      </div>
    )
  }

  // Layout pour le modal
  if (onClose) {
    return (
      <div className="flex flex-col h-[calc(100vh-200px)] max-h-[800px]">
        {/* Section fixe : Calendrier et formulaire */}
        <div className="flex-shrink-0">
          <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 mb-6">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              locale={fr}
              className="w-full"
              modifiers={{
                holiday: (date) => holidays.some(h => isSameDay(h.date, date))
              }}
              modifiersStyles={{
                holiday: {
                  color: "#BFFF00",
                  fontWeight: "bold"
                }
              }}
              components={{
                DayContent: (props) => {
                  const holiday = holidays.find(h => isSameDay(h.date, props.date))
                  if (holiday) {
                    return (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="relative w-full h-full flex items-center justify-center">
                              {props.date.getDate()}
                              <Info className="absolute bottom-0 right-0 h-3 w-3 text-[#BFFF00]" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="bg-gray-900 border-gray-800">
                            <p>{holiday.name}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )
                  }
                  return <div className="w-full h-full flex items-center justify-center">{props.date.getDate()}</div>
                }
              }}
            />
          </div>

          <div className="space-y-4 mb-6">
            <div className="space-y-2">
              <Label>Raison</Label>
              <Select
                value={selectedReason}
                onValueChange={setSelectedReason}
              >
                <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
                  <SelectValue placeholder="Sélectionnez une raison" />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-800 text-white">
                  {PREDEFINED_REASONS.map((reason) => (
                    <SelectItem 
                      key={reason.id} 
                      value={reason.id}
                      className="hover:bg-gray-800 focus:bg-gray-800 focus:text-white"
                    >
                      {reason.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedReason === "autre" && (
              <div className="space-y-2">
                <Label htmlFor="customReason">Précisez la raison</Label>
                <Input
                  id="customReason"
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Ex: Rendez-vous médical..."
                  className="bg-gray-900 border-gray-800"
                />
              </div>
            )}

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isAvailable"
                checked={isAvailable}
                onChange={(e) => setIsAvailable(e.target.checked)}
                className="rounded border-gray-800 text-[#BFFF00] focus:ring-[#BFFF00]"
              />
              <Label htmlFor="isAvailable">Jour disponible</Label>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleAddException}
                className="flex-1 bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
              >
                Ajouter l'exception
              </Button>
              <Button
                variant="outline"
                onClick={onClose}
                className="border-gray-800 text-gray-400 hover:text-white"
              >
                Annuler
              </Button>
            </div>
          </div>
        </div>

        {/* Section défilante : Liste des exceptions */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="bg-gray-950 border border-gray-800 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4">Exceptions enregistrées</h2>
            <div className="space-y-2">
              {exceptions.length === 0 ? (
                <p className="text-gray-400">Aucune exception enregistrée</p>
              ) : (
                exceptions.map((exception) => (
                  <div
                    key={exception.id}
                    className="flex items-center justify-between p-3 bg-gray-900 rounded-lg"
                  >
                    <div>
                      <p className="font-medium">
                        {format(new Date(exception.date), "d MMMM yyyy", { locale: fr })}
                      </p>
                      {exception.reason && (
                        <p className="text-sm text-gray-400">{exception.reason}</p>
                      )}
                      <p className="text-sm">
                        {exception.isAvailable ? "Jour disponible" : "Jour non disponible"}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteException(new Date(exception.date))}
                      className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                    >
                      Supprimer
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Layout pour la page complète
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Section Calendrier et Formulaire */}
      <div className="bg-gray-950 border border-gray-800 rounded-lg p-6">
        <div className="mb-6">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleDateSelect}
            locale={fr}
            className="w-full"
            modifiers={{
              holiday: (date) => holidays.some(h => isSameDay(h.date, date))
            }}
            modifiersStyles={{
              holiday: {
                color: "#BFFF00",
                fontWeight: "bold"
              }
            }}
            components={{
              DayContent: (props) => {
                const holiday = holidays.find(h => isSameDay(h.date, props.date))
                if (holiday) {
                  return (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="relative w-full h-full flex items-center justify-center">
                            {props.date.getDate()}
                            <Info className="absolute bottom-0 right-0 h-3 w-3 text-[#BFFF00]" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="bg-gray-900 border-gray-800">
                          <p>{holiday.name}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )
                }
                return <div className="w-full h-full flex items-center justify-center">{props.date.getDate()}</div>
              }
            }}
          />
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Raison</Label>
            <Select
              value={selectedReason}
              onValueChange={setSelectedReason}
            >
              <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
                <SelectValue placeholder="Sélectionnez une raison" />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-800 text-white">
                {PREDEFINED_REASONS.map((reason) => (
                  <SelectItem 
                    key={reason.id} 
                    value={reason.id}
                    className="hover:bg-gray-800 focus:bg-gray-800 focus:text-white"
                  >
                    {reason.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedReason === "autre" && (
            <div className="space-y-2">
              <Label htmlFor="customReason">Précisez la raison</Label>
              <Input
                id="customReason"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Ex: Rendez-vous médical..."
                className="bg-gray-900 border-gray-800"
              />
            </div>
          )}

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="isAvailable"
              checked={isAvailable}
              onChange={(e) => setIsAvailable(e.target.checked)}
              className="rounded border-gray-800 text-[#BFFF00] focus:ring-[#BFFF00]"
            />
            <Label htmlFor="isAvailable">Jour disponible</Label>
          </div>

          <Button
            onClick={handleAddException}
            className="w-full bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
          >
            Ajouter l'exception
          </Button>
        </div>
      </div>

      {/* Section Liste des Exceptions */}
      <div className="bg-gray-950 border border-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Exceptions enregistrées</h2>
        <div className="space-y-3 max-h-[calc(100vh-16rem)] overflow-y-auto">
          {exceptions.length === 0 ? (
            <p className="text-gray-400">Aucune exception enregistrée</p>
          ) : (
            exceptions.map((exception) => (
              <div
                key={exception.id}
                className="flex items-center justify-between p-4 bg-gray-900 rounded-lg"
              >
                <div>
                  <p className="font-medium">
                    {format(new Date(exception.date), "d MMMM yyyy", { locale: fr })}
                  </p>
                  {exception.reason && (
                    <p className="text-sm text-gray-400">{exception.reason}</p>
                  )}
                  <p className="text-sm">
                    {exception.isAvailable ? "Jour disponible" : "Jour non disponible"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteException(new Date(exception.date))}
                  className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                >
                  Supprimer
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
} 