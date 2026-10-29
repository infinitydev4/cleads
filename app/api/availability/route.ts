import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "../auth/options"

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return new NextResponse("Non autorisé", { status: 401 })
    }

    const body = await req.json()
    const { dayOfWeek, startTime, endTime, isActive } = body

    const availability = await prisma.availability.upsert({
      where: {
        userId_dayOfWeek: {
          userId: session.user.id,
          dayOfWeek,
        },
      },
      update: {
        startTime,
        endTime,
        isActive,
      },
      create: {
        userId: session.user.id,
        dayOfWeek,
        startTime,
        endTime,
        isActive,
      },
    })

    return NextResponse.json(availability)
  } catch (error) {
    console.error("[AVAILABILITY_POST]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      console.log("Session non autorisée")
      return NextResponse.json(
        { error: "Non autorise" },
        { status: 401 }
      )
    }

    console.log("Récupération des disponibilités pour l'utilisateur:", session.user.id)
    const availabilities = await prisma.availability.findMany({
      where: {
        userId: session.user.id,
        isActive: true
      },
      orderBy: {
        dayOfWeek: 'asc'
      }
    })

    console.log("Disponibilités trouvées:", availabilities)

    return NextResponse.json(availabilities)
  } catch (error) {
    console.error("Erreur lors de la recuperation des disponibilites:", error)
    return NextResponse.json(
      { error: "Erreur lors de la recuperation des disponibilites" },
      { status: 500 }
    )
  }
} 