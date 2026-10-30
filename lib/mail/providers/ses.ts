import { GetAccountCommand, SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2"
import type { MailProvider, ResolvedMessage } from "../types"

export const sesRegion = () => process.env.SES_REGION || "eu-north-1"

const configured = () => !!(process.env.SES_ACCESS_KEY_ID && process.env.SES_SECRET_ACCESS_KEY)

let client: SESv2Client | undefined
function getClient(): SESv2Client {
  // Explicit names: Netlify reserves AWS_ACCESS_KEY_ID and its siblings for its own runtime.
  client ??= new SESv2Client({ region: sesRegion(), credentials: { accessKeyId: process.env.SES_ACCESS_KEY_ID!, secretAccessKey: process.env.SES_SECRET_ACCESS_KEY! } })
  return client
}

/** Test seam: drops the cached client so a changed environment is picked up. */
export const resetSesClient = () => {
  client = undefined
}

export const ses: MailProvider = {
  id: "ses",
  label: "Amazon SES",
  configured,
  async send(m: ResolvedMessage) {
    const out = await getClient().send(
      new SendEmailCommand({
        FromEmailAddress: m.from,
        Destination: { ToAddresses: m.to },
        ReplyToAddresses: m.replyTo ? [m.replyTo] : undefined,
        // Optional: the configuration set publishes bounces and complaints to the CRM's webhook.
        ConfigurationSetName: process.env.SES_CONFIGURATION_SET || undefined,
        Content: {
          Simple: {
            Subject: { Data: m.subject, Charset: "UTF-8" },
            Body: { Html: { Data: m.html, Charset: "UTF-8" }, ...(m.text ? { Text: { Data: m.text, Charset: "UTF-8" } } : {}) },
            Attachments: m.attachments?.map((a) => ({ FileName: a.filename, ContentType: a.contentType, RawContent: new Uint8Array(a.content), ContentDisposition: "ATTACHMENT" as const, ContentTransferEncoding: "BASE64" as const })),
          },
        },
      })
    )
    return { id: out.MessageId ?? null }
  },
}

export interface SesAccountStatus {
  productionAccess: boolean
  sendingEnabled: boolean
  max24h: number
  sent24h: number
  maxPerSecond: number
}

/** Quota and sandbox state, for the settings page. Needs ses:GetAccount. */
export async function sesAccountStatus(): Promise<SesAccountStatus> {
  const a = await getClient().send(new GetAccountCommand({}))
  return {
    productionAccess: !!a.ProductionAccessEnabled,
    sendingEnabled: a.SendingEnabled !== false,
    max24h: a.SendQuota?.Max24HourSend ?? 0,
    sent24h: a.SendQuota?.SentLast24Hours ?? 0,
    maxPerSecond: a.SendQuota?.MaxSendRate ?? 0,
  }
}
