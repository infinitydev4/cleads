import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

// Server-only: these variables must never carry the NEXT_PUBLIC_ prefix. Hosts reserve the AWS_* names for their own
// runtime (Vercel refuses AWS_ACCESS_KEY_ID), so the S3_* names come first; AWS_* still serve a local .env.
const env = (name: "ACCESS_KEY_ID" | "SECRET_ACCESS_KEY" | "REGION" | "BUCKET_NAME") => process.env[`S3_${name}`] || process.env[`AWS_${name}`]
const bucket = () => env("BUCKET_NAME")!

const s3Client = new S3Client({
  region: env("REGION"),
  credentials: {
    accessKeyId: env("ACCESS_KEY_ID")!,
    secretAccessKey: env("SECRET_ACCESS_KEY")!,
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
