import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

// Server-only: these variables must never carry the NEXT_PUBLIC_ prefix.
const bucket = () => process.env.AWS_BUCKET_NAME!

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

export async function uploadToS3(file: Buffer, key: string, contentType: string) {
  await s3Client.send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: file, ContentType: contentType }))
  // Signed URL, valid 7 days.
  return getSignedUrl(s3Client, new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: 3600 * 24 * 7 })
}

export async function getSignedUrlForS3(key: string) {
  return getSignedUrl(s3Client, new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: 3600 })
}

export async function deleteFromS3(key: string) {
  await s3Client.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }))
}
