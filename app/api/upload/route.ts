import { NextResponse } from "next/server"
import { uploadToS3 } from "@/lib/s3"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/options"
import { v4 as uuidv4 } from "uuid"
import { prisma } from "@/lib/prisma"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

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
      return new NextResponse("Utilisateur non trouvé", { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File
    const type = formData.get("type") as string || "image"
    const source = formData.get("source") as string || ""

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 })
    }

    if (!file.type.startsWith('image/')) {
      return new NextResponse("Le fichier doit être une image", { status: 400 })
    }

    if (file.size > 5 * 1024 * 1024) {
      return new NextResponse("L'image ne doit pas dépasser 5MB", { status: 400 })
    }

    if (!type || !['article', 'profile', 'avatar'].includes(type)) {
      return new NextResponse("Type de fichier invalide", { status: 400 })
    }

    const s3Client = new S3Client({
      region: process.env.AWS_REGION!,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    })

    let fileName = file.name
    if (source && source.startsWith('huggingface-')) {
      const modelName = source.split('huggingface-')[1].split('/').pop() || 'model'
      const timestamp = Date.now()
      const extension = fileName.split('.').pop() || 'png'
      fileName = `ai-${modelName}-${timestamp}.${extension}`
      console.log(`Image générée par Hugging Face avec le modèle ${source}`)
    } else {
      fileName = `${type}/${uuidv4()}-${fileName}`
    }

    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME!,
        Key: fileName,
        Body: Buffer.from(await file.arrayBuffer()),
        ContentType: file.type,
        ACL: "public-read",
      })
    )

    const fileUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`

    return NextResponse.json({
      success: true,
      url: fileUrl,
      source: source || null
    })
  } catch (error) {
    console.error("Erreur lors du téléchargement du fichier:", error)
    return NextResponse.json({ error: "Erreur lors du téléchargement du fichier" }, { status: 500 })
  }
} 