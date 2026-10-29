import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/options"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.email) {
    return new NextResponse("Non autorisé", { status: 401 })
  }

  try {
    const notifications = await prisma.notification.findMany({
      where: {
        userId: session.user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json(notifications)
  } catch (error) {
    console.error("[NOTIFICATIONS_GET]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
}

export async function PUT() {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.email) {
    return new NextResponse("Non autorisé", { status: 401 })
  }

  try {
    await prisma.notification.updateMany({
      where: {
        userId: session.user.id,
        read: false,
      },
      data: {
        read: true,
      },
    })

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error("[NOTIFICATIONS_PUT]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
} 