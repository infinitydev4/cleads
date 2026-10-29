"use client"

import * as React from "react"
import { Calendar } from "@/components/ui/calendar"
import { ChevronLeft, ChevronRight, Clock, CheckCircle, Globe } from "lucide-react"
import Image from "next/image"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/modal/form"
import { Input } from "@/components/ui/input"
import { Phone } from "lucide-react"
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { fr } from "date-fns/locale"
import { ScrollArea } from "@/components/modal/scroll-area"
import { useConversionTracking } from "@/hooks/useConversionTracking"
import { TrackedButton } from "@/components/tracking/TrackedButton"
import { GTM_TRIGGERS } from "@/components/analytics/GoogleTagManager"
import { BookingNotification } from "@/components/notifications/booking-notification"
import { PhoneInput } from "@/components/ui/phone-input"
import { useExceptions } from "@/hooks/useExceptions"
import { toast } from "sonner"
import TimezoneSelect from 'react-timezone-select'
import { convertToUTC, convertFromUTC, formatAppointmentDate } from "@/lib/date-utils"

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

export function BookingDialog() {
  const { trackConversion } = useConversionTracking()
  const [step, setStep] = React.useState(1)
  const [date, setDate] = React.useState<Date>(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today
  })
  const [selectedTime, setSelectedTime] = React.useState<string | null>(null)
  const [selectedDateTime, setSelectedDateTime] = React.useState<Date | null>(null)
  const [isOpen, setIsOpen] = React.useState(false)
  const [showQuestions, setShowQuestions] = React.useState(false)
  const [availableSlots, setAvailableSlots] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(false)
  const { exceptions } = useExceptions()
  const [selectedTimezone, setSelectedTimezone] = React.useState(() => {
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const offset = new Date().getTimezoneOffset() / -60
    return {
      value: userTimezone,
      label: userTimezone,
      offset: offset
    }
  })

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

  // Fonction pour désactiver les dates passées
  const disabledDays = React.useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return [
      { before: today }
    ]
  }, [])

  // Charger les créneaux disponibles pour une date donnée
  const loadAvailableSlots = async (selectedDate: Date) => {
    setLoading(true)
    try {
      console.log("=== DÉBUT loadAvailableSlots ===")
      console.log("Date sélectionnée (brute):", selectedDate)
      console.log("Fuseau horaire sélectionné:", selectedTimezone)
      
      // Créer une date UTC simple
      const utcDate = new Date(Date.UTC(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
        0, 0, 0
      ))
      
      console.log("Date UTC:", utcDate.toISOString())
      
      const response = await fetch(`/api/appointments/available-slots?date=${utcDate.toISOString()}&timezone=${selectedTimezone.value}`)
      const data = await response.json()

      if (data.error) {
        // Si l'erreur indique que l'utilisateur a déjà un rendez-vous
        if (data.error.includes("Vous avez déjà un rendez-vous")) {
          toast.error(data.error, {
            duration: 5000,
            description: "Consultez vos emails pour plus de détails sur votre rendez-vous existant."
          })
          setAvailableSlots([])
        } else {
          throw new Error(data.error)
        }
      } else {
        console.log("Créneaux reçus:", data.slots)
        setAvailableSlots(data.slots)
      }
    } catch (error) {
      console.error("Erreur lors du chargement des créneaux:", error)
      toast.error("Erreur lors du chargement des créneaux", {
        description: "Veuillez réessayer plus tard ou nous contacter directement."
      })
      setAvailableSlots([])
    } finally {
      setLoading(false)
      console.log("=== FIN loadAvailableSlots ===")
    }
  }

  // Un seul useEffect pour gérer le chargement des créneaux
  React.useEffect(() => {
    if (date) {
      console.log("Date sélectionnée changée:", date.toISOString())
      loadAvailableSlots(date)
    }
  }, [date])

  // Vérifier si une date est disponible
  const isDateAvailable = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    const exception = exceptions.find(ex => ex.date.toISOString().split('T')[0] === dateStr)
    return !exception || exception.isAvailable
  }

  const handleTimeSelect = async (time: string) => {
    if (!date) return

    try {
      console.log("=== DÉBUT handleTimeSelect ===")
      console.log("Date sélectionnée:", date.toISOString())
      console.log("Heure sélectionnée:", time)
      console.log("Fuseau horaire:", selectedTimezone)

      // Créer la date complète dans le fuseau horaire local
      const [hours, minutes] = time.split(':')
      const dateTime = new Date(date)
      dateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0)

      // Convertir en UTC en tenant compte du fuseau horaire
      const utcDate = new Date(Date.UTC(
        dateTime.getFullYear(),
        dateTime.getMonth(),
        dateTime.getDate(),
        dateTime.getHours() - selectedTimezone.offset,
        dateTime.getMinutes(),
        0
      ))
      
      console.log("Date locale:", dateTime.toISOString())
      console.log("Date UTC:", utcDate.toISOString())

      const response = await fetch(`/api/appointments/check-availability?date=${utcDate.toISOString()}&time=${time}`)
      const data = await response.json()
      
      console.log("Réponse de disponibilité:", data)

      if (data.available) {
        setSelectedTime(time)
        setSelectedDateTime(dateTime)
      } else {
        if (data.error) {
          // Si l'erreur indique que l'utilisateur a déjà un rendez-vous
          if (data.error.includes("Vous avez déjà un rendez-vous")) {
            toast.error(data.error, {
              duration: 5000,
              description: "Consultez vos emails pour plus de détails sur votre rendez-vous existant."
            })
            // Désactiver tous les créneaux
            setAvailableSlots([])
          } else {
            // Pour les autres types d'erreurs
            setAvailableSlots(prevSlots => prevSlots.filter(slot => slot !== time))
            toast.error("Ce créneau n'est plus disponible")
          }
        } else {
          setAvailableSlots(prevSlots => prevSlots.filter(slot => slot !== time))
          toast.error("Ce créneau n'est plus disponible")
        }
      }
    } catch (error) {
      console.error("Erreur:", error)
      toast.error("Erreur lors de la vérification de disponibilité", {
        description: "Veuillez réessayer plus tard ou nous contacter directement."
      })
    }
  }

  function onSubmit(values: z.infer<typeof formSchema>) {
    setStep(2)
  }

  const handleBookingSubmit = async (data: z.infer<typeof formSchema>) => {
    setLoading(true)
    try {
      if (!date || !selectedTime) {
        toast.error("Veuillez sélectionner une date et une heure")
        return
      }

      // Créer la date complète dans le fuseau horaire local
      const [hours, minutes] = selectedTime.split(":")
      const appointmentDate = new Date(date)
      appointmentDate.setHours(parseInt(hours), parseInt(minutes), 0, 0)

      // Convertir en UTC en tenant compte du fuseau horaire
      const utcDate = new Date(Date.UTC(
        appointmentDate.getFullYear(),
        appointmentDate.getMonth(),
        appointmentDate.getDate(),
        appointmentDate.getHours() - selectedTimezone.offset,
        appointmentDate.getMinutes(),
        0
      ))

      console.log("Date locale:", appointmentDate.toISOString())
      console.log("Date UTC:", utcDate.toISOString())
      console.log("Fuseau horaire:", selectedTimezone)

      // Créer le rendez-vous
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientName: data.fullName,
          email: data.email,
          phone: data.phone,
          date: utcDate.toISOString(),
          type: "LANDING_PAGE",
          notes: `Type de projet: ${data.projectType || 'Non spécifié'}\nBudget: ${data.budget || 'Non spécifié'}\nDélai: ${data.timeline || 'Non spécifié'}`,
        }),
      })

      const responseData = await response.json()

      if (!response.ok) {
        // Si l'erreur indique que l'utilisateur a déjà un rendez-vous
        if (responseData.error?.includes("Vous avez déjà un rendez-vous")) {
          toast.error(responseData.error, {
            duration: 5000,
            description: "Consultez vos emails pour plus de détails sur votre rendez-vous existant."
          })
          setStep(1) // Retour à l'étape 1
          return
        } else {
          throw new Error(responseData.error || "Erreur lors de la création du rendez-vous")
        }
      }

      // Envoyer l'email de confirmation
      const confirmationResponse = await fetch(`/api/appointments/${responseData.id}/send`, {
        method: "POST",
      })

      if (!confirmationResponse.ok) {
        console.error("Erreur lors de l'envoi de l'email de confirmation")
        toast.warning("Le rendez-vous a été créé mais l'email de confirmation n'a pas pu être envoyé", {
          description: "Vous recevrez bientôt un email de notre part avec les détails du rendez-vous."
        })
      }

      // Tracker la conversion
      trackConversion({
        event: GTM_TRIGGERS.APPOINTMENT_BOOKED,
        action: "book",
        category: "Appointment",
        label: "landing_page",
        additionalParams: {
          appointmentId: responseData.id,
          appointmentDate: appointmentDate.toISOString(),
          appointmentType: "LANDING_PAGE",
        }
      })

      toast.success("Rendez-vous créé avec succès", {
        description: "Vous allez recevoir un email de confirmation avec les détails du rendez-vous."
      })
      setStep(3)
    } catch (error) {
      console.error("Erreur:", error)
      toast.error("Erreur lors de la création du rendez-vous", {
        description: "Veuillez réessayer plus tard ou nous contacter directement."
      })
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmation = (time: string) => {
    if (date) {
      const [hours, minutes] = time.split(':')
      const dateTime = new Date(date)
      dateTime.setHours(parseInt(hours), parseInt(minutes))
      setSelectedDateTime(dateTime)
      setStep(3)
    }
  }

  const getCalendarUrls = () => {
    if (!selectedDateTime) return null
    
    const event = {
      title: "Appel Stratégique - Cleads",
      description: "Consultation stratégique pour votre landing page",
      location: "Google Meet (lien envoyé par email)",
      startTime: selectedDateTime,
      endTime: new Date(selectedDateTime.getTime() + 30 * 60000),
    }
    
    const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&details=${encodeURIComponent(event.description)}&location=${encodeURIComponent(event.location)}&dates=${event.startTime.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/g, '')}/${event.endTime.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/g, '')}`
    
    const outlookUrl = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(event.title)}&body=${encodeURIComponent(event.description)}&location=${encodeURIComponent(event.location)}&startdt=${event.startTime.toISOString()}&enddt=${event.endTime.toISOString()}`
    
    return { googleUrl, outlookUrl }
  }

  // Track modal open/close
  const handleOpenChange = (open: boolean) => {
    trackConversion({
      event: open ? GTM_TRIGGERS.MODAL_OPEN : GTM_TRIGGERS.MODAL_CLOSE,
      action: open ? "open" : "close",
      category: "Modal",
      label: "booking_dialog",
      additionalParams: {
        location: "header",
        page: window.location.pathname
      }
    })
    setIsOpen(open)
  }

  React.useEffect(() => {
    if (step > 1) {
      trackConversion({
        event: GTM_TRIGGERS.APPOINTMENT_STEP,
        action: "progress",
        category: "Appointment",
        label: `step_${step}`,
        additionalParams: {
          currentStep: step,
          totalSteps: 3
        }
      })
    }
  }, [step])

  const handleError = (error: Error) => {
    trackConversion({
      event: GTM_TRIGGERS.APPOINTMENT_ERROR,
      action: "error",
      category: "Appointment",
      label: error.message,
      additionalParams: {
        step,
        formData: form.getValues()
      }
    })
  }

  // Vérifier si les informations de contact sont remplies
  React.useEffect(() => {
    const values = form.getValues()
    if (values.phone && values.phone.length >= 10 && values.fullName && values.fullName.length >= 2) {
      setShowQuestions(true)
    }
  }, [form.watch('phone'), form.watch('fullName')])

  const handleTimezoneChange = (timezone: any) => {
    setSelectedTimezone({
      value: timezone.value,
      label: timezone.label,
      offset: timezone.offset || 0
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange} >
      <DialogTrigger asChild>
        <TrackedButton
          trackingName="open_booking"
          location="header"
          icon={<Phone className="h-4 w-4 sm:h-5 sm:w-5" />}
          className="mt-8"
        >
          Réserver un appel gratuit
        </TrackedButton>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[850px] bg-black text-white p-0 md:p-6 h-[90vh] md:h-auto overflow-y-auto">
        <DialogHeader className="px-4 md:px-0 pt-4 md:pt-0">
          <DialogTitle className="text-center flex justify-center items-center">
            <Image
              src="/logo-white.svg"
              alt="cleads-logo"
              width={150}
              height={40}
              className="mb-2"
              priority
            />
          </DialogTitle>
          <div className="mt-4 md:mt-8 mb-4 md:mb-6">
            <div className="flex items-center justify-center gap-4 md:gap-8">
              <div className="flex flex-col items-center">
                <div className={`w-12 h-12 rounded-full border-2 ${
                  step === 1 
                  ? "border-[#BFFF00] bg-[#BFFF00]/10" 
                  : "border-neutral-700 bg-black"
                } flex items-center justify-center mb-3`}>
                  <span className={`text-lg font-bold ${
                    step === 1 ? "text-[#BFFF00]" : "text-neutral-700"
                  }`}>1</span>
                </div>
                <span className={`text-sm ${
                  step === 1 ? "text-[#BFFF00]" : "text-neutral-400"
                }`}>Informations</span>
              </div>
              
              <div className="flex-1 h-[2px] bg-neutral-700 relative top-[-15px]">
                <div className={`h-full bg-[#BFFF00] transition-all duration-300 ${
                  step >= 2 ? "w-full" : "w-0"
                }`} />
              </div>
              
              <div className="flex flex-col items-center">
                <div className={`w-12 h-12 rounded-full border-2 ${
                  step === 2 
                  ? "border-[#BFFF00] bg-[#BFFF00]/10" 
                  : "border-neutral-700 bg-black"
                } flex items-center justify-center mb-3`}>
                  <span className={`text-lg font-bold ${
                    step === 2 ? "text-[#BFFF00]" : "text-neutral-700"
                  }`}>2</span>
                </div>
                <span className={`text-sm ${
                  step === 2 ? "text-[#BFFF00]" : "text-neutral-400"
                }`}>Réservation</span>
              </div>

              <div className="flex-1 h-[2px] bg-neutral-700 relative top-[-15px]">
                <div className={`h-full bg-[#BFFF00] transition-all duration-300 ${
                  step === 3 ? "w-full" : "w-0"
                }`} />
              </div>
              
              <div className="flex flex-col items-center">
                <div className={`w-12 h-12 rounded-full border-2 ${
                  step === 3 
                  ? "border-[#BFFF00] bg-[#BFFF00]/10" 
                  : "border-neutral-700 bg-black"
                } flex items-center justify-center mb-3`}>
                  <span className={`text-lg font-bold ${
                    step === 3 ? "text-[#BFFF00]" : "text-neutral-700"
                  }`}>3</span>
                </div>
                <span className={`text-sm ${
                  step === 3 ? "text-[#BFFF00]" : "text-neutral-400"
                }`}>Confirmation</span>
              </div>
            </div>
          </div>
          <DialogDescription className="text-center mt-2 md:mt-4 px-4">
            Remplissez le formulaire et choisissez un créneau pour planifier un appel avec notre équipe.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col w-full bg-black text-white overflow-hidden border border-neutral-800 md:rounded-lg mt-4 md:mt-0">
          {step === 1 ? (
            <div className="grid grid-cols-1 md:grid-cols-[55%_45%] min-h-[500px] md:min-h-[600px] max-md:h-[calc(90vh-200px)]">
              <div className="p-4 md:p-6 border-r border-neutral-800 overflow-y-auto">
                <h2 className="text-xl font-bold mb-4 whitespace-nowrap overflow-hidden text-ellipsis">
                  Convertissez vos visiteurs en clients !
                </h2>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    {form.formState.errors.root && (
                      <div className="text-red-500 text-sm">
                        {form.formState.errors.root.message}
                      </div>
                    )}
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <PhoneInput 
                              label="Téléphone"
                              value={field.value}
                              onChange={field.onChange}
                              onCountryChange={(country) => {
                                console.log('Selected country:', country)
                              }}
                            />
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
                          <FormControl>
                            <Input 
                              label="Nom complet"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {form.watch('phone') && form.watch('phone').length >= 10 && form.watch('fullName') && form.watch('fullName').length >= 2 && (
                      <>
                        <FormField
                          control={form.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input 
                                  label="Email"
                                  type="email"
                                  placeholder="jean@example.com"
                                  {...field} 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="projectType"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <select
                                  {...field}
                                  className="w-full bg-gray-950 border border-gray-800 rounded-md px-3 py-2 text-white"
                                >
                                  <option value="">Type de projet</option>
                                  <option value="landing_page">Landing Page</option>
                                  <option value="e_commerce">E-commerce</option>
                                  <option value="application_web">Application Web</option>
                                  <option value="other">Autre</option>
                                </select>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="budget"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <select
                                  {...field}
                                  className="w-full bg-gray-950 border border-gray-800 rounded-md px-3 py-2 text-white"
                                >
                                  <option value="">Budget</option>
                                  <option value="1000-3000">1 000€ - 3 000€</option>
                                  <option value="3000-5000">3 000€ - 5 000€</option>
                                  <option value="5000-10000">5 000€ - 10 000€</option>
                                  <option value="10000+">10 000€ et plus</option>
                                </select>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="timeline"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <select
                                  {...field}
                                  className="w-full bg-gray-950 border border-gray-800 rounded-md px-3 py-2 text-white"
                                >
                                  <option value="">Délai souhaité</option>
                                  <option value="1-2_months">1-2 mois</option>
                                  <option value="2-3_months">2-3 mois</option>
                                  <option value="3-6_months">3-6 mois</option>
                                  <option value="6+_months">6 mois et plus</option>
                                </select>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    )}

                    <TrackedButton
                      type="submit"
                      trackingName="submit_booking"
                      location="booking_modal"
                      icon={<Phone className="h-4 w-4" />}
                      className="w-full mt-4"
                      onClick={() => form.handleSubmit(handleBookingSubmit)()}
                    >
                      Confirmer le rendez-vous
                    </TrackedButton>
                  </form>
                </Form>
              </div>
              <div className="hidden md:flex items-center justify-center p-4 md:p-6 pb-20 md:pb-56">
                <div className="text-center">
                  <Image
                    src="/team-cleads.svg"
                    alt="Illustration"
                    width={250}
                    height={250}
                    className="mb-4 mx-auto"
                  />
                  <p className="text-neutral-400 text-sm">
                    Merci de remplir le formulaire avant de choisir votre créneau horaire.
                  </p>
                </div>
              </div>
            </div>
          ) : step === 2 ? (
            <div className="flex flex-col md:grid md:grid-cols-12 min-h-[500px] md:min-h-[600px] max-md:h-[calc(90vh-200px)]">
              <div className="hidden md:block p-2 border-r border-neutral-800 md:col-span-2">
                <div className="space-y-4 md:space-y-4">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full 
                      bg-[#BFFF00]/10 border border-[#BFFF00]/20">
                      <Clock className="w-3.5 h-3.5 text-[#BFFF00]" />
                      <span className="text-xs font-medium text-[#BFFF00]">30 minutes</span>
                  </div>
                  <div className="flex items-center gap-2 md:mt-0">
                    <Image src="/google-meet.webp" alt="Google Meet" width={20} height={20} />
                    <span className="text-xs">Google Meet</span>
                  </div>
                </div>
              </div>
              <div className="md:col-span-6 p-4 border-b md:border-b-0 md:border-r border-neutral-800 overflow-y-auto">
                <h3 className="text-sm text-center font-medium mb-4">Sélectionnez la date</h3>
                <Calendar
                  mode="single"
                  selected={date}
                  defaultMonth={date}
                  initialFocus
                  onSelect={(value) => {
                    if (value) {
                      const newDate = new Date(value)
                      newDate.setHours(0, 0, 0, 0)
                      setDate(newDate)
                    }
                  }}
                  disabled={disabledDays}
                  locale={fr}
                  className="w-full flex-1 max-w-full sm:max-w-[400px] mx-auto"
                  classNames={{
                    months: "space-y-4",
                    month: "w-full space-y-4",
                    caption: "flex justify-center pt-1 relative items-center",
                    caption_label: "text-sm font-medium",
                    nav: "space-x-1 flex items-center",
                    nav_button: "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
                    nav_button_previous: "absolute left-1",
                    nav_button_next: "absolute right-1",
                    table: "w-full border-collapse space-y-1 flex-1",
                    head_row: "flex w-full justify-between",
                    head_cell: "text-neutral-400 rounded-md flex-1 font-normal text-[0.8rem]",
                    row: "flex w-full mt-2 justify-between",
                    cell: "flex-1 text-center text-sm p-0 relative [&:has([aria-selected])]:bg-neutral-800 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                    day: "w-full h-8 sm:h-12 p-0 font-normal aria-selected:opacity-100 text-xs sm:text-sm",
                    day_selected: "bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90 hover:text-black focus:bg-[#BFFF00]/90 focus:text-black rounded-md",
                    day_today: "bg-neutral-800 text-white rounded-md",
                    day_outside: "text-neutral-400 opacity-50",
                    day_disabled: "text-neutral-400 opacity-50 cursor-not-allowed",
                    day_range_middle: "aria-selected:bg-neutral-800 aria-selected:text-white",
                    day_hidden: "invisible",
                  }}
                  components={{
                    IconLeft: () => <ChevronLeft className="h-4 w-4" />,
                    IconRight: () => <ChevronRight className="h-4 w-4" />,
                  }}
                />
                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Globe className="w-4 h-4 text-neutral-400" />
                    <span className="text-sm text-neutral-400">Fuseau horaire</span>
                  </div>
                  <TimezoneSelect
                    value={selectedTimezone}
                    onChange={handleTimezoneChange}
                    className="w-full bg-gray-950 border border-gray-800 rounded-md"
                    styles={{
                      control: (base) => ({
                        ...base,
                        backgroundColor: 'rgb(9, 9, 11)',
                        borderColor: 'rgb(38, 38, 38)',
                        color: 'white',
                        '&:hover': {
                          borderColor: 'rgb(64, 64, 64)',
                        },
                      }),
                      menu: (base) => ({
                        ...base,
                        backgroundColor: 'rgb(9, 9, 11)',
                        borderColor: 'rgb(38, 38, 38)',
                      }),
                      option: (base, state) => ({
                        ...base,
                        backgroundColor: state.isFocused ? 'rgb(38, 38, 38)' : 'transparent',
                        color: 'white',
                        '&:hover': {
                          backgroundColor: 'rgb(38, 38, 38)',
                        },
                      }),
                      singleValue: (base) => ({
                        ...base,
                        color: 'white',
                      }),
                    }}
                  />
                </div>
              </div>
              <div className="md:col-span-4 p-4 overflow-y-auto">
                <h3 className="text-sm text-center font-medium mb-4">Horaires disponibles</h3>
                <ScrollArea className="h-[200px] md:h-[500px] pr-4">
                  <div className="space-y-2 pl-2">
                    {loading ? (
                      <div className="text-center py-4">Chargement des créneaux...</div>
                    ) : availableSlots.length === 0 ? (
                      <div className="text-center py-8 px-4">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-neutral-800/50 mb-4">
                          <Clock className="w-6 h-6 text-neutral-400" />
                        </div>
                        <p className="text-neutral-400 text-sm">
                          Aucun créneau disponible pour cette date.
                          <br />
                          Veuillez sélectionner une autre date.
                        </p>
                      </div>
                    ) : (
                      availableSlots.map((time) => (
                        <div key={time} className="flex items-center gap-2">
                          <button
                            onClick={() => handleTimeSelect(time)}
                            className={`flex-1 bg-transparent border ${
                              selectedTime === time 
                              ? "border-[#BFFF00] bg-[#BFFF00]/10" 
                              : "border-neutral-700"
                            } rounded-md py-4 md:py-3 px-4 text-center hover:bg-[#BFFF00]/10 
                            hover:border-[#BFFF00] transition-colors text-base md:text-sm`}
                          >
                            {time}
                          </button>
                          {selectedTime === time && (
                            <button
                              onClick={() => form.handleSubmit(handleBookingSubmit)()}
                              className="bg-[#BFFF00] text-black px-4 py-4 md:py-3 rounded-md font-medium 
                              animate-[slideIn_0.2s_ease-out] hover:bg-[#BFFF00]/90"
                            >
                              Confirmer
                            </button>
                          )}
                        </div>
                      ))
                    )}
                    <div className="h-20 md:h-0" />
                  </div>
                </ScrollArea>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-4 md:p-6 min-h-[500px] md:min-h-[600px] max-md:h-[calc(90vh-200px)] overflow-y-auto">
              <div className="w-16 h-16 rounded-full bg-[#BFFF00]/20 flex items-center justify-center mb-6">
                <CheckCircle className="w-8 h-8 text-[#BFFF00]" />
              </div>
              
              <h3 className="text-2xl font-bold mb-2">Rendez-vous confirmé !</h3>
              <p className="text-neutral-400 text-center mb-8 max-w-md">
                Votre rendez-vous est programmé pour le{' '}
                <span className="text-white">
                  {selectedDateTime && formatAppointmentDate(convertFromUTC(selectedDateTime))}
                </span>
              </p>
              
              <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                {getCalendarUrls() && (
                  <>
                    <a
                      href={getCalendarUrls()?.googleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 
                        border border-white/10 rounded-lg transition-colors"
                    >
                      <Image src="/gagenda.webp" alt="Google Calendar" width={20} height={20} />
                      <span className="text-sm">Google Calendar</span>
                    </a>
                    <a
                      href={getCalendarUrls()?.outlookUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 
                        border border-white/10 rounded-lg transition-colors"
                    >
                      <Image src="/outlook.png" alt="Outlook" width={20} height={20} />
                      <span className="text-sm">Outlook</span>
                    </a>
                  </>
                )}
              </div>
              
              <p className="text-sm text-neutral-400 mt-8 text-center">
                Un email de confirmation avec le lien Google Meet vous a été envoyé.
                <br />
                Vous recevrez également un rappel WhatsApp 1h avant le rendez-vous.
              </p>
            </div>
          )}
        </div>
        
        {/* <BookingNotification isOpen={isOpen} /> */}
      </DialogContent>
    </Dialog>
  )
} 

