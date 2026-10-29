import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/options"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.id) {
    return new NextResponse("Non autorisé", { status: 401 })
  }

  try {
    const settings = await prisma.notificationSettings.findUnique({
      where: {
        userId: session.user.id,
      },
    })

    if (!settings) {
      // Créer des paramètres par défaut si aucun n'existe
      const defaultSettings = await prisma.notificationSettings.create({
        data: {
          userId: session.user.id,
          email: true,
          push: true,
          appointments: true,
          appointmentReminders: true,
          appointmentChanges: true,
          appointmentCancellations: true,
          newMessages: true,
          contactForm: true,
          systemUpdates: true,
          securityAlerts: true,
          newsletters: false,
          specialOffers: false,
        },
      })
      return NextResponse.json(defaultSettings)
    }

    return NextResponse.json(settings)
  } catch (error) {
    console.error("[NOTIFICATION_SETTINGS_GET]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.id) {
    return new NextResponse("Non autorisé", { status: 401 })
  }

  try {
    const body = await request.json()
    
    const settings = await prisma.notificationSettings.upsert({
      where: {
        userId: session.user.id,
      },
      update: body,
      create: {
        userId: session.user.id,
        ...body,
      },
    })

    return NextResponse.json(settings)
  } catch (error) {
    console.error("[NOTIFICATION_SETTINGS_PUT]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
} 