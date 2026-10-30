import { defaultFrom, providers } from "./index"
import { getMailSettings, type MailSettings } from "./settings"
import { sesAccountStatus, sesRegion, type SesAccountStatus } from "./providers/ses"
import type { ProviderId } from "./types"

export interface ProviderStatus {
  id: ProviderId
  label: string
  configured: boolean
  /** SES only: read live from the account. */
  account?: SesAccountStatus
  /** Why the live read failed (wrong key, missing right), when it did. */
  error?: string
  region?: string
}

export interface MailStatus {
  settings: MailSettings
  from: string
  providers: ProviderStatus[]
  /** Bounces and complaints reach the CRM only when both are set. */
  eventTracking: { topicConfigured: boolean; configurationSet: string | null }
}

export async function mailStatus(workspaceId: string): Promise<MailStatus> {
  const settings = await getMailSettings(workspaceId)
  const list: ProviderStatus[] = []
  for (const id of ["ses", "resend"] as ProviderId[]) {
    const p = providers[id]
    const status: ProviderStatus = { id, label: p.label, configured: p.configured(), ...(id === "ses" ? { region: sesRegion() } : {}) }
    if (id === "ses" && status.configured) {
      try {
        status.account = await sesAccountStatus()
      } catch (error) {
        status.error = error instanceof Error ? error.message : String(error)
      }
    }
    list.push(status)
  }
  return { settings, from: defaultFrom(), providers: list, eventTracking: { topicConfigured: !!process.env.SES_SNS_TOPIC_ARN, configurationSet: process.env.SES_CONFIGURATION_SET || null } }
}
