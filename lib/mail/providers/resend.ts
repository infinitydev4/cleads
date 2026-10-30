import { getResend } from "@/lib/resend"
import type { MailProvider, ResolvedMessage } from "../types"

export const resendProvider: MailProvider = {
  id: "resend",
  label: "Resend",
  configured: () => !!process.env.RESEND_API_KEY,
  async send(m: ResolvedMessage) {
    const client = getResend()
    if (!client) throw new Error("RESEND_API_KEY is not set")
    const { data, error } = await client.emails.send({
      from: m.from,
      to: m.to,
      subject: m.subject,
      html: m.html,
      text: m.text,
      replyTo: m.replyTo,
      attachments: m.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
    })
    if (error) throw new Error(error.message)
    return { id: data?.id ?? null }
  },
}
