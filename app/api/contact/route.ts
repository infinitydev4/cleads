import { NextResponse } from "next/server"
import { Resend } from "resend"
import { notifications } from "@/lib/notifications"
import { prisma } from "@/lib/prisma"

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: Request) {
  try {
    const { name, email, subject, message } = await request.json()

    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { error: "Tous les champs sont requis" },
        { status: 400 }
      )
    }

    // Envoyer l'email via Resend
    await resend.emails.send({
      from: "Cleads <contact@cleads.fr>",
      to: "contact@cleads.fr",
      subject: `Nouveau message de contact : ${subject}`,
      html: `
        <h2>Nouveau message de contact</h2>
        <p><strong>Nom :</strong> ${name}</p>
        <p><strong>Email :</strong> ${email}</p>
        <p><strong>Sujet :</strong> ${subject}</p>
        <p><strong>Message :</strong></p>
        <p>${message}</p>
      `,
    })

    // Envoyer une copie au client
    await resend.emails.send({
      from: "Cleads <contact@cleads.fr>",
      to: email,
      subject: "Confirmation de votre message",
      html: `
        <h2>Merci pour votre message</h2>
        <p>Nous avons bien reçu votre message et nous vous répondrons dans les plus brefs délais.</p>
        <p>Cordialement,<br>L'équipe Cleads</p>
      `,
    })

    // Envoyer une notification aux administrateurs
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true },
    })

    for (const admin of admins) {
      await notifications.contactForm(admin.id, {
        name,
        email,
        subject,
        message,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[CONTACT_FORM]", error)
    return NextResponse.json(
      { error: "Erreur lors de l'envoi du message" },
      { status: 500 }
    )
  }
} 