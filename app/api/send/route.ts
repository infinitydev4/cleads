import { Resend } from "resend"
import { NextResponse } from "next/server"
import { generateInvoiceEmailHtml } from "@/lib/email-templates"

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: Request) {
  try {
    const { invoice, company, attachments } = await request.json()

    const data = await resend.emails.send({
      from: "Cleads <no-reply@cleads.fr>",
      to: invoice.clientEmail,
      subject: `Votre facture ${invoice.number}`,
      html: generateInvoiceEmailHtml(invoice, company),
      attachments,
    })

    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error })
  }
} 