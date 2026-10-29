import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"

export const dynamic = 'force-dynamic'

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const appointment = await prisma.appointment.delete({
      where: {
        id: params.id,
      },
    })

    return NextResponse.json(appointment)
  } catch (error) {
    console.error("Erreur lors de la suppression du rendez-vous:", error)
    return NextResponse.json(
      { error: "Erreur lors de la suppression du rendez-vous" },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    // Vérifier l'authentification
    const session = await getSession()
    if (!session?.user?.email) {
      return new NextResponse("Non autorisé", { status: 401 })
    }

    // Récupérer l'utilisateur
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return new NextResponse("Utilisateur non trouvé", { status: 404 })
    }

    // Récupérer les données du corps de la requête
    const body = await request.json()

    // Vérifier que l'utilisateur est propriétaire du rendez-vous
    const appointment = await prisma.appointment.findFirst({
      where: {
        id: params.id,
        userId: user.id,
      },
    })

    if (!appointment) {
      return new NextResponse("Rendez-vous non trouvé", { status: 404 })
    }

    // Mettre à jour le rendez-vous
    const updatedAppointment = await prisma.appointment.update({
      where: {
        id: params.id,
      },
      data: {
        ...body,
      },
    })

    return NextResponse.json(updatedAppointment)
  } catch (error) {
    console.error("[APPOINTMENT_UPDATE]", error)
    return new NextResponse("Erreur interne du serveur", { status: 500 })
  }
} 