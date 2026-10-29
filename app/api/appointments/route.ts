import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { AppointmentType, AppointmentStatus } from "@/types/appointments"
import { notifications } from "@/lib/notifications"
import { convertToUTC } from "@/lib/date-utils"
import { headers } from "next/headers"
import { generatePassword } from "@/lib/utils"
import { hash } from "bcryptjs"
import { getAdminSession, unauthorized } from "@/lib/auth-guard"
import { getSession } from "@/lib/auth/session"

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { clientName, email, phone, date, type, notes } = body

    // Récupérer l'IP de l'utilisateur
    const headersList = await headers()
    const ip = headersList.get('x-forwarded-for') || 'unknown'

    // Validation des champs requis
    if (!clientName || !email || !phone || !date || !type) {
      console.log("Donnees manquantes:", { clientName, email, phone, date, type })
      return NextResponse.json(
        { error: "Tous les champs sont requis" },
        { status: 400 }
      )
    }

    // Validation de la date
    const appointmentDate = new Date(date)
    if (isNaN(appointmentDate.getTime())) {
      console.log("Date invalide:", date)
      return NextResponse.json(
        { error: "Date invalide" },
        { status: 400 }
      )
    }

    // Convertir la date en UTC
    const utcDate = convertToUTC(appointmentDate)

    console.log("Date originale:", appointmentDate.toISOString())
    console.log("Date UTC:", utcDate.toISOString())

    // Vérifier si l'utilisateur a déjà un rendez-vous
    const existingAppointment = await prisma.appointment.findFirst({
      where: {
        OR: [
          { email },
          { phone },
          { clientName },
          { ip }
        ],
        status: {
          not: AppointmentStatus.CANCELLED
        }
      },
      orderBy: {
        date: 'desc'
      }
    })

    if (existingAppointment) {
      console.log("Rendez-vous existant trouvé:", existingAppointment)
      return NextResponse.json(
        { error: "Vous avez déjà un rendez-vous en cours. Veuillez attendre qu'il soit terminé ou annulé avant d'en prendre un nouveau." },
        { status: 400 }
      )
    }

    // Créer ou récupérer l'utilisateur
    let user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      // Générer un mot de passe temporaire
      const temporaryPassword = generatePassword()
      const hashedPassword = await hash(temporaryPassword, 12)

      // Créer un nouvel utilisateur
      user = await prisma.user.create({
        data: {
          email,
          name: clientName,
          phone,
          role: "USER",
          ip,
          password: hashedPassword
        }
      })
    }

    // Créer le rendez-vous avec la date UTC
    const appointment = await prisma.appointment.create({
      data: {
        clientName,
        email,
        phone,
        date: utcDate,
        type: type as AppointmentType,
        notes: notes || "",
        status: AppointmentStatus.PENDING,
        userId: user.id,
        ip
      }
    })

    // Envoyer une notification pour le nouveau rendez-vous
    try {
      await notifications.appointmentCreated(user.id, appointment)
    } catch (notificationError) {
      console.error("[NOTIFICATION_ERROR]", notificationError)
      // On continue même si la notification échoue
    }

    return NextResponse.json(appointment)
  } catch (error) {
    console.error("[APPOINTMENT_POST]", error)
    return NextResponse.json(
      { error: "Erreur lors de la création du rendez-vous" },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  try {
    if (!(await getAdminSession())) return unauthorized()

    const { searchParams } = new URL(request.url)
    const date = searchParams.get("date")

    let appointments
    if (date) {
      const startDate = new Date(date)
      startDate.setHours(0, 0, 0, 0)
      const endDate = new Date(date)
      endDate.setHours(23, 59, 59, 999)

      appointments = await prisma.appointment.findMany({
        where: {
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          user: true
        },
        orderBy: {
          date: 'asc'
        }
      })
    } else {
      appointments = await prisma.appointment.findMany({
        include: {
          user: true
        },
        orderBy: {
          date: 'asc'
        }
      })
    }

    return NextResponse.json(appointments)
  } catch (error) {
    console.error("Error fetching appointments:", error)
    return NextResponse.json(
      { error: "Erreur lors de la récupération des rendez-vous" },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 })
    }

    const body = await request.json()
    const { id, ...data } = body

    const appointment = await prisma.appointment.update({
      where: {
        id,
        userId: user.id,
      },
      data,
    })

    // Envoyer une notification pour la modification du rendez-vous
    await notifications.appointmentChanged(user.id, appointment)

    return NextResponse.json(appointment)
  } catch (error) {
    console.error("[APPOINTMENT_PUT]", error)
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour du rendez-vous" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json(
        { error: "ID du rendez-vous requis" },
        { status: 400 }
      )
    }

    const appointment = await prisma.appointment.delete({
      where: {
        id,
        userId: user.id,
      },
    })

    // Envoyer une notification pour l'annulation du rendez-vous
    await notifications.appointmentCancelled(user.id, appointment)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[APPOINTMENT_DELETE]", error)
    return NextResponse.json(
      { error: "Erreur lors de la suppression du rendez-vous" },
      { status: 500 }
    )
  }
} 