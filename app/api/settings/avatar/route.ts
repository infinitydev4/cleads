import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/options"
import { prisma } from "@/lib/prisma"
import { uploadToS3 } from "@/lib/s3"
import { v4 as uuidv4 } from "uuid"

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return new NextResponse("Non autorisé", { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get("avatar") as File

    if (!file) {
      return new NextResponse("Aucun fichier fourni", { status: 400 })
    }

    // Vérifier le type de fichier
    if (!file.type.startsWith("image/")) {
      return new NextResponse("Le fichier doit être une image", { status: 400 })
    }

    // Vérifier la taille du fichier (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return new NextResponse("L'image ne doit pas dépasser 5MB", { status: 400 })
    }

    // Convertir le fichier en Buffer
    const buffer = Buffer.from(await file.arrayBuffer())

    // Générer un nom de fichier unique
    const fileExtension = file.name.split(".").pop()
    const fileName = `avatars/${uuidv4()}.${fileExtension}`

    // Upload vers S3
    const imageUrl = await uploadToS3(buffer, fileName, file.type)

    // Mettre à jour l'URL de l'image dans la base de données
    const updatedUser = await prisma.user.update({
      where: {
        email: session.user.email
      },
      data: {
        image: imageUrl
      }
    })

    return NextResponse.json(updatedUser)
  } catch (error) {
    console.error("[AVATAR_POST]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
} 