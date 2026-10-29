import { S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"

const s3Client = new S3Client({
  region: process.env.NEXT_PUBLIC_AWS_REGION!,
  credentials: {
    accessKeyId: process.env.NEXT_PUBLIC_CLEADS_AWS_ACCESS_KEY!,
    secretAccessKey: process.env.NEXT_PUBLIC_CLEADS_AWS_SECRET_KEY!,
  },
})

export async function uploadToS3(file: Buffer, key: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: process.env.NEXT_PUBLIC_AWS_BUCKET_NAME!,
    Key: key,
    Body: file,
    ContentType: contentType,
  })

  try {
    await s3Client.send(command)
    
    // Créer une URL signée pour l'accès au fichier
    const getCommand = new GetObjectCommand({
      Bucket: process.env.NEXT_PUBLIC_AWS_BUCKET_NAME!,
      Key: key,
    })
    
    const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 * 24 * 7 }) // URL valide 7 jours
    return signedUrl
  } catch (error) {
    console.error("Error uploading to S3:", error)
    throw error
  }
}

export async function getSignedUrlForS3(key: string) {
  const command = new GetObjectCommand({
    Bucket: process.env.NEXT_PUBLIC_AWS_BUCKET_NAME!,
    Key: key,
  })

  try {
    return await getSignedUrl(s3Client, command, { expiresIn: 3600 })
  } catch (error) {
    console.error("Error getting signed URL:", error)
    throw error
  }
}

export async function deleteFromS3(key: string) {
  const command = new DeleteObjectCommand({
    Bucket: process.env.NEXT_PUBLIC_AWS_BUCKET_NAME!,
    Key: key,
  })

  try {
    await s3Client.send(command)
  } catch (error) {
    console.error("Error deleting from S3:", error)
    throw error
  }
}

// Fonction utilitaire pour extraire la clé S3 d'une URL
export function getKeyFromUrl(url: string): string {
  const bucketUrl = `${process.env.NEXT_PUBLIC_AWS_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/`
  return url.split(bucketUrl)[1]
} 