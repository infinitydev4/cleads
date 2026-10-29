import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/options"
import { deleteFromS3, getKeyFromUrl } from "@/lib/s3"

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

    // Vérifier si le document existe
    const document = await prisma.sharedDocument.findUnique({
      where: { id: params.id },
    })

    if (!document) {
      return NextResponse.json(
        { error: "Document non trouvé" },
        { status: 404 }
      )
    }

    // Vérifier si l'utilisateur a le droit de supprimer ce document
    if (document.userId !== user.id && user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Non autorisé à supprimer ce document" },
        { status: 403 }
      )
    }

    // Supprimer le fichier de S3
    try {
      const key = getKeyFromUrl(document.url)
      await deleteFromS3(key)
    } catch (error) {
      console.error("[S3_DELETE_ERROR]", error)
      // On continue même si la suppression S3 échoue
    }

    // Supprimer le document de la base de données
    await prisma.sharedDocument.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[SHARED_DOCUMENT_DELETE]", error)
    return NextResponse.json(
      { error: "Erreur lors de la suppression du document" },
      { status: 500 }
    )
  }
} 