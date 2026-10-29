import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/options"
import { Role } from "@prisma/client"

export const dynamic = 'force-dynamic'

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json(
        { error: "Non autorisé" },
        { status: 401 }
      )
    }

    const clientId = params.id
    if (!clientId) {
      return NextResponse.json(
        { error: "ID du client requis" },
        { status: 400 }
      )
    }

    // Vérifier que l'utilisateur existe et est un client
    const user = await prisma.user.findUnique({
      where: {
        id: clientId,
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

    if (!user) {
      return NextResponse.json(
        { error: "Client non trouvé" },
        { status: 404 }
      )
    }

    const lastAppointment = user.appointments[0]
    const formattedClient = {
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

    return NextResponse.json(formattedClient)
  } catch (error) {
    console.error("Erreur lors de la récupération du client:", error)
    return NextResponse.json(
      { error: "Erreur lors de la récupération du client" },
      { status: 500 }
    )
  }
}

export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json(
        { error: "Non autorisé" },
        { status: 401 }
      )
    }

    const clientId = params.id
    if (!clientId) {
      return NextResponse.json(
        { error: "ID du client requis" },
        { status: 400 }
      )
    }

    // Vérifier que l'utilisateur existe et est un client
    const user = await prisma.user.findUnique({
      where: {
        id: clientId,
        role: Role.USER
      }
    })

    if (!user) {
      return NextResponse.json(
        { error: "Client non trouvé" },
        { status: 404 }
      )
    }

    // Supprimer l'utilisateur (client)
    await prisma.user.delete({
      where: {
        id: clientId,
      },
    })

    return NextResponse.json({ message: "Client supprimé avec succès" })
  } catch (error) {
    console.error("Erreur lors de la suppression du client:", error)
    return NextResponse.json(
      { error: "Erreur lors de la suppression du client" },
      { status: 500 }
    )
  }
} 