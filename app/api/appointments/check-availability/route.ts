import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { parseISO, format, addMinutes, startOfDay, endOfDay } from "date-fns"
import { convertToUTC } from "@/lib/date-utils"
import { headers } from "next/headers"

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    console.log("=== DÉBUT check-availability ===")
    const url = new URL(req.url)
    const date = url.searchParams.get("date")
    const time = url.searchParams.get("time")

    // Récupérer l'IP de l'utilisateur
    const headersList = await headers()
    const ip = headersList.get('x-forwarded-for') || 'unknown'

    if (!date || !time) {
      console.log("Erreur: date ou time manquant")
      return NextResponse.json(
        { error: "Les parametres date et time sont requis" },
        { status: 400 }
      )
    }

    console.log("Date reçue:", date)
    console.log("Heure reçue:", time)
    console.log("IP de l'utilisateur:", ip)

    const selectedDate = parseISO(date)
    const dayOfWeek = selectedDate.getDay() || 7 // 0 (dimanche) devient 7

    // Vérifier si l'utilisateur a déjà un rendez-vous
    const existingUserAppointment = await prisma.appointment.findFirst({
      where: {
        ip,
        status: {
          not: "CANCELLED"
        }
      }
    })

    if (existingUserAppointment) {
      console.log("L'utilisateur a déjà un rendez-vous actif")
      return NextResponse.json({ 
        available: false,
        error: "Vous avez déjà un rendez-vous en cours. Veuillez attendre qu'il soit terminé ou annulé avant d'en prendre un nouveau."
      })
    }

    // Vérifier les disponibilités pour ce jour
    const availability = await prisma.availability.findFirst({
      where: {
        dayOfWeek,
        isActive: true
      }
    })

    if (!availability) {
      console.log("Aucune disponibilité trouvée pour ce jour")
      return NextResponse.json({ available: false })
    }

    // Vérifier si l'heure est dans la plage horaire disponible
    const [hours, minutes] = time.split(":").map(Number)
    const appointmentTime = format(selectedDate.setHours(hours, minutes), "HH:mm")
    
    console.log("Heure du rendez-vous:", appointmentTime)
    console.log("Plage horaire disponible:", availability.startTime, "-", availability.endTime)
    
    if (appointmentTime < availability.startTime || appointmentTime >= availability.endTime) {
      console.log("Heure en dehors des disponibilités")
      return NextResponse.json({ available: false })
    }

    // Vérifier la pause déjeuner
    const breakTime = await prisma.breakTime.findFirst({
      where: {
        isActive: true
      }
    })

    if (breakTime && appointmentTime >= breakTime.startTime && appointmentTime < breakTime.endTime) {
      console.log("Heure pendant la pause déjeuner")
      return NextResponse.json({ available: false })
    }

    // Vérifier s'il y a une exception pour cette date
    const exception = await prisma.exception.findFirst({
      where: {
        date: {
          gte: startOfDay(selectedDate),
          lt: endOfDay(selectedDate),
        },
        isAvailable: false
      },
    })

    if (exception) {
      console.log("Exception trouvée pour cette date")
      return NextResponse.json({ available: false })
    }

    // Vérifier si un rendez-vous existe déjà pour ce créneau
    const appointmentDate = parseISO(date)
    appointmentDate.setHours(hours, minutes, 0, 0)

    // Créer une date UTC pour la vérification
    const utcDate = convertToUTC(appointmentDate)
    
    console.log("Date originale:", appointmentDate.toISOString())
    console.log("Date UTC:", utcDate.toISOString())

    const existingAppointment = await prisma.appointment.findFirst({
      where: {
        date: {
          gte: utcDate,
          lt: addMinutes(utcDate, 30),
        }
      },
    })

    console.log("Rendez-vous existant:", existingAppointment ? "Oui" : "Non")
    console.log("=== FIN check-availability ===")

    return NextResponse.json({ available: !existingAppointment })
  } catch (error) {
    console.error("Erreur lors de la verification de disponibilite:", error)
    return NextResponse.json(
      { error: "Erreur lors de la verification de disponibilite" },
      { status: 500 }
    )
  }
} 