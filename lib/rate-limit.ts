import { createHash } from "node:crypto"
import { prisma } from "@/lib/prisma"

/**
 * Fixed-window limiter backed by the database, so it holds across serverless instances (an in-memory counter would
 * not). Used on public endpoints only. The requester is stored as a short hash, never the address itself.
 */
export async function rateLimit(action: string, requester: string | null | undefined, limit: number, windowSec: number): Promise<boolean> {
  const key = `${action}:${createHash("sha256").update(requester || "unknown").digest("hex").slice(0, 24)}`
  const since = new Date(Date.now() - windowSec * 1000)
  const used = await prisma.rateLimitHit.count({ where: { key, createdAt: { gte: since } } })
  if (used >= limit) return false
  await prisma.rateLimitHit.create({ data: { key } })
  // Housekeeping on a fraction of calls: nothing older than a day is ever read.
  if (Math.random() < 0.02) await prisma.rateLimitHit.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86_400_000) } } })
  return true
}
