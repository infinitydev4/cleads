import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "../../auth/options"
import { AppointmentType, AppointmentStatus } from "@prisma/client"
import { notifications } from "@/lib/notifications"
import { convertToUTC } from "@/lib/date-utils"

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Non autorisé" },
        { status: 401 }
      )
    }

    // Récupérer l'utilisateur
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json(
        { error: "Utilisateur non trouvé" },
        { status: 404 }
      )
    }

    // Récupérer les rendez-vous de l'utilisateur
    const appointments = await prisma.appointment.findMany({
      where: {
        OR: [
          { email: user.email || "" },
          { phone: user.phone || "" },
          { clientName: user.name || "" },
          { userId: user.id }
        ],
        status: {
          not: "CANCELLED"
        }
      },
      orderBy: {
        date: 'desc'
      }
    })

    return NextResponse.json(appointments)
  } catch (error) {
    console.error("[CLIENT_APPOINTMENTS_GET]", error)
    return NextResponse.json(
      { error: "Erreur lors de la récupération des rendez-vous" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Non autorisé" },
        { status: 401 }
      )
    }

    // Récupérer l'utilisateur
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json(
        { error: "Utilisateur non trouvé" },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { date, type } = body

    // Validation des champs requis
    if (!date || !type) {
      return NextResponse.json(
        { error: "La date et le type de rendez-vous sont requis" },
        { status: 400 }
      )
    }

    // Vérifier si le type est valide
    if (!(type in AppointmentType)) {
      return NextResponse.json(
        { error: "Type de rendez-vous invalide" },
        { status: 400 }
      )
    }

    // Convertir la date en UTC
    const utcDate = convertToUTC(new Date(date))

    // Créer le rendez-vous
    const appointment = await prisma.appointment.create({
      data: {
        clientName: user.name || "Client",
        email: user.email || "",
        phone: user.phone || "",
        date: utcDate,
        type: type as AppointmentType,
        status: AppointmentStatus.PENDING,
        userId: user.id,
      }
    })

    // Envoyer une notification
    try {
      await notifications.appointmentCreated(user.id, appointment)
    } catch (notificationError) {
      console.error("[NOTIFICATION_ERROR]", notificationError)
    }

    return NextResponse.json(appointment)
  } catch (error) {
    console.error("[CLIENT_APPOINTMENTS_POST]", error)
    return NextResponse.json(
      { error: "Erreur lors de la création du rendez-vous" },
      { status: 500 }
    )
  }
} 