import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/options"

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 })
    }

    // Récupérer les documents partagés du client
    const sharedDocuments = await prisma.sharedDocument.findMany({
      where: {
        userId: user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json(sharedDocuments)
  } catch (error) {
    console.error("[CLIENT_SHARED_DOCUMENTS_GET]", error)
    return NextResponse.json(
      { error: "Erreur lors de la récupération des documents partagés" },
      { status: 500 }
    )
  }
} 