import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/options"
import { prisma } from "@/lib/prisma"

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Non autorisé" },
        { status: 401 }
      )
    }

    const { id } = params
    if (!id) {
      return NextResponse.json(
        { error: "ID du client requis" },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { favorite } = body

    if (typeof favorite !== "boolean") {
      return NextResponse.json(
        { error: "Le statut favori doit être un booléen" },
        { status: 400 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { id, role: "USER" }
    })

    if (!user) {
      return NextResponse.json(
        { error: "Client non trouvé" },
        { status: 404 }
      )
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { favorite },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        favorite: true
      }
    })

    return NextResponse.json(updatedUser)
  } catch (error) {
    console.error("[FAVORITE_PATCH]", error)
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour du statut favori" },
      { status: 500 }
    )
  }
}