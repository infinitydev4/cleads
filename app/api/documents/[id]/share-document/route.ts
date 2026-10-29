import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "../../../auth/options"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse("Non autorisé", { status: 401 })
    }

    // Vérifier que le document existe et appartient à l'utilisateur
    const document = await prisma.sharedDocument.findUnique({
      where: {
        id: params.id,
        userId: session.user.id,
      },
    })

    if (!document) {
      return new NextResponse("Document non trouvé", { status: 404 })
    }

    // Mettre à jour le statut de partage
    const updatedDocument = await prisma.sharedDocument.update({
      where: {
        id: params.id,
      },
      data: {
        isShared: true,
      },
    })

    // Créer une notification pour l'admin
    const admin = await prisma.user.findFirst({
      where: {
        role: "ADMIN",
      },
    })

    if (admin) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: "document",
          title: "Nouveau document partagé",
          message: `Document "${document.name}" partagé par ${session.user.name || "un client"}`,
        },
      })
    }

    return NextResponse.json(updatedDocument)
  } catch (error) {
    console.error("[DOCUMENT_SHARE]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
} 