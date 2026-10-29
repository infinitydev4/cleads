import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/options"
import { prisma } from "@/lib/prisma"
import { uploadToS3 } from "@/lib/s3"
import { SharedDocumentType } from "@prisma/client"

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || session.user.role !== "ADMIN") {
      return new NextResponse("Non autorisé", { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File
    const description = formData.get("description") as string
    const clientId = formData.get("clientId") as string

    if (!file) {
      return new NextResponse("Aucun fichier fourni", { status: 400 })
    }

    if (!clientId) {
      return new NextResponse("ID du client requis", { status: 400 })
    }

    // Vérifier que le client existe
    const client = await prisma.user.findUnique({
      where: { id: clientId, role: "USER" },
    })

    if (!client) {
      return new NextResponse("Client non trouvé", { status: 404 })
    }

    // Déterminer le type de document
    let documentType: SharedDocumentType = SharedDocumentType.OTHER
    if (file.type.startsWith("image/")) {
      documentType = SharedDocumentType.IMAGE
    } else if (file.type === "application/pdf") {
      documentType = SharedDocumentType.PDF
    } else {
      documentType = SharedDocumentType.FILE
    }

    // Convertir le fichier en buffer
    const buffer = Buffer.from(await file.arrayBuffer())

    // Uploader le fichier sur S3
    const key = `shared-documents/${clientId}/${Date.now()}-${file.name}`
    const url = await uploadToS3(buffer, key, file.type)

    // Créer le document dans la base de données
    const document = await prisma.sharedDocument.create({
      data: {
        name: file.name,
        type: documentType,
        url,
        description: description || "",
        size: file.size,
        mimeType: file.type,
        userId: client.id,
        isShared: true,
        sharedBy: "ADMIN"
      },
    })

    return NextResponse.json(document)
  } catch (error) {
    console.error("[DOCUMENT_UPLOAD]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse("Non autorisé", { status: 401 })
    }

    const documents = await prisma.sharedDocument.findMany({
      where: {
        userId: session.user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json(documents)
  } catch (error) {
    console.error("[DOCUMENTS_GET]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
} 