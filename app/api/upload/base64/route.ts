import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/options";
import { v4 as uuidv4 } from "uuid";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";

export async function POST(request: Request) {
  try {
    // Authentification
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Récupération et validation du corps de la requête
    const body = await request.json();
    const { base64Image, type = "article" } = body;

    if (!base64Image || typeof base64Image !== "string") {
      return NextResponse.json(
        { error: "Image en base64 requise" },
        { status: 400 }
      );
    }

    // Vérifier le format de base64
    const base64Regex = /^data:image\/(jpeg|png|gif|webp);base64,/;
    if (!base64Regex.test(base64Image)) {
      return NextResponse.json(
        { error: "Format d'image en base64 invalide" },
        { status: 400 }
      );
    }

    // Extraire le type MIME et les données de l'image
    const matches = base64Image.match(/^data:image\/([a-zA-Z0-9]+);base64,(.*)$/);
    if (!matches || matches.length !== 3) {
      return NextResponse.json(
        { error: "Format d'image en base64 invalide" },
        { status: 400 }
      );
    }

    const imageType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, "base64");

    // Vérification de la taille
    const fileSizeInMB = buffer.length / (1024 * 1024);
    if (fileSizeInMB > 5) {
      return NextResponse.json(
        { error: "L'image ne doit pas dépasser 5MB" },
        { status: 400 }
      );
    }

    try {
      // Génération d'un nom de fichier unique
      const fileName = `${type}/${uuidv4()}.${imageType}`;

      // Configuration du client S3
      const s3Client = new S3Client({
        region: env.AWS_REGION,
        credentials: {
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        },
      });

      // Téléchargement du fichier vers S3
      await s3Client.send(
        new PutObjectCommand({
          Bucket: env.AWS_BUCKET_NAME,
          Key: fileName,
          Body: buffer,
          ContentType: `image/${imageType}`,
          ACL: "public-read",
        })
      );

      // Renvoyer l'URL du fichier téléchargé
      const fileUrl = `https://${env.AWS_BUCKET_NAME}.s3.${env.AWS_REGION}.amazonaws.com/${fileName}`;
      
      return NextResponse.json({
        success: true,
        url: fileUrl,
      });
    } catch (error: any) {
      console.error("Erreur lors de l'upload vers S3:", error);
      return NextResponse.json(
        { error: "Erreur lors de l'upload vers S3: " + error.message },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Erreur générale:", error);
    return NextResponse.json(
      { error: "Erreur lors du traitement de la requête: " + error.message },
      { status: 500 }
    );
  }
} 