"use client"

import * as React from "react"
import { Calendar } from "@/components/ui/calendar"
import { ChevronLeft, ChevronRight, Clock, X } from "lucide-react"
import Image from "next/image"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/modal/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { fr } from "date-fns/locale"
import { ScrollArea } from "@/components/modal/scroll-area"
import { useExceptions } from "@/hooks/useExceptions"

const formSchema = z.object({
  phone: z.string().min(10, {
    message: "Le numéro de téléphone doit contenir au moins 10 chiffres.",
  }),
  fullName: z.string().min(2, {
    message: "Le nom complet doit contenir au moins 2 caractères.",
  }),
  email: z.string().email({
    message: "Veuillez entrer une adresse email valide.",
  }).optional(),
  projectType: z.string().optional(),
  budget: z.string().optional(),
  timeline: z.string().optional(),
})

export default function BookingInterface() {
  const [step, setStep] = React.useState(1)
  const [date, setDate] = React.useState<Date>()
  const [selectedTime, setSelectedTime] = React.useState<string | null>(null)
  const [availableSlots, setAvailableSlots] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(false)
  const { exceptions } = useExceptions()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      phone: "",
      fullName: "",
      email: "",
      projectType: "",
      budget: "",
      timeline: "",
    },
  })

  const handleSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      if (!selectedTime || !date) {
        throw new Error("Veuillez sélectionner une date et une heure")
      }

      const [hours, minutes] = selectedTime.split(':')
      const dateTime = new Date(date)
      dateTime.setHours(parseInt(hours), parseInt(minutes))

      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName: values.fullName,
          phone: values.phone,
          email: values.email,
          dateTime: dateTime.toISOString(),
          projectType: values.projectType,
          budget: values.budget,
          timeline: values.timeline,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Erreur lors de la création du rendez-vous")
      }

      // Rediriger vers la page de confirmation
      window.location.href = `/confirmation?date=${dateTime.toISOString()}`
    } catch (error) {
      console.error("Erreur:", error)
      // Afficher un message d'erreur à l'utilisateur
    }
  }

  // Charger les créneaux disponibles pour une date donnée
  const loadAvailableSlots = async (selectedDate: Date) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/appointments/available-slots?date=${selectedDate.toISOString()}`)
      if (!response.ok) throw new Error("Erreur lors du chargement des créneaux")
      const data = await response.json()
      setAvailableSlots(data.slots)
    } catch (error) {
      console.error("Erreur:", error)
    } finally {
      setLoading(false)
    }
  }

  // Mettre à jour les créneaux disponibles quand la date change
  React.useEffect(() => {
    if (date) {
      loadAvailableSlots(date)
    }
  }, [date])

  // Vérifier si une date est disponible
  const isDateAvailable = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    const exception = exceptions.find(ex => ex.date.toISOString().split('T')[0] === dateStr)
    return !exception || exception.isAvailable
  }

  function onSubmit(values: z.infer<typeof formSchema>) {
    setStep(2)
  }

  const handleTimeSelect = async (time: string) => {
    if (!date) return

    try {
      const response = await fetch(`/api/appointments/check-availability?date=${date.toISOString()}&time=${time}`)
      if (!response.ok) throw new Error("Erreur lors de la vérification de disponibilité")
      const data = await response.json()
      
      if (data.available) {
        setSelectedTime(time)
      }
    } catch (error) {
      console.error("Erreur:", error)
    }
  }

  return (
    <div className="flex flex-col w-full max-w-4xl mx-auto bg-black text-white rounded-lg overflow-hidden border border-neutral-800">
      {/* Header */}
      <div className="relative flex justify-center items-center py-4 px-6 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <div className="bg-yellow-400 w-10 h-10 flex items-center justify-center rounded-md">
            <span className="text-black font-bold text-xl">↑</span>
          </div>
          <span className="text-white font-bold text-xl">Cleads</span>
        </div>
        <button className="absolute right-4 p-1 hover:bg-neutral-800 rounded-md">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="flex items-center justify-center gap-4 py-3 px-6 bg-black">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-yellow-400 flex items-center justify-center">
            <span className="text-black text-xs">✓</span>
          </div>
          <span className="text-white text-sm">Remplir le formulaire</span>
        </div>
        <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${step === 2 ? "text-yellow-400" : "text-neutral-400"}`}>
            Réservez votre événement
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 md:grid-cols-3 h-[600px]">
        {/* Left panel - Form/Details */}
        <div className="p-6 border-r border-neutral-800">
          <h2 className="text-2xl font-bold mb-4">Appel stratégique - Votre landing page</h2>

          {step === 1 ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Numéro de téléphone</FormLabel>
                      <FormControl>
                        <div className="flex">
                          <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-neutral-700 bg-neutral-800 text-neutral-400">
                            +33
                          </span>
                          <Input placeholder="6 12 34 56 78" className="rounded-l-none" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nom complet</FormLabel>
                      <FormControl>
                        <Input placeholder="Jean Dupont" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email (optionnel)</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="jean@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full bg-yellow-400 text-black hover:bg-yellow-500">
                  Continuer
                </Button>
              </form>
            </Form>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5" />
                <span>30 minutes</span>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <div className="w-5 h-5 relative">
                  <Image src="/google-meet.webp" alt="Google Meet" width={20} height={20} />
                </div>
                <span>Google Meet</span>
              </div>

              <p className="text-sm mb-4">
                L&apos;entretien stratégique se déroule sur Google Meet. Nous allons confirmer sur WhatsApp juste avant
                le créneau sélectionné.
              </p>

              <div className="text-sm mb-4">
                <p className="font-bold mb-1">ATTENTION :</p>
                <p>
                  si tu n&apos;es pas présent au rendez-vous, sans prévenir, il te sera impossible de reprendre un
                  rendez-vous.
                </p>
              </div>

              <Button 
                onClick={form.handleSubmit(handleSubmit)}
                className="w-full bg-yellow-400 text-black hover:bg-yellow-500"
              >
                Confirmer le rendez-vous
              </Button>
            </>
          )}
        </div>

        {/* Right panel - Calendar and Time slots */}
        <div className="col-span-2 grid grid-cols-1 md:grid-cols-2 h-full">
          {step === 1 ? (
            <div className="col-span-2 flex items-center justify-center h-full text-center px-8">
              <p className="text-neutral-400">Merci de remplir le formulaire avant de choisir votre créneau horaire.</p>
            </div>
          ) : (
            <>
              {/* Calendar */}
              <div className="p-6 border-r border-neutral-800">
                <h3 className="text-lg font-medium mb-6">Sélectionnez la date</h3>
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  locale={fr}
                  className="rounded-md border border-neutral-700"
                  disabled={(date) => !isDateAvailable(date)}
                  classNames={{
                    months: "space-y-4",
                    month: "space-y-4",
                    caption: "flex justify-center pt-1 relative items-center",
                    caption_label: "text-sm font-medium",
                    nav: "space-x-1 flex items-center",
                    nav_button: "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
                    nav_button_previous: "absolute left-1",
                    nav_button_next: "absolute right-1",
                    table: "w-full border-collapse space-y-1",
                    head_row: "flex",
                    head_cell: "text-neutral-400 rounded-md w-8 font-normal text-[0.8rem]",
                    row: "flex w-full mt-2",
                    cell: "text-center text-sm p-0 relative [&:has([aria-selected])]:bg-neutral-800 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                    day: "h-8 w-8 p-0 font-normal aria-selected:opacity-100",
                    day_selected: "bg-yellow-400 text-black hover:bg-yellow-500 hover:text-black focus:bg-yellow-500 focus:text-black",
                    day_today: "bg-neutral-800 text-white",
                    day_outside: "text-neutral-400 opacity-50",
                    day_disabled: "text-neutral-400 opacity-50",
                    day_range_middle: "aria-selected:bg-neutral-800 aria-selected:text-white",
                    day_hidden: "invisible",
                  }}
                  components={{
                    IconLeft: () => <ChevronLeft className="h-4 w-4" />,
                    IconRight: () => <ChevronRight className="h-4 w-4" />,
                  }}
                />
              </div>

              {/* Time slots */}
              <div className="p-6 flex flex-col h-full">
                <h3 className="text-lg font-medium mb-6">Horaires disponibles</h3>
                <ScrollArea className="flex-1 w-full" style={{ maxHeight: "calc(100vh - 200px)" }}>
                  <div className="pr-4 space-y-2">
                    {loading ? (
                      <div className="text-center py-4">Chargement des créneaux...</div>
                    ) : (
                      availableSlots.map((time) => (
                        <button
                          key={time}
                          onClick={() => handleTimeSelect(time)}
                          className={`w-full bg-transparent border ${
                            selectedTime === time
                              ? "border-yellow-400 bg-yellow-400/10"
                              : "border-neutral-700"
                          } rounded-md py-3 px-4 text-center hover:bg-neutral-800 transition-colors`}
                        >
                          {time}
                        </button>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="py-3 px-6 border-t border-neutral-800 flex items-center justify-center">
        <span className="text-sm text-neutral-400">Powered by</span>
        <span className="ml-2 font-bold">✓ iClosed</span>
        <svg className="w-4 h-4 ml-1" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M7 17L17 7M17 7H7M17 7V17"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  )
}

