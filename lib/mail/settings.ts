import { prisma } from "@/lib/prisma"
import { ses } from "./providers/ses"
import { PROVIDER_IDS, type ProviderId } from "./types"

export interface MailSettings {
  transactionalProvider: ProviderId
  fallbackEnabled: boolean
  /** "database" when someone chose in the settings page, "default" when nothing was saved. */
  source: "database" | "default"
}

const isProvider = (v: unknown): v is ProviderId => PROVIDER_IDS.includes(v as ProviderId)

/** SES when it is configured, else Resend: a fresh install sends with what it has. MAIL_PROVIDER can force the default. */
export function defaultProvider(): ProviderId {
  const forced = process.env.MAIL_PROVIDER
  if (isProvider(forced)) return forced
  return ses.configured() ? "ses" : "resend"
}

const TTL_MS = 30_000
const cache = new Map<string, { at: number; value: MailSettings }>()

export const clearMailSettingsCache = () => cache.clear()

export async function getMailSettings(workspaceId: string): Promise<MailSettings> {
  const hit = cache.get(workspaceId)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value
  const row = await prisma.mailSetting.findUnique({ where: { workspaceId } })
  const value: MailSettings = row && isProvider(row.transactionalProvider)
    ? { transactionalProvider: row.transactionalProvider, fallbackEnabled: row.fallbackEnabled, source: "database" }
    : { transactionalProvider: defaultProvider(), fallbackEnabled: true, source: "default" }
  cache.set(workspaceId, { at: Date.now(), value })
  return value
}

export async function saveMailSettings(workspaceId: string, input: { transactionalProvider: ProviderId; fallbackEnabled: boolean }, updatedById: string): Promise<MailSettings> {
  await prisma.mailSetting.upsert({
    where: { workspaceId },
    create: { workspaceId, ...input, updatedById },
    update: { ...input, updatedById },
  })
  clearMailSettingsCache()
  return getMailSettings(workspaceId)
}
