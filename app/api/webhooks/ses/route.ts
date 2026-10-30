import { NextResponse } from "next/server"
import { applySuppressions, suppressionTargets } from "@/lib/mail/events"
import { isTrustedSubscribeUrl, verifySnsMessage, type SnsMessage } from "@/lib/mail/sns"
import { defaultWorkspaceId } from "@/lib/mail/workspace"

export const dynamic = "force-dynamic"

/**
 * Receives Amazon SNS messages carrying SES bounce and complaint events (configuration set → SNS topic → this URL).
 * Three checks before anything is believed: the AWS signature, the topic (SES_SNS_TOPIC_ARN: a valid signature from
 * someone else's topic must not count), and the subscription URL when SNS asks to confirm.
 */
export async function POST(request: Request) {
  const allowedTopic = process.env.SES_SNS_TOPIC_ARN
  if (!allowedTopic) return NextResponse.json({ error: "SES_SNS_TOPIC_ARN is not set" }, { status: 503 })

  let message: SnsMessage
  try {
    // SNS posts JSON with a text/plain content type.
    message = JSON.parse(await request.text())
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 })
  }
  if (!(await verifySnsMessage(message))) return NextResponse.json({ error: "Signature invalide" }, { status: 403 })
  if (message.TopicArn !== allowedTopic) return NextResponse.json({ error: "Sujet non autorisé" }, { status: 403 })

  if (message.Type === "SubscriptionConfirmation") {
    if (!message.SubscribeURL || !isTrustedSubscribeUrl(message.SubscribeURL)) return NextResponse.json({ error: "URL de confirmation invalide" }, { status: 400 })
    await fetch(message.SubscribeURL)
    return NextResponse.json({ confirmed: true })
  }
  if (message.Type !== "Notification") return NextResponse.json({ ignored: message.Type })

  let event: unknown
  try {
    event = JSON.parse(message.Message)
  } catch {
    return NextResponse.json({ ignored: "not an SES event" })
  }
  const targets = suppressionTargets(event)
  if (targets.length === 0) return NextResponse.json({ suppressed: 0 })
  const workspaceId = await defaultWorkspaceId()
  if (!workspaceId) return NextResponse.json({ error: "Aucun espace de travail" }, { status: 500 })
  return NextResponse.json({ suppressed: await applySuppressions(workspaceId, targets) })
}
