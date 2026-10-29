import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/options"
import { prisma } from "@/lib/prisma"

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return new NextResponse("Non autorisé", { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return new NextResponse("Utilisateur non trouvé", { status: 404 })
    }

    const body = await req.json()

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone,
        language: body.language,
      },
    })

    return NextResponse.json({
      name: updatedUser.name,
      email: updatedUser.email,
      phone: updatedUser.phone || "",
      avatar: updatedUser.image || "",
      language: updatedUser.language || "fr",
    })
  } catch (error) {
    console.error("[ADMIN_PATCH]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
} 