import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/app/api/auth/options"
import { Role } from "@prisma/client"

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json(
        { error: "Non autorisé" },
        { status: 401 }
      )
    }

    const clientId = params.id
    if (!clientId) {
      return NextResponse.json(
        { error: "ID du client requis" },
        { status: 400 }
      )
    }

    // Vérifier que l'utilisateur existe et est un client
    const user = await prisma.user.findUnique({
      where: {
        id: clientId,
        role: Role.USER
      }
    })

    if (!user) {
      return NextResponse.json(
        { error: "Client non trouvé" },
        { status: 404 }
      )
    }

    // Récupérer tous les documents partagés associés à ce client
    const documents = await prisma.sharedDocument.findMany({
      where: {
        userId: clientId
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    const formattedDocuments = documents.map(doc => ({
      id: doc.id,
      name: doc.name,
      type: doc.type,
      url: doc.url,
      description: doc.description,
      size: doc.size,
      mimeType: doc.mimeType,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      isShared: doc.isShared,
      sharedBy: doc.sharedBy
    }))

    return NextResponse.json(formattedDocuments)
  } catch (error) {
    console.error("Erreur lors de la récupération des documents partagés:", error)
    return NextResponse.json(
      { error: "Erreur lors de la récupération des documents partagés" },
      { status: 500 }
    )
  }
} 