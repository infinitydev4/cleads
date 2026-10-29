import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"

export async function PUT() {
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

    await prisma.notification.updateMany({
      where: {
        userId: user.id,
        read: false,
      },
      data: {
        read: true,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[MARK_ALL_NOTIFICATIONS_READ]", error)
    return NextResponse.json(
      { error: "Erreur interne" },
      { status: 500 }
    )
  }
} 