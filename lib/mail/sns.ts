import { createVerify } from "node:crypto"

/**
 * Amazon SNS delivers SES's bounce and complaint events to a public URL. Anyone can post to that URL, so every message
 * is checked against AWS's own signature before it is believed.
 */
export interface SnsMessage {
  Type: "Notification" | "SubscriptionConfirmation" | "UnsubscribeConfirmation"
  MessageId: string
  TopicArn: string
  Message: string
  Timestamp: string
  SignatureVersion: string
  Signature: string
  SigningCertURL: string
  Subject?: string
  Token?: string
  SubscribeURL?: string
}

/** Only certificates AWS serves from its own SNS hosts count. */
const CERT_URL = /^https:\/\/sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?\/SimpleNotificationService-[a-zA-Z0-9]+\.pem$/
const SUBSCRIBE_URL = /^https:\/\/sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?\//

export const isTrustedCertUrl = (url: string) => CERT_URL.test(url)
export const isTrustedSubscribeUrl = (url: string) => SUBSCRIBE_URL.test(url)

const FIELDS: Record<string, string[]> = {
  Notification: ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"],
  SubscriptionConfirmation: ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"],
  UnsubscribeConfirmation: ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"],
}

/** The exact text AWS signed: "Key\nValue\n" for each field, in alphabetical order, absent fields left out. */
export function stringToSign(m: SnsMessage): string | null {
  const fields = FIELDS[m.Type]
  if (!fields) return null
  const record = m as unknown as Record<string, string | undefined>
  return fields.filter((k) => record[k] !== undefined).map((k) => `${k}\n${record[k]}\n`).join("")
}

const certCache = new Map<string, string>()

async function fetchCert(url: string): Promise<string> {
  const hit = certCache.get(url)
  if (hit) return hit
  const res = await fetch(url)
  if (!res.ok) throw new Error(`certificate download failed (${res.status})`)
  const pem = await res.text()
  certCache.set(url, pem)
  return pem
}

export async function verifySnsMessage(m: SnsMessage, getCert: (url: string) => Promise<string> = fetchCert): Promise<boolean> {
  if (!m || typeof m.SigningCertURL !== "string" || typeof m.Signature !== "string" || !isTrustedCertUrl(m.SigningCertURL)) return false
  if (m.SignatureVersion !== "1" && m.SignatureVersion !== "2") return false
  const text = stringToSign(m)
  if (text === null) return false
  try {
    const verifier = createVerify(m.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1")
    verifier.update(text, "utf8")
    return verifier.verify(await getCert(m.SigningCertURL), m.Signature, "base64")
  } catch {
    return false
  }
}
