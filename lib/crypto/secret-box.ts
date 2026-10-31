import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

/**
 * Seals secrets kept in the database (mailbox passwords) with AES-256-GCM. The key lives in `MAILBOX_SECRET_KEY`
 * (32 random bytes, base64: `openssl rand -base64 32`), never in the database: a stolen dump alone opens nothing.
 * Format: `v1.<iv>.<tag>.<ciphertext>`, base64url. The version prefix leaves room for a key rotation.
 */
function key(): Buffer {
  const raw = process.env.MAILBOX_SECRET_KEY
  if (!raw) throw new SecretBoxError("MAILBOX_SECRET_KEY n’est pas défini sur ce serveur : impossible de chiffrer les identifiants des boîtes.")
  const k = Buffer.from(raw, "base64")
  if (k.length !== 32) throw new SecretBoxError("MAILBOX_SECRET_KEY doit faire 32 octets encodés en base64 (openssl rand -base64 32).")
  return k
}

export class SecretBoxError extends Error {}

export const secretBoxConfigured = () => {
  try {
    key()
    return true
  } catch {
    return false
  }
}

export function seal(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".")
}

/** Throws when the value was not sealed with this key or was altered. */
export function open(sealed: string): string {
  const [version, iv, tag, data] = sealed.split(".")
  if (version !== "v1" || !iv || !tag || data === undefined) throw new SecretBoxError("Secret illisible (format inconnu).")
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"))
    decipher.setAuthTag(Buffer.from(tag, "base64url"))
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8")
  } catch {
    throw new SecretBoxError("Secret illisible : la clé MAILBOX_SECRET_KEY a changé ou la valeur a été altérée.")
  }
}
