import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { notifications } from "@/lib/notifications"
import { getAdminSession, unauthorized } from "@/lib/auth-guard"
import { getSession } from "@/lib/auth/session"

export const dynamic = 'force-dynamic'

/**
 * Closed. This public endpoint created a user account with a temporary password for every booking and blocked on the
 * visitor's IP. Meetings are now booked on `/rdv/<closer>` (no account) or from the CRM; see features/meetings.
 */
export async function POST() {
  return NextResponse.json({ error: "La réservation a changé : utilisez la page de rendez-vous de votre interlocuteur Cleads.", code: "gone" }, { status: 410 })
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