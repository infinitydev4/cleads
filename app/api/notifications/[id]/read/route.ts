import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

    const notification = await prisma.notification.update({
      where: {
        id: params.id,
        userId: user.id,
      },
      data: {
        read: true,
      },
    })

    return NextResponse.json(notification)
  } catch (error) {
    console.error("[MARK_NOTIFICATION_READ]", error)
    return NextResponse.json(
      { error: "Erreur interne" },
      { status: 500 }
    )
  }
} 