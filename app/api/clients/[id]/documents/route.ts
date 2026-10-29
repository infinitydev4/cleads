import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/options"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
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

    const user = await prisma.user.findUnique({
      where: { id, role: "USER" },
      select: { email: true }
    })

    if (!user || !user.email) {
      return NextResponse.json(
        { error: "Client non trouvé ou email non défini" },
        { status: 404 }
      )
    }

    // Récupérer tous les documents associés à l'email du client
    const documents = await prisma.document.findMany({
      where: {
        clientEmail: user.email
      },
      include: {
        items: true,
        company: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    // Si aucun document n'est trouvé, retourner un tableau vide
    return NextResponse.json(documents)
  } catch (error) {
    console.error("[DOCUMENTS_GET]", error)
    return NextResponse.json(
      { error: "Erreur lors de la récupération des documents" },
      { status: 500 }
    )
  }
}