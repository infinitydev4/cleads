import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "../../../auth/options"
import { uploadToS3 } from "@/lib/s3"
import { v4 as uuidv4 } from "uuid"
import { SharedDocumentType } from "@prisma/client"

export async function POST(request: Request) {
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

    const formData = await request.formData()
    const files = formData.getAll("file") as File[]
    const description = formData.get("description") as string

    if (files.length === 0) {
      return NextResponse.json(
        { error: "Aucun fichier n'a été fourni" },
        { status: 400 }
      )
    }

    const uploadedDocuments = []

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const key = `uploads/${user.id}/${uuidv4()}-${file.name}`
      
      // Upload du fichier sur S3 en utilisant la fonction existante
      const url = await uploadToS3(buffer, key, file.type)

      // Déterminer le type de document et créer l'entrée dans la base de données
      const document = await prisma.sharedDocument.create({
        data: {
          name: file.name,
          type: file.type === "application/pdf" 
            ? SharedDocumentType.PDF 
            : file.type.startsWith("image/") 
              ? SharedDocumentType.IMAGE 
              : SharedDocumentType.OTHER,
          url,
          description: description || "",
          userId: user.id,
          size: buffer.length,
          mimeType: file.type,
          isShared: true,
          sharedBy: "USER"
        },
      })

      uploadedDocuments.push(document)
    }

    return NextResponse.json(uploadedDocuments)
  } catch (error) {
    console.error("[CLIENT_DOCUMENTS_UPLOAD]", error)
    return NextResponse.json(
      { error: "Erreur lors de l'upload des documents" },
      { status: 500 }
    )
  }
} 