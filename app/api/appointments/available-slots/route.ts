import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { parseISO, format, addMinutes, isBefore, isAfter, startOfDay, endOfDay } from "date-fns"
import { convertToUTC, convertFromUTC } from "@/lib/date-utils"
import { headers } from "next/headers"

const SLOT_DURATION = 30 // minutes

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    console.log("=== DÉBUT available-slots ===")
    const url = new URL(req.url)
    const date = url.searchParams.get("date")
    const timezone = url.searchParams.get("timezone") || "Europe/Paris"

    if (!date) {
      console.log("Erreur: date manquante")
      return NextResponse.json(
        { error: "Le parametre date est requis" },
        { status: 400 }
      )
    }

    console.log("Date reçue:", date)
    console.log("Fuseau horaire reçu:", timezone)
    
    // La date reçue est en UTC, on la convertit en date locale
    const selectedDate = parseISO(date)
    
    // Créer une date locale en tenant compte du fuseau horaire spécifié
    const localDate = new Date(selectedDate.getTime())
    console.log("Date locale brute:", localDate.toISOString())
    
    // Ajuster la date en fonction du fuseau horaire
    const adjustedDate = new Date(localDate.getTime())
    console.log("Date ajustée:", adjustedDate.toISOString())
    
    const now = new Date()
    console.log("Date actuelle:", now.toISOString())
    
    // Si la date est passée, retourner un tableau vide
    if (isBefore(startOfDay(adjustedDate), startOfDay(now))) {
      console.log("Date passée, aucun créneau disponible")
      return NextResponse.json({ slots: [] })
    }

    const dayOfWeek = adjustedDate.getDay()
    console.log("Jour de la semaine:", dayOfWeek)

    // Récupérer les disponibilités pour ce jour
    const availability = await prisma.availability.findFirst({
      where: {
        dayOfWeek,
        isActive: true
      }
    })

    console.log("Disponibilité trouvée:", availability)

    if (!availability) {
      console.log("Aucune disponibilité trouvée pour ce jour")
      return NextResponse.json({ slots: [] })
    }

    // Récupérer la pause déjeuner
    const breakTime = await prisma.breakTime.findFirst({
      where: {
        isActive: true
      }
    })
    console.log("Pause déjeuner:", breakTime)

    // Récupérer les exceptions pour cette date
    const exception = await prisma.exception.findFirst({
      where: {
        date: {
          gte: startOfDay(adjustedDate),
          lt: endOfDay(adjustedDate),
        }
      },
    })
    console.log("Exception trouvée:", exception)

    // Si c'est un jour non disponible, retourner un tableau vide
    if (exception && !exception.isAvailable) {
      console.log("Jour non disponible à cause d'une exception")
      return NextResponse.json({ slots: [] })
    }

    // Générer les créneaux disponibles
    const slots: string[] = []
    let startTime = new Date(adjustedDate)
    startTime.setHours(parseInt(availability.startTime.split(':')[0]))
    startTime.setMinutes(parseInt(availability.startTime.split(':')[1]))
    
    console.log("Heure de début configurée:", startTime.toISOString())
    
    // Si la date est aujourd'hui et l'heure de début est passée,
    // utiliser l'heure actuelle arrondie au prochain créneau de 30 minutes
    if (
      startOfDay(adjustedDate).getTime() === startOfDay(now).getTime() &&
      isBefore(startTime, now)
    ) {
      const minutes = now.getMinutes()
      const roundedMinutes = Math.ceil(minutes / SLOT_DURATION) * SLOT_DURATION
      startTime = new Date(now)
      startTime.setMinutes(roundedMinutes, 0, 0)
      console.log("Heure de début ajustée (aujourd'hui):", startTime.toISOString())
    }
    
    const endTime = new Date(adjustedDate)
    endTime.setHours(parseInt(availability.endTime.split(':')[0]))
    endTime.setMinutes(parseInt(availability.endTime.split(':')[1]))
    
    console.log("Heure de fin configurée:", endTime.toISOString())
    
    let currentTime = startTime

    console.log("Génération des créneaux de", startTime.toISOString(), "à", endTime.toISOString())

    // Récupérer les rendez-vous existants pour cette date
    const existingAppointments = await prisma.appointment.findMany({
      where: {
        date: {
          gte: startOfDay(adjustedDate),
          lt: endOfDay(adjustedDate),
        },
      },
      select: {
        date: true,
      },
    })

    console.log("Rendez-vous existants:", existingAppointments.map(apt => apt.date.toISOString()))

    // Convertir les rendez-vous existants en heures locales en tenant compte du fuseau horaire
    const existingTimes = existingAppointments.map(apt => {
      const localAppointmentDate = convertFromUTC(new Date(apt.date))
      // Ajuster l'heure en fonction du fuseau horaire
      const adjustedHour = localAppointmentDate.getHours()
      return `${String(adjustedHour).padStart(2, '0')}:${String(localAppointmentDate.getMinutes()).padStart(2, '0')}`
    })

    console.log("Heures locales des rendez-vous:", existingTimes)

    while (isBefore(currentTime, endTime)) {
      // Ne pas ajouter les créneaux passés pour aujourd'hui
      if (
        startOfDay(adjustedDate).getTime() === startOfDay(now).getTime() &&
        isBefore(currentTime, now)
      ) {
        currentTime = addMinutes(currentTime, SLOT_DURATION)
        continue
      }

      // Vérifier si le créneau est pendant la pause déjeuner
      if (breakTime && breakTime.isActive) {
        const breakStart = new Date(adjustedDate)
        breakStart.setHours(parseInt(breakTime.startTime.split(':')[0]))
        breakStart.setMinutes(parseInt(breakTime.startTime.split(':')[1]))
        
        const breakEnd = new Date(adjustedDate)
        breakEnd.setHours(parseInt(breakTime.endTime.split(':')[0]))
        breakEnd.setMinutes(parseInt(breakTime.endTime.split(':')[1]))
        
        if (isBefore(currentTime, breakEnd) && isAfter(addMinutes(currentTime, SLOT_DURATION), breakStart)) {
          currentTime = breakEnd
          continue
        }
      }

      // Vérifier si un rendez-vous existe déjà pour ce créneau
      const currentTimeStr = format(currentTime, "HH:mm")
      const hasExistingAppointment = existingTimes.includes(currentTimeStr)

      if (!hasExistingAppointment) {
        slots.push(currentTimeStr)
      }

      currentTime = addMinutes(currentTime, SLOT_DURATION)
    }

    console.log("Créneaux générés:", slots)
    console.log("=== FIN available-slots ===")
    return NextResponse.json({ slots })
  } catch (error) {
    console.error("Erreur lors de la recuperation des creneaux:", error)
    return NextResponse.json(
      { error: "Erreur lors de la recuperation des creneaux" },
      { status: 500 }
    )
  }
}