import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/options"
import { prisma } from "@/lib/prisma"

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    // Vérifier l'authentification
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return new NextResponse("Non autorisé", { status: 401 })
    }

    // Vérifier que le document existe et appartient à l'utilisateur
    const document = await prisma.document.findUnique({
      where: {
        id: params.id,
        userId: session.user.id,
      },
    })

    if (!document) {
      return new NextResponse("Document non trouvé", { status: 404 })
    }

    // Supprimer le document
    await prisma.document.delete({
      where: {
        id: params.id,
      },
    })

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error("[DOCUMENT_DELETE]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
} 