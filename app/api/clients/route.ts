import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Role } from "@prisma/client"
import { getAdminSession, unauthorized } from "@/lib/auth-guard"

export async function GET() {
  if (!(await getAdminSession())) return unauthorized()
  try {
    const users = await prisma.user.findMany({
      where: {
        role: Role.USER
      },
      include: {
        appointments: {
          orderBy: {
            date: 'desc'
          },
          take: 1
        }
      }
    })

    const formattedClients = users.map(user => {
      const lastAppointment = user.appointments[0]
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone || "Non renseigné",
        location: "Non renseigné",
        company: "Non renseigné",
        lastContact: lastAppointment?.date || null,
        nextMeeting: null,
        avatar: user.image,
        status: "active",
        favorite: false,
        totalAppointments: user.appointments.length || 0
      }
    })

    console.log("Formatted clients:", formattedClients)
    return NextResponse.json(formattedClients)
  } catch (error) {
    console.error("Error fetching clients:", error)
    return NextResponse.json(
      { error: "Erreur lors de la récupération des clients" },
      { status: 500 }
    )
  }
} 